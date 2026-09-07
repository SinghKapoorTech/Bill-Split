import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { calculatePersonTotals } from '../../shared/calculations.js';
import { validateBillAmounts } from '../../shared/billAmountValidation.js';
import { isEventArchived, type ArchivableEvent } from '../../shared/eventArchive.js';
import {
  getFriendBalanceId,
  calculateFriendFootprint,
  toSingleBalance,
  BALANCE_THRESHOLD,
} from '../../shared/ledgerCalculations.js';

const BILLS_COLLECTION = 'bills';
const EVENTS_COLLECTION = 'events';

/**
 * Normalizes a bill-local person id (`user-<uid>`) to a raw Firebase UID.
 * Person ids arrive in BOTH shapes depending on how the person was added
 * (squad, email lookup and event-member paths all produce the prefixed form),
 * so anything that compares or keys on an identity must normalize first.
 */
function toUid(id: string): string {
  return id.startsWith('user-') ? id.slice(5) : id;
}
const FRIEND_BALANCES_COLLECTION = 'balances';

/**
 * Parameters for the shared bill creation logic.
 */
export interface CreateBillCoreParams {
  billType: string;
  billData: {
    items: { id: string; name: string; price: number }[];
    subtotal: number;
    tax: number;
    tip: number;
    otherFees: number;
    total: number;
    restaurantName?: string;
  };
  people: { id: string; name: string; venmoId?: string }[];
  ownerId: string;
  ownerName: string;
  paidById?: string;
  eventId?: string;
  squadId?: string;
  status?: string;
  splitEvenly?: boolean;
  isSimpleTransaction?: boolean;
  itemAssignments?: Record<string, string[]>;
  /** Extra fields merged into the bill document (e.g. recurringBillId). */
  extraFields?: Record<string, unknown>;
  /**
   * Set ONLY by a caller that has already applied its own archived-event policy.
   *
   * Exists because the two callers need genuinely different FAILURE semantics,
   * not because the check is optional:
   *
   *  - The `createBill` callable is client-reachable and a human is present, so
   *    an unknown fails CLOSED — an unreadable or missing event blocks the write
   *    rather than risking a bill in a closed event.
   *  - `recurringBillProcessor` runs unattended, where SILENCE IS THE WORST
   *    OUTCOME. It pauses a template aimed at an archived event and records
   *    `pausedReason`, but deliberately fails OPEN on a missing event or a
   *    failed read: a rent split that vanishes without explanation is worse
   *    than one that generates into a stale event. That policy is tested in
   *    `recurringArchivedEvent.int.test.ts`.
   *
   * Defaults to enforcing, so any future caller inherits the safe behaviour and
   * has to opt out on purpose.
   */
  eventArchiveAlreadyChecked?: boolean;
  /**
   * Explicit document ID. When supplied the bill is written with `create()`,
   * so a concurrent caller attempting the same ID fails with ALREADY_EXISTS
   * instead of silently minting a duplicate. Used by recurring generation to
   * make each (template, cycle) pair unique by construction.
   */
  billId?: string;
}

/**
 * Shared bill creation logic — atomically creates a bill and updates balances.
 * Used by both the createBill onCall handler and the recurring bill processor.
 */
