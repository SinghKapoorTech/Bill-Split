/**
 * accountDeletion.ts
 *
 * In-app account deletion, required by App Store Review Guideline 5.1.1(v):
 *
 *   > If your app supports account creation, you must also offer account
 *   > deletion within the app.
 *
 * Apple is explicit that deactivation is not enough and that support flows
 * (email us, call us) do not count. The account record itself must go.
 *
 * ## Why this tombstones rather than purges
 *
 * Divit's data is jointly owned. A bill names two or more people, and
 * `balances/{uid1_uid2}` is a SHARED document the counterparty reads. Purging a
 * departing user and reversing their ledger footprint would retroactively
 * rewrite other people's financial records — a three-way dinner would silently
 * become a two-way split on a bill someone else still has open, and the
 * arithmetic on their saved history would stop adding up.
 *
 * So: the auth account is destroyed, every piece of the user's personal data is
 * stripped, and a minimal non-authenticatable stub remains so counterparties'
 * bills and balances stay correct. The person can never sign in again, which is
 * the test Apple actually applies. See
 * docs/superpowers/specs/2026-09-05-account-deletion-design.md.
 *
 * ## Two orderings that are load-bearing
 *
 * **Events are settled before bills.** Deleting an event cascade-deletes its
 * bills via eventDeleteProcessor. Handing a bill to an heir and *then* deleting
 * the event it belongs to would destroy the bill we just transferred.
 *
 * **The auth user is destroyed before the tombstone is marked complete.** Every
 * Firestore mutation happens first so a mid-flight failure is retryable, but
 * the idempotency guard keys on `authDeleted`, NOT on `isDeleted`. Keying it on
 * `isDeleted` created a zombie: if auth deletion threw, the retry short-circuited
 * on the tombstone and never tried again, leaving a user who could still sign in
 * to a stripped profile — and whose PII `syncUserProfile` then restored.
 */