export async function createBillCore(db: Firestore, params: CreateBillCoreParams): Promise<string> {
  const {
    billType,
    billData,
    people,
    ownerId,
    ownerName,
    paidById,
    eventId,
    squadId,
    status = 'active',
    splitEvenly = false,
    isSimpleTransaction = false,
    itemAssignments = {},
    extraFields = {},
    eventArchiveAlreadyChecked = false,
    billId: explicitBillId,
  } = params;

  // C-01: reject non-finite / negative / absurd money BEFORE it is persisted.
  // createBillCore writes balance docs in the same transaction as the bill, so
  // an unvalidated NaN here reaches a balance doc immediately and bricks the
  // pair permanently (every later threshold check and delta becomes NaN).
  const amountError = validateBillAmounts(billData);
  if (amountError) {
    throw new HttpsError('invalid-argument', `Invalid bill amounts: ${amountError}`);
  }

  // The SERVER-SIDE half of the archive soft-lock (spec §4.2.1). Chunk 2 closed
  // the client routes; this closes the write itself.
  //
  // It lives in the CORE, not in the `createBill` callable, because the core is
  // the single funnel every server-side creation path goes through — the
  // callable, the recurring processor, and anything added later. A check in the
  // callable alone would be bypassed by the next caller someone writes.
  //
  // This is what makes the free-tier group cap mean anything: archiving is what
  // frees a slot, so an archive that still accepts bills reduces the cap to
  // "archive both events, keep using them, create two more".
  //
  // Scoped to CREATION only. Existing bills, their balances, and settling up are
  // untouched — a person must never be blocked from paying someone back.
  if (eventId && !eventArchiveAlreadyChecked) {
    const eventSnap = await db.collection(EVENTS_COLLECTION).doc(eventId).get();
    if (!eventSnap.exists) {
      // Distinct from the archived case on purpose: a deleted event and a closed
      // one are different problems, and reporting "archived" for a dangling id
      // would send someone hunting for an Unarchive button that cannot exist.
      throw new HttpsError('not-found', 'Event not found');
    }
    // `isEventArchived` is the single arbiter across client and server: ONLY a
    // literal `true` archives. A MISSING field means ACTIVE — the state of every
    // event nobody has archived — and a non-boolean truthy value from a bad
    // write must not silently lock an event its owner never closed. Do not
    // inline an `archived === true` check here or anywhere else.
    if (isEventArchived(eventSnap.data() as ArchivableEvent)) {
      throw new HttpsError(
        'failed-precondition',
        'This event is archived and cannot accept new bills. Unarchive it to add bills again.',
      );
    }
  }

  const billRef = explicitBillId
    ? db.collection(BILLS_COLLECTION).doc(explicitBillId)
    : db.collection(BILLS_COLLECTION).doc();
  const billId = billRef.id;
  const now = Timestamp.now();
  // Normalize before use: creditorId keys `balances` doc ids and their
  // `participants` array, so a `user-`-prefixed paidById would mint a corrupt
  // pair doc (e.g. "user-bob_alice") that the ledger pipeline then refuses to
  // maintain, silently stranding the debt.
  const creditorId = toUid(paidById || ownerId);

  // Derive participantIds (normalized UIDs)
  const ids = new Set<string>();
  ids.add(ownerId);
  for (const person of people) {
    const uid = person.id.startsWith('user-') ? person.id.slice(5) : person.id;
    if (uid && !uid.startsWith('guest-') && !uid.startsWith('person-') && uid !== 'anonymous') {
      ids.add(uid);
    }
  }
  const participantIds = Array.from(ids);

  // Calculate totals and initial footprint
  const personTotals = calculatePersonTotals(
    billData,
    people,
    itemAssignments,
    billData.tip,
    billData.tax,
    billData.otherFees ?? 0,
  );

  const linkedFriendUids = new Set(participantIds);
  const newFootprint = calculateFriendFootprint({
    people,
    personTotals,
    settledPersonIds: [],
    linkedFriendUids,
    ownerId,
    creditorId,
  });

  // Balance docs we'll touch (only friends with a non-trivial amount).
  const footprintEntries = Object.entries(newFootprint).filter(
    ([, amount]) => Math.abs(amount) >= BALANCE_THRESHOLD,
  );

  await db.runTransaction(async (tx) => {
    // ── Phase 1: READS ──
    // Firestore requires ALL reads before ANY writes in a transaction, so read
    // every balance doc up front (before writing the bill or the balances).
    const balanceReads: Record<
      string,
      { ref: FirebaseFirestore.DocumentReference; currentBalance: number }
    > = {};
    for (const [friendId] of footprintEntries) {
      const balanceId = getFriendBalanceId(creditorId, friendId);
      const balanceRef = db.collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
      const balanceSnap = await tx.get(balanceRef);
      const existing = balanceSnap.exists ? balanceSnap.data()! : null;
      balanceReads[friendId] = {
        ref: balanceRef,
        currentBalance: (existing?.balance ?? 0) as number,
      };
    }

    // ── Phase 2: WRITES ──
    // 1. Create the bill document
    const billDoc: Record<string, unknown> = {
      id: billId,
      billType,
      status,
      ownerId,
      ...(eventId && { eventId }),
      ...(squadId && { squadId }),
      billData,
      itemAssignments,
      people,
      participantIds,
      unsettledParticipantIds: participantIds,
      splitEvenly,
      isSimpleTransaction,
      paidById: creditorId,
      members: [
        {
          userId: ownerId,
          name: ownerName,
          joinedAt: now,
          isAnonymous: false,
        },
      ],
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      processedBalances: newFootprint,
      // The footprint MUST carry the anchor it was computed under. Without it
      // the bill is born in the "legacy" state ledgerProcessor.ts:273 warns
      // about: the pipeline recomputes an identical footprint, so
      // applyFriendLedger early-returns on empty deltas (:314) before the stamp
      // at :403-407, and the !stage2Wrote branch (:1023) bumps the version
      // without writing the anchor. The bill then keeps a footprint with no
      // reversal locator forever — flagged by the reconciler every day, and
      // silently wrong if the payer is later changed.
      processedBalancesAnchorId: creditorId,
      _ledgerVersion: 1,
      ...extraFields,
    };

    // An explicit ID means the caller is relying on key uniqueness for
    // idempotency — create() rejects a duplicate rather than overwriting it.
    if (explicitBillId) {
      tx.create(billRef, billDoc);
    } else {
      tx.set(billRef, billDoc);
    }

    // 2. Update balances atomically
    for (const [friendId, amount] of footprintEntries) {
      const { ref, currentBalance } = balanceReads[friendId];
      const deltaSingle = toSingleBalance(creditorId, friendId, amount);

      tx.set(
        ref,
        {
          id: ref.id,
          participants: [creditorId, friendId].sort(),
          balance: currentBalance + deltaSingle,
          unsettledBillIds: FieldValue.arrayUnion(billId),
          lastUpdatedAt: now,
          lastBillId: billId,
        },
        { merge: true },
      );
    }
  });

  return billId;
}

export const createBill = onCall(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const {
      billType,
      billData,
      people,
      ownerName,
      paidById,
      eventId,
      squadId,
      status = 'active',
    } = request.data;

    // The caller IS the owner — a client-supplied ownerId is never trusted.
    // createBillCore writes `balances` via the Admin SDK, which bypasses the
    // "server-only" Firestore rule on that collection, so accepting the client's
    // ownerId let any signed-in user mint real debt between arbitrary strangers.
    const ownerId: string = request.auth.uid;

    if (!billData || !people) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }
    if (!Array.isArray(people)) {
      throw new HttpsError('invalid-argument', 'people must be an array');
    }

    // paidById may legitimately differ from the owner ("someone else paid"), but
    // it must be someone actually on the bill — otherwise the ledger anchor can be
    // pointed at a stranger who never agreed to front anything.
    if (paidById) {
      const participants = new Set<string>([ownerId]);
      for (const person of people as Array<{ id?: string }>) {
        if (person?.id) participants.add(toUid(person.id));
      }
      if (!participants.has(toUid(paidById))) {
        throw new HttpsError('permission-denied', 'paidById must be a participant on this bill');
      }
    }

    // Event bills: the caller must actually belong to the event they are filing into.
    if (eventId) {
      const eventSnap = await getFirestore().collection('events').doc(eventId).get();
      if (!eventSnap.exists) {
        throw new HttpsError('not-found', 'Event not found');
      }
      const memberIds: string[] = eventSnap.data()?.memberIds || [];
      if (!memberIds.includes(ownerId)) {
        throw new HttpsError('permission-denied', 'Not a member of this event');
      }
    }

    try {
      const db = getFirestore();
      const billId = await createBillCore(db, {
        billType,
        billData,
        people,
        ownerId,
        ownerName,
        paidById,
        eventId,
        squadId,
        status,
        splitEvenly: request.data.splitEvenly || false,
        isSimpleTransaction: request.data.isSimpleTransaction || false,
      });
      return { billId };
    } catch (error) {
      console.error('Failed to create bill atomically:', error);
      throw new HttpsError('internal', 'Failed to create bill and update ledger.');
    }
  },
);