import { getFirestore, Firestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { defineSecret } from 'firebase-functions/params';
import { revokeAppleToken } from './appleTokenRevocation.js';

const applePrivateKey = defineSecret('APPLE_SIGNIN_PRIVATE_KEY');

/** Firestore caps a batch at 500 writes; leave headroom. */
const BATCH_LIMIT = 400;

/** Page size for unbounded collection scans. */
const PAGE_SIZE = 300;

/**
 * How recently the caller must have re-authenticated, in seconds.
 *
 * The client re-authenticates before calling, but that is advisory — the Admin
 * SDK does not enforce login recency the way the client SDK's `deleteUser`
 * does, so without this check anyone holding an hour-old ID token could destroy
 * the account with no fresh authorization.
 */
const MAX_AUTH_AGE_SECONDS = 10 * 60;

export interface DeleteAccountResult {
  /** False when the account was already fully deleted — the call is idempotent. */
  deleted: boolean;
  billsTransferred: number;
  billsDeleted: number;
  eventsTransferred: number;
  eventsDeleted: number;
  squadsLeft: number;
  squadsDeleted: number;
  recurringBillsDeleted: number;
  appleTokenRevoked: boolean;
}

export interface DeleteAccountDeps {
  /** Injected so integration tests can run without the Auth emulator. */
  deleteAuthUser?: (uid: string) => Promise<void>;
  /** Injected so integration tests can run without the Storage emulator. */
  deleteReceipts?: (uid: string) => Promise<void>;
  /** Apple authorization code from a fresh reauthentication, if applicable. */
  appleAuthorizationCode?: string;
  /** Injected so tests don't call Apple. */
  revokeApple?: (authorizationCode: string) => Promise<void>;
}

const emptyResult = (): DeleteAccountResult => ({
  deleted: false,
  billsTransferred: 0,
  billsDeleted: 0,
  eventsTransferred: 0,
  eventsDeleted: 0,
  squadsLeft: 0,
  squadsDeleted: 0,
  recurringBillsDeleted: 0,
  appleTokenRevoked: false,
});

/** Strips the `user-` prefix the bill `people[]` array uses for linked accounts. */
const toUid = (id: string): string => (id.startsWith('user-') ? id.slice(5) : id);

/**
 * Which of these uids still belong to a live account?
 *
 * Used to pick a new owner for shared bills and events. A tombstone or a shadow
 * user must never inherit ownership — neither can ever sign in to exercise it,
 * which would leave the document permanently uneditable for everyone else.
 */
async function liveUsers(db: Firestore, uids: string[]): Promise<Set<string>> {
  const live = new Set<string>();
  const unique = [...new Set(uids)].filter(Boolean);

  for (let i = 0; i < unique.length; i += 30) {
    const snaps = await Promise.all(
      unique.slice(i, i + 30).map((id) => db.collection('users').doc(id).get())
    );
    for (const snap of snaps) {
      const data = snap.data();
      if (snap.exists && data?.isDeleted !== true && data?.isShadow !== true) {
        live.add(snap.id);
      }
    }
  }

  return live;
}

/**
 * Every uid that might reasonably inherit a bill.
 *
 * Reading `participantIds` alone is not enough, and getting this wrong deletes
 * other people's records:
 *
 *  - **Event bills.** `firestore.rules` grants access to any event member via
 *    `hasEventIdAndMember`, entirely independently of `participantIds`. An
 *    event bill split among unlinked guest names has `participantIds: [leaver]`,
 *    so a participantIds-only heir search would delete a bill the rest of the
 *    trip can see and is using.
 *  - **Legacy bills.** Bills predate `participantIds` — the rules still guard
 *    for its absence. The ledger pipeline derives uids from `people[]` in that
 *    case (`resolveEligibleFriends`), so such a bill genuinely carries a
 *    footprint against a live counterparty.
 */
function billHeirCandidates(billData: FirebaseFirestore.DocumentData, leaver: string): string[] {
  const fromParticipants = ((billData.participantIds ?? []) as string[]).map(toUid);
  const fromPeople = ((billData.people ?? []) as Array<{ id?: string }>)
    .map((p) => toUid(p?.id ?? ''))
    .filter(Boolean);
  const fromMembers = ((billData.members ?? []) as Array<{ userId?: string }>)
    .map((m) => m?.userId ?? '')
    .filter(Boolean);

  return [...new Set([...fromParticipants, ...fromPeople, ...fromMembers])].filter(
    (id) => id && id !== leaver
  );
}

/** Runs `handler` over every document of a query, paging to bound memory. */
async function forEachPage(
  query: FirebaseFirestore.Query,
  handler: (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => Promise<void>
): Promise<number> {
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
  let total = 0;

  for (;;) {
    let page = query.limit(PAGE_SIZE);
    if (cursor) page = page.startAfter(cursor);

    const snap = await page.get();
    if (snap.empty) return total;

    await handler(snap.docs);
    total += snap.size;

    if (snap.size < PAGE_SIZE) return total;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

/**
 * Events the user owns are handed to another member, or deleted if they were
 * alone. Returns the ids of deleted events so bill reassignment can skip their
 * bills — eventDeleteProcessor will cascade those away regardless.
 */
async function reassignOwnedEvents(
  db: Firestore,
  uid: string
): Promise<{ transferred: number; deleted: number; deletedEventIds: Set<string> }> {
  const snap = await db.collection('events').where('ownerId', '==', uid).get();
  const deletedEventIds = new Set<string>();
  let transferred = 0;
  let deleted = 0;

  const candidates = snap.docs.flatMap((d) =>
    ((d.data().memberIds ?? []) as string[]).filter((id) => id !== uid)
  );
  const live = await liveUsers(db, candidates);

  for (const doc of snap.docs) {
    const members = ((doc.data().memberIds ?? []) as string[]).filter((id) => id !== uid);
    const heir = members.find((id) => live.has(id));

    if (heir) {
      await doc.ref.update({
        ownerId: heir,
        memberIds: FieldValue.arrayRemove(uid),
        updatedAt: Timestamp.now(),
      });
      transferred++;
    } else {
      await doc.ref.delete();
      deletedEventIds.add(doc.id);
      deleted++;
    }
  }

  return { transferred, deleted, deletedEventIds };
}

/** Removes the user from events they belong to but do not own. */
async function leaveOtherEvents(db: Firestore, uid: string): Promise<void> {
  const snap = await db.collection('events').where('memberIds', 'array-contains', uid).get();

  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    if (doc.data().ownerId === uid) continue; // handled by reassignOwnedEvents
    batch.update(doc.ref, { memberIds: FieldValue.arrayRemove(uid), updatedAt: Timestamp.now() });
    if (++ops >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
}

/**
 * Bills the departing user owns.
 *
 * Ownership matters because the security rules give the owner full access; a
 * bill whose owner no longer exists is uneditable by anyone. So a bill anyone
 * else can still reach is handed to a live person, and only a genuinely private
 * bill is deleted (which fires ledgerProcessor's footprint reversal).
 *
 * Bills the user merely PARTICIPATES in are left completely alone — they are the
 * counterparty's record, and the balances between them must survive.
 */
async function reassignOwnedBills(
  db: Firestore,
  uid: string,
  deletedEventIds: Set<string>
): Promise<{ transferred: number; deleted: number }> {
  let transferred = 0;
  let deleted = 0;

  await forEachPage(db.collection('bills').where('ownerId', '==', uid), async (docs) => {
    // An event bill can be inherited by any event member, even someone who is
    // not on the bill itself.
    const eventIds = [
      ...new Set(
        docs.map((d) => d.data().eventId as string | undefined).filter((id): id is string => !!id)
      ),
    ].filter((id) => !deletedEventIds.has(id));

    const eventMembers = new Map<string, string[]>();
    for (const eventId of eventIds) {
      const ev = await db.collection('events').doc(eventId).get();
      if (ev.exists) {
        eventMembers.set(
          eventId,
          ((ev.data()?.memberIds ?? []) as string[]).filter((id) => id !== uid)
        );
      }
    }

    const candidateUids = docs.flatMap((d) => [
      ...billHeirCandidates(d.data(), uid),
      ...(eventMembers.get(d.data().eventId as string) ?? []),
    ]);
    const live = await liveUsers(db, candidateUids);

    let batch = db.batch();
    let ops = 0;

    for (const doc of docs) {
      const data = doc.data();
      const eventId = data.eventId as string | undefined;

      // The event is going away and will cascade this bill with it. Touching it
      // here would only hand it to an heir moments before it is destroyed.
      if (eventId && deletedEventIds.has(eventId)) continue;

      const heir =
        billHeirCandidates(data, uid).find((id) => live.has(id)) ??
        (eventMembers.get(eventId ?? '') ?? []).find((id) => live.has(id));

      if (heir) {
        const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
          ownerId: heir,
          updatedAt: Timestamp.now(),
        };

        // The ledger anchors on `paidById || ownerId`, and `ownerId` is a
        // RELEVANT_FIELD, so simply reassigning ownership on a bill that has no
        // explicit payer makes the pipeline reverse the leaver's footprint and
        // re-apply it against the heir — "Bob owes Sarah $30" silently becomes
        // "Bob owes Carol $30". Pinning the anchor to the leaver keeps the debt
        // where it belongs.
        if (!data.paidById) {
          updates.paidById = uid;
        }

        // The leaver's receipt images are about to be deleted from Storage, so
        // the heir would otherwise inherit a permanently broken image link.
        if (data.receiptImageUrl || data.receiptFileName) {
          updates.receiptImageUrl = FieldValue.delete();
          updates.receiptFileName = FieldValue.delete();
        }

        batch.update(doc.ref, updates);
        transferred++;
      } else {
        batch.delete(doc.ref);
        deleted++;
      }

      if (++ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();
  });

  return { transferred, deleted };
}

/**
 * Removes the leaver's Venmo handle from bills other people keep.
 *
 * `people[]` is denormalized onto every bill, so a counterparty would otherwise
 * retain a live payment identifier for a deleted person — and the UI would
 * happily offer to charge them. The name is left in place deliberately (see
 * writeTombstone); a payment handle is a different matter.
 */
async function scrubVenmoFromSharedBills(db: Firestore, uid: string): Promise<void> {
  await forEachPage(
    db.collection('bills').where('participantIds', 'array-contains', uid),
    async (docs) => {
      let batch = db.batch();
      let ops = 0;

      for (const doc of docs) {
        const people = (doc.data().people ?? []) as Array<Record<string, unknown>>;
        let changed = false;

        const scrubbed = people.map((p) => {
          if (toUid(String(p.id ?? '')) === uid && p.venmoId) {
            changed = true;
            const { venmoId, ...rest } = p;
            void venmoId;
            return rest;
          }
          return p;
        });

        if (!changed) continue;

        batch.update(doc.ref, { people: scrubbed });
        if (++ops >= BATCH_LIMIT) {
          await batch.commit();
          batch = db.batch();
          ops = 0;
        }
      }

      if (ops > 0) await batch.commit();
    }
  );
}

/**
 * Squads have no owner — membership is the only relationship, mirrored onto
 * `users/{uid}.squadIds`. So the user leaves each squad, and a squad is only
 * deleted when they were its last member. Deleting every squad in the user's
 * `squadIds` would destroy groups other people are still using.
 */
async function leaveSquads(
  db: Firestore,
  uid: string
): Promise<{ left: number; deleted: number }> {
  const snap = await db.collection('squads').where('memberIds', 'array-contains', uid).get();
  let left = 0;
  let deleted = 0;

  for (const doc of snap.docs) {
    const remaining = ((doc.data().memberIds ?? []) as string[]).filter((id) => id !== uid);

    if (remaining.length === 0) {
      await doc.ref.delete();
      deleted++;
    } else {
      await doc.ref.update({ memberIds: remaining });
      left++;
    }
  }

  return { left, deleted };
}

/** Deletes every document a query returns, paging and batching. */
async function deleteAll(db: Firestore, query: FirebaseFirestore.Query): Promise<number> {
  return forEachPage(query, async (docs) => {
    let batch = db.batch();
    let ops = 0;
    for (const doc of docs) {
      batch.delete(doc.ref);
      if (++ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  });
}

/**
 * Replaces the user document with a tombstone.
 *
 * The first name is retained ON PURPOSE. `UserProfile.friends` holds bare uids
 * and friend rows hydrate from `users/{friendUid}` (getHydratedFriends), so
 * blanking the name turns every counterparty's balance row into an
 * unattributable "??? owes you $23" — while buying almost no privacy, because
 * the name is already denormalized onto each bill's `people[]`.
 *
 * `isShadow` is deliberately NOT set. `claimShadowUser` gates only on that flag
 * and takes its target uid from unvalidated client input, so a tombstone
 * carrying `isShadow` would let anyone who knows a deleted person's uid claim
 * their entire ledger. See tests/integration/claimShadowUser.int.test.ts.
 */
async function writeTombstone(db: Firestore, uid: string, displayName: string): Promise<void> {
  const firstName = (displayName || '').trim().split(/\s+/)[0] || 'Deleted user';

  await db.collection('users').doc(uid).set({
    uid,
    displayName: firstName,
    isDeleted: true,
    deletedAt: Timestamp.now(),
    friends: [],
    squadIds: [],
  });
}

/** Deletes the user's receipt images from Cloud Storage. */
async function deleteReceiptsFromStorage(uid: string): Promise<void> {
  await getStorage().bucket().deleteFiles({ prefix: `receipts/${uid}/` });
}

/**
 * Destroys the auth account, then records that it is gone.
 *
 * `auth/user-not-found` counts as success: it means a previous attempt got
 * there and only the bookkeeping write failed.
 */
async function destroyAuthUser(
  db: Firestore,
  uid: string,
  deleteAuthUser: (uid: string) => Promise<void>
): Promise<void> {
  try {
    await deleteAuthUser(uid);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== 'auth/user-not-found') throw err;
  }

  await db.collection('users').doc(uid).update({ authDeleted: true });
}

export async function deleteAccountCore(
  db: Firestore,
  uid: string,
  deps: DeleteAccountDeps = {}
): Promise<DeleteAccountResult> {
  const result = emptyResult();
  const deleteAuthUser = deps.deleteAuthUser ?? ((id: string) => getAuth().deleteUser(id));

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) return result;

  const existing = userSnap.data() ?? {};

  // Fully done already — genuinely idempotent.
  if (existing.isDeleted === true && existing.authDeleted === true) {
    return result;
  }

  // Data work finished on an earlier attempt but the auth account survived.
  // Retry ONLY that step; redoing the cascade would be wrong and slow.
  if (existing.isDeleted === true) {
    logger.warn('[deleteAccount] resuming: tombstone exists but auth user was not deleted', { uid });
    await destroyAuthUser(db, uid, deleteAuthUser);
    result.deleted = true;
    return result;
  }

  const displayName = (existing.displayName ?? '') as string;

  // Revoke the Apple token FIRST, while the authorization code is still fresh.
  // Apple requires this of apps that support Sign in with Apple and offer
  // deletion. A failure here must not strand the user with an undeletable
  // account, so it is logged and the deletion proceeds.
  const code = deps.appleAuthorizationCode;
  if (code) {
    try {
      await (deps.revokeApple ?? revokeAppleToken)(code);
      result.appleTokenRevoked = true;
    } catch (err) {
      logger.error('[deleteAccount] Apple token revocation failed; continuing', {
        uid,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Events before bills — see the header note on ordering.
  const events = await reassignOwnedEvents(db, uid);
  result.eventsTransferred = events.transferred;
  result.eventsDeleted = events.deleted;
  await leaveOtherEvents(db, uid);

  const bills = await reassignOwnedBills(db, uid, events.deletedEventIds);
  result.billsTransferred = bills.transferred;
  result.billsDeleted = bills.deleted;

  await scrubVenmoFromSharedBills(db, uid);

  const squads = await leaveSquads(db, uid);
  result.squadsLeft = squads.left;
  result.squadsDeleted = squads.deleted;

  // Recurring bills MUST go: left behind, they would keep generating new bills
  // on a schedule for an account that no longer exists.
  result.recurringBillsDeleted = await deleteAll(
    db,
    db.collection('recurring_bills').where('ownerId', '==', uid)
  );

  // Pending settlement requests point at a dead account and can never resolve.
  await deleteAll(
    db,
    db.collection('settlement_requests').where('fromUserId', '==', uid).where('status', '==', 'pending')
  );
  await deleteAll(
    db,
    db.collection('settlement_requests').where('toUserId', '==', uid).where('status', '==', 'pending')
  );

  // Invitations carry the user's email address.
  await deleteAll(db, db.collection('eventInvitations').where('invitedBy', '==', uid));
  if (existing.email) {
    await deleteAll(db, db.collection('eventInvitations').where('email', '==', existing.email));
  }

  // Feedback is kept for product reasons but must stop being attributable.
  const feedback = await db.collection('feedback').where('userId', '==', uid).get();
  for (const doc of feedback.docs) {
    await doc.ref.update({ userId: FieldValue.delete(), anonymizedAt: Timestamp.now() });
  }

  // Receipt photographs are personal data and are not referenced by anyone else.
  try {
    await (deps.deleteReceipts ?? deleteReceiptsFromStorage)(uid);
  } catch (err) {
    logger.error('[deleteAccount] receipt deletion failed; continuing', {
      uid,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await writeTombstone(db, uid, displayName);
  await destroyAuthUser(db, uid, deleteAuthUser);

  result.deleted = true;
  logger.info('[deleteAccount] account deleted', { uid, ...result });
  return result;
}

export const deleteAccount = onCall<{ appleAuthorizationCode?: string }>(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: '512MiB',
    secrets: [applePrivateKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be signed in to delete your account.');
    }

    // The client re-authenticates first, but that is advisory. Enforce it here:
    // the Admin SDK does not require login recency, so without this an old ID
    // token would be enough to destroy the account.
    const authTime = Number(request.auth.token.auth_time ?? 0);
    const ageSeconds = Date.now() / 1000 - authTime;
    if (!authTime || ageSeconds > MAX_AUTH_AGE_SECONDS) {
      throw new HttpsError(
        'failed-precondition',
        'Please sign in again to confirm it is you before deleting your account.'
      );
    }

    return deleteAccountCore(getFirestore(), request.auth.uid, {
      appleAuthorizationCode: request.data?.appleAuthorizationCode,
    });
  }
);