export const joinBillAsGuest = onCall(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    // Note: No require auth, guests are unauthenticated
    const db = getFirestore();
    const { billId, shareCode, guestName } = request.data;

    if (!billId || !shareCode || !guestName) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    // If the caller is authenticated, use their real UID instead of creating a shadow user
    const callerUid = request.auth?.uid || null;

    const billRef = db.collection(BILLS_COLLECTION).doc(billId);

    return await db.runTransaction(async (tx) => {
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', 'Bill not found');
      }

      const billData = billSnap.data()!;

      // Validate share code
      if (billData.shareCode !== shareCode) {
        throw new HttpsError('permission-denied', 'Invalid share code');
      }

      const now = Timestamp.now();
      if (billData.shareCodeExpiresAt && billData.shareCodeExpiresAt.toMillis() < now.toMillis()) {
        throw new HttpsError('permission-denied', 'Share code expired');
      }

      // Check if authenticated user is already in the bill
      if (callerUid) {
        const existingPeople: Array<{ id: string }> = billData.people || [];
        const alreadyInBill = existingPeople.some(
          (p: { id: string }) => p.id === callerUid || p.id === `user-${callerUid}`,
        );
        if (alreadyInBill) {
          return { userId: callerUid };
        }
      }

      let userId: string;

      if (callerUid) {
        // Authenticated user: use their real UID, no shadow user needed
        userId = callerUid;

        const newMember = {
          userId: callerUid,
          name: guestName,
          ...(request.auth?.token?.email ? { email: request.auth.token.email } : {}),
          joinedAt: now,
          isAnonymous: false,
        };

        const newPerson = {
          id: `user-${callerUid}`,
          name: guestName,
        };

        tx.update(billRef, {
          members: FieldValue.arrayUnion(newMember),
          people: FieldValue.arrayUnion(newPerson),
          participantIds: FieldValue.arrayUnion(callerUid),
          unsettledParticipantIds: FieldValue.arrayUnion(callerUid),
          updatedAt: now,
          lastActivity: now,
        });
      } else {
        // Anonymous guest: create a shadow user
        const ownerId = billData.ownerId;
        const usersRef = db.collection('users');
        const newGuestDoc = usersRef.doc();
        const guestUserId = newGuestDoc.id;
        userId = guestUserId;

        // Ensure a reasonable username based on the guest name
        const username =
          guestName
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '') || 'guest';

        const guestProfile = {
          uid: guestUserId,
          displayName: guestName,
          username: `${username}-${Date.now().toString().slice(-4)}`,
          friends: [],
          squadIds: [],
          createdAt: now,
          lastLoginAt: now,
          isShadow: true,
          createdById: ownerId,
        };

        tx.set(newGuestDoc, guestProfile);

        const newMember = {
          userId: guestUserId,
          name: guestName,
          joinedAt: now,
          isAnonymous: true,
        };

        const newPerson = {
          id: `user-${guestUserId}`,
          name: guestName,
        };

        tx.update(billRef, {
          members: FieldValue.arrayUnion(newMember),
          people: FieldValue.arrayUnion(newPerson),
          participantIds: FieldValue.arrayUnion(guestUserId),
          unsettledParticipantIds: FieldValue.arrayUnion(guestUserId),
          updatedAt: now,
          lastActivity: now,
        });
      }

      return { userId };
    });
  },
);

export const leaveBillAsGuest = onCall(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    // Note: No require auth, guests are unauthenticated
    const db = getFirestore();
    const { billId, shareCode, shadowUserId } = request.data;

    if (!billId || !shareCode || !shadowUserId) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const billRef = db.collection(BILLS_COLLECTION).doc(billId);

    await db.runTransaction(async (tx) => {
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', 'Bill not found');
      }

      const billData = billSnap.data()!;

      // Validate share code
      if (billData.shareCode !== shareCode) {
        throw new HttpsError('permission-denied', 'Invalid share code');
      }

      // Security check: Must be on the bill
      const participantIds = billData.participantIds || [];
      if (!participantIds.includes(shadowUserId)) {
        throw new HttpsError('permission-denied', 'User is not a participant of this bill');
      }

      // Verify the user is actually a shadow user
      const userRef = db.collection('users').doc(shadowUserId);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists && userSnap.data()?.isShadow !== true) {
        throw new HttpsError('permission-denied', 'Cannot delete a standard user account');
      }

      // Clean up the bill document (Remove from people, members, itemAssignments)
      const people = billData.people || [];
      const updatedPeople = people.filter(
        (p: any) => p.id !== shadowUserId && p.id !== `user-${shadowUserId}`,
      );

      const members = billData.members || [];
      const updatedMembers = members.filter((m: any) => m.userId !== shadowUserId);

      const itemAssignments = { ...(billData.itemAssignments || {}) };
      let assignmentsChanged = false;
      for (const [itemId, assignees] of Object.entries(itemAssignments)) {
        const arr = assignees as string[];
        if (arr.includes(shadowUserId) || arr.includes(`user-${shadowUserId}`)) {
          itemAssignments[itemId] = arr.filter(
            (id) => id !== shadowUserId && id !== `user-${shadowUserId}`,
          );
          assignmentsChanged = true;
        }
      }

      const now = Timestamp.now();
      const updates: any = {
        people: updatedPeople,
        members: updatedMembers,
        participantIds: FieldValue.arrayRemove(shadowUserId),
        unsettledParticipantIds: FieldValue.arrayRemove(shadowUserId),
        updatedAt: now,
        lastActivity: now,
      };

      if (assignmentsChanged) {
        updates.itemAssignments = itemAssignments;
      }

      tx.update(billRef, updates);

      // Clean up the shadow user document
      if (userSnap.exists) {
        tx.delete(userRef);
      }
    });

    return { success: true };
  },
);

export const updateGuestName = onCall(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    // Note: No require auth, guests are unauthenticated
    const db = getFirestore();
    const { billId, shareCode, shadowUserId, newName } = request.data;

    if (!billId || !shareCode || !shadowUserId || !newName) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const billRef = db.collection(BILLS_COLLECTION).doc(billId);

    await db.runTransaction(async (tx) => {
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', 'Bill not found');
      }

      const billData = billSnap.data()!;

      // Validate share code
      if (billData.shareCode !== shareCode) {
        throw new HttpsError('permission-denied', 'Invalid share code');
      }

      // Security check: Must be on the bill
      const participantIds = billData.participantIds || [];
      if (!participantIds.includes(shadowUserId)) {
        throw new HttpsError('permission-denied', 'User is not a participant of this bill');
      }

      // Update the user document if they are a shadow user
      const userRef = db.collection('users').doc(shadowUserId);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists && userSnap.data()?.isShadow === true) {
        tx.update(userRef, { displayName: newName });
      }

      // Update the name everywhere in the bill
      const people = billData.people || [];
      const updatedPeople = people.map((p: any) => {
        if (p.id === shadowUserId || p.id === `user-${shadowUserId}`) {
          return { ...p, name: newName };
        }
        return p;
      });

      const members = billData.members || [];
      const updatedMembers = members.map((m: any) => {
        if (m.userId === shadowUserId) {
          return { ...m, name: newName };
        }
        return m;
      });

      tx.update(billRef, {
        people: updatedPeople,
        members: updatedMembers,
        updatedAt: Timestamp.now(),
        lastActivity: Timestamp.now(),
      });
    });

    return { success: true };
  },
);

/**
 * Core of `claimShadowUser`, extracted so the authorization boundary is
 * reachable from integration tests — see
 * `tests/integration/claimShadowUser.int.test.ts`. Mirrors the `createBillCore`
 * / `processSettlementCore` pattern used elsewhere in this package.
 */
export async function claimShadowUserCore(
  db: Firestore,
  realUserId: string,
  shadowUserId: string,
): Promise<{ success: true; claimedBills: number }> {
  if (!shadowUserId) {
    throw new HttpsError('invalid-argument', 'Missing shadowUserId');
  }

  // 1. Verify shadow user exists and is a shadow user
  const shadowUserRef = db.collection('users').doc(shadowUserId);
  const shadowUserSnap = await shadowUserRef.get();

  if (!shadowUserSnap.exists) {
    throw new HttpsError('not-found', 'Shadow user not found');
  }

  const shadowUserData = shadowUserSnap.data();

  if (shadowUserData?.isShadow !== true) {
    throw new HttpsError('permission-denied', 'Cannot claim a standard user account');
  }

  // A deleted account leaves a tombstone behind: no auth user, PII stripped,
  // but still referenced by counterparties' bills and balances. That is
  // structurally indistinguishable from a shadow user, so if a tombstone ever
  // carries `isShadow` — by design or by a later edit — the check above would
  // hand the deleted person's entire ledger to whoever guessed their uid.
  //
  // The shipped tombstone deliberately does NOT set `isShadow` (see
  // docs/superpowers/specs/2026-09-05-account-deletion-design.md §3). This is
  // the belt-and-braces half of that decision, and the reason it is not merely
  // defensive is that `shadowUserId` is unvalidated client input.
  if (shadowUserData?.isDeleted === true) {
    throw new HttpsError('permission-denied', 'Cannot claim a deleted account');
  }

  // 2. Find all bills where the shadow user is a participant
  const billsSnapshot = await db
    .collection(BILLS_COLLECTION)
    .where('participantIds', 'array-contains', shadowUserId)
    .get();

  // 3. Update all bills in a batch
  const batch = db.batch();

  billsSnapshot.docs.forEach((docSnap) => {
    const billData = docSnap.data();
    const billRef = docSnap.ref;

    // Update participantIds and unsettledParticipantIds
    let participantIds = billData.participantIds || [];
    if (participantIds.includes(shadowUserId)) {
      participantIds = participantIds.filter((id: string) => id !== shadowUserId);
      if (!participantIds.includes(realUserId)) participantIds.push(realUserId);
    }

    let unsettledParticipantIds = billData.unsettledParticipantIds || [];
    if (unsettledParticipantIds.includes(shadowUserId)) {
      unsettledParticipantIds = unsettledParticipantIds.filter((id: string) => id !== shadowUserId);
      if (!unsettledParticipantIds.includes(realUserId)) unsettledParticipantIds.push(realUserId);
    }

    let settledPersonIds = billData.settledPersonIds || [];
    if (settledPersonIds.includes(shadowUserId)) {
      settledPersonIds = settledPersonIds.filter((id: string) => id !== shadowUserId);
      if (!settledPersonIds.includes(realUserId)) settledPersonIds.push(realUserId);
    }

    // Update members
    const members = billData.members || [];
    const updatedMembers = members.map((m: any) => {
      if (m.userId === shadowUserId) {
        return { ...m, userId: realUserId, isAnonymous: false }; // clear anonymous flag
      }
      return m;
    });

    // Update people
    const people = billData.people || [];
    const updatedPeople = people.map((p: any) => {
      if (p.id === shadowUserId || p.id === `user-${shadowUserId}`) {
        // Migrate shadow ID to real user's prefixed ID
        return { ...p, id: `user-${realUserId}` };
      }
      return p;
    });

    // Deduplicate people matching by exact ID
    const uniquePeopleMap = new Map();
    updatedPeople.forEach((p: any) => {
      if (!uniquePeopleMap.has(p.id)) {
        uniquePeopleMap.set(p.id, p);
      }
    });
    const finalPeople = Array.from(uniquePeopleMap.values());

    // Deduplicate members matching by exact userId
    const uniqueMembersMap = new Map();
    updatedMembers.forEach((m: any) => {
      if (!uniqueMembersMap.has(m.userId)) {
        uniqueMembersMap.set(m.userId, m);
      }
    });
    const finalMembers = Array.from(uniqueMembersMap.values());

    // Update itemAssignments
    const itemAssignments = { ...(billData.itemAssignments || {}) };
    let assignmentsChanged = false;
    for (const [itemId, assignees] of Object.entries(itemAssignments)) {
      const arr = assignees as string[];
      if (arr.includes(shadowUserId) || arr.includes(`user-${shadowUserId}`)) {
        // Remove shadow id, add real id (avoiding duplicates)
        const newArr = arr.filter((id) => id !== shadowUserId && id !== `user-${shadowUserId}`);
        if (!newArr.includes(realUserId) && !newArr.includes(`user-${realUserId}`)) {
          newArr.push(`user-${realUserId}`); // Use user- prefix for item assignments consistently
        }
        itemAssignments[itemId] = newArr;
        assignmentsChanged = true;
      }
    }

    const updates: any = {
      participantIds,
      unsettledParticipantIds,
      settledPersonIds,
      members: finalMembers,
      people: finalPeople,
      updatedAt: Timestamp.now(),
      lastActivity: Timestamp.now(),
    };

    // Handle paidById if the guest was marked as payer.
    // A-08: store the RAW uid. `createBill` normalizes via toUid(), so this
    // was the one server path that re-introduced a `user-` prefix into the
    // field the ledger anchors on — and a prefixed anchor is rejected by
    // isWritableBalancePair, silently erasing the claimed user's debt.
    if (billData.paidById === shadowUserId || billData.paidById === `user-${shadowUserId}`) {
      updates.paidById = realUserId;
    }

    if (assignmentsChanged) {
      updates.itemAssignments = itemAssignments;
    }

    batch.update(billRef, updates);
  });

  // 4. Delete the shadow user profile
  batch.delete(shadowUserRef);

  // 5. Commit all changes
  // Firestore batch limits to 500 operations. Highly unlikely a shadow user is on >499 bills,
  // plus 1 delete = max 499 bills.
  await batch.commit();

  return { success: true, claimedBills: billsSnapshot.size };
}

export const claimShadowUser = onCall(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to claim a shadow user');
    }

    return claimShadowUserCore(getFirestore(), request.auth.uid, request.data?.shadowUserId);
  },
);
