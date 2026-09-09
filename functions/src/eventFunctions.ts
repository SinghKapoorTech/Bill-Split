import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { isEventArchived, type ArchivableEvent } from '../../shared/eventArchive.js';
import type { CapErrorDetails } from '../../shared/capErrors.js';
import { getMonetizationLimits } from './remoteConfigLimits.js';
import { getEffectiveEntitlement } from './entitlementService.js';

/**
 * Event creation and unarchiving, moved SERVER-SIDE so the free-tier group cap
 * can be enforced at all (spec §4.2.1, §5.4).
 *
 * WHY A CALLABLE RATHER THAN A SECURITY RULE: the cap is "at most N *active*
 * events you own", which requires COUNTING documents. Firestore rules cannot
 * run an aggregation query — they can only inspect the document at hand — so
 * there is no rule that expresses this. Events were previously created with a
 * direct client `addDoc` and unarchived with a direct `updateDoc`; both paths
 * are now closed in firestore.rules and routed through here, mirroring how
 * `createBill` already works.
 *
 * WHAT IS *NOT* GATED, and must never be: reading, editing, adding bills to,
 * and SETTLING an existing event. The cap blocks creating and unarchiving only.
 * A user who is over the limit — say a Trip Pass expired — keeps full access to
 * everything they already have (spec §4.2.1, §7).
 *
 * ARCHIVING IS NEVER GATED AND STAYS A DIRECT CLIENT WRITE. It frees a slot, it
 * is the free escape hatch the paywall must offer before payment (spec §4.3.1),
 * and blocking it could never be correct — the person most likely to be at the
 * cap with unsettled balances is exactly the person who must be able to archive.
 * Only *un*archiving is gated, because archive → create → unarchive would
 * otherwise bypass the cap in three taps.
 *
 * Every relative import ends in `.js` — see remoteConfigLimits.ts for why.
 */

const EVENTS_COLLECTION = 'events';

/**
 * Counts the caller's OWNED, ACTIVE events.
 *
 * COUNTED BY SUBTRACTION, NOT BY `where('archived','==',false)`.
 * Firestore does not match documents that are MISSING a field, so an equality
 * query on `archived` silently skips every event written before the archive
 * feature — under-counting, and letting a user sail past the cap. Spec §6.5
 * argues the equality form becomes safe once the database is wiped and
 * `archived: false` is written at creation (which `createEvent` below now
 * does), but "the database will be wiped" is a future event and a cap that is
 * wrong for one release is a cap that does not exist. The subtraction is
 * correct under both regimes for two cheap aggregation reads.
 * `shared/eventArchive.ts` carries the same warning.
 *
 * DELIBERATELY NOT A STORED COUNTER (spec §4.2.1). This repo has already been
 * burned by derived state drifting badly enough to need a nightly reconciler
 * (`scheduledLedgerReconcile`); a group counter is the same class of bug, and
 * these counts are small enough that querying is trivially cheap.
 *
 * KNOWN AND ACCEPTED: counting then creating is not atomic, so two `createEvent`
 * calls racing at the limit can both pass and yield one group over the cap.
 * Closing it would need either the stored counter this design rejects, or a
 * transaction over a query, which Firestore does not offer. The overshoot is
 * bounded by how many events a person can deliberately create at the same
 * instant, each one a separate intentional action — unlike the scan quota,
 * where the same race was worth fixing because a script can trivially fire N
 * scans at once. Every later create or unarchive sees the true count and blocks.
 */
export async function countOwnedActiveEvents(db: Firestore, uid: string): Promise<number> {
  const owned = db.collection(EVENTS_COLLECTION).where('ownerId', '==', uid);

  const [totalSnap, archivedSnap] = await Promise.all([
    owned.count().get(),
    owned.where('archived', '==', true).count().get(),
  ]);

  const total = totalSnap.data().count;
  const archived = archivedSnap.data().count;

  // Clamped: the two aggregations are not a consistent snapshot of each other,
  // so a write landing between them could otherwise yield a negative count.
  return Math.max(0, total - archived);
}

export interface GroupCapDecision {
  allowed: boolean;
  activeCount: number;
  limit: number;
  /** True when the cap WOULD have blocked but enforcement is dark. */
  wouldBlock: boolean;
}

/**
 * The cap decision itself, with every input already resolved.
 *
 * Pure and separated from the I/O above so the DARK-LAUNCH behaviour is
 * directly testable — that switch is the difference between a silent
 * measurement and locking real users out of their own groups, and it must not
 * be provable only by inspection.
 *
 * `activeCount` of -1 means "not counted" (an unlimited plan, or a failed
 * count); it can never block.
 */
export function decideGroupCap(
  activeCount: number,
  limit: number,
  unlimited: boolean,
  paywallEnabled: boolean,
): GroupCapDecision {
  if (unlimited || activeCount < 0) {
    return { allowed: true, activeCount, limit, wouldBlock: false };
  }

  const wouldBlock = activeCount >= limit;

  return {
    // DARK: `wouldBlock` is recorded, but only `paywallEnabled` can turn it into
    // a refusal. This is what lets the whole path — aggregation cost, index
    // behaviour, error handling — run in production before it can hurt anyone.
    allowed: !wouldBlock || !paywallEnabled,
    activeCount,
    limit,
    wouldBlock,
  };
}

/**
 * Evaluates the owned-active-group cap for `uid`.
 *
 * DARK BY DEFAULT. While `paywall_enabled` is false the cap is computed and
 * logged but never enforced, so the whole path runs in production — including
 * the aggregation cost and any index problem — before it can lock anyone out
 * (spec §5.2). Flipping the Remote Config key is what turns it on.
 *
 * FAILS OPEN. A Remote Config outage, a Firestore error, or a missing index
 * must not stop people creating events. This is a business cap, not a security
 * control: over-permitting costs a fraction of a cent, over-blocking costs users.
 */
async function evaluateGroupCap(db: Firestore, uid: string): Promise<GroupCapDecision> {
  // Parallel: these are independent, and both sit on the hot path.
  const [limits, entitlement] = await Promise.all([
    getMonetizationLimits(),
    getEffectiveEntitlement(uid),
  ]);

  // Pro and Trip Pass both lift the caps. Skip the aggregation entirely — a
  // paying user should never pay a latency cost for a limit that cannot apply.
  let activeCount = -1;
  if (!entitlement.unlimited) {
    try {
      activeCount = await countOwnedActiveEvents(db, uid);
    } catch (error) {
      logger.error('eventFunctions: active-group count failed, allowing', {
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
      activeCount = -1;
    }
  }

  const decision = decideGroupCap(
    activeCount,
    limits.freeActiveGroups,
    entitlement.unlimited,
    limits.paywallEnabled,
  );

  if (decision.wouldBlock && !limits.paywallEnabled) {
    // The dark-launch signal. This line is how the cap is tuned before it is
    // ever enforced: it says how many real users would have hit it.
    logger.info('eventFunctions: group cap would block (enforcement dark)', {
      uid,
      activeCount,
      limit: limits.freeActiveGroups,
      plan: entitlement.plan,
    });
  }

  return decision;
}

/**
 * The wall copy. Spec §4.3.1 is explicit that ARCHIVE COMES FIRST: a wall that
 * only offers payment when a free escape exists is a dark pattern, users notice,
 * and it costs more trust than the conversion is worth. It is also
 * self-defeating — someone who repeatedly archives to stay under the cap is
 * demonstrating exactly the usage that converts on its own.
 */
export function capMessage(activeCount: number, limit: number): string {
  const escape = `Archive one you're finished with, or go unlimited with Pro.`;

  // Built from the ACTUAL count, not from the limit. Those two are equal at the
  // boundary, which is the only case the spec's example shows — but they come
  // apart for real users, and telling someone with five groups that they have
  // two is both false and confusing.
  //
  // Being over the cap is not an edge case, it is the GUARANTEED state of the
  // dark launch: while `paywall_enabled` is false every gate permits, so users
  // accumulate freely, and the day the switch flips some of them are already
  // past the limit. They keep everything they have — the cap gates creation and
  // unarchiving only (spec §4.2.1, §7) — but the wall they meet has to be true.
  if (activeCount > limit) {
    return `You have ${activeCount} active groups, and the free plan includes ${limit}. ${escape}`;
  }
  return `You have ${limit} active groups. ${escape}`;
}

// Exported for `tests/integration/capErrorDetails.int.test.ts`, which asserts
// the `details` payload directly. Not part of the callable surface.
export async function assertGroupSlotAvailable(db: Firestore, uid: string): Promise<void> {
  const decision = await evaluateGroupCap(db, uid);
  if (decision.allowed) return;
  throw new HttpsError(
    'resource-exhausted',
    capMessage(decision.activeCount, decision.limit),
    // `activeCount` can legitimately EXCEED `limit` — see capMessage above. The
    // client must render the real count, not assume activeCount === limit.
    {
      reason: 'group-cap',
      activeCount: decision.activeCount,
      limit: decision.limit,
    } satisfies CapErrorDetails,
  );
}

/**
 * Creates an event, subject to the owned-active-group cap.
 *
 * The caller is ALWAYS the owner and is always a member — a client-supplied
 * ownerId is never trusted, exactly as in `createBill`.
 */
export const createEvent = onCall(
  { cors: true, timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    const uid = request.auth.uid;
    const db = getFirestore();

    const name = typeof request.data?.name === 'string' ? request.data.name.trim() : '';
    if (!name) {
      throw new HttpsError('invalid-argument', 'Event name is required');
    }
    const description =
      typeof request.data?.description === 'string' ? request.data.description.trim() : '';

    // Bounded: this is now a server entry point, and the bound is free. The old
    // client `addDoc` path had none, so this is a tightening, not a regression.
    const MAX_MEMBERS = 100;
    const rawMembers = Array.isArray(request.data?.memberIds)
      ? request.data.memberIds.slice(0, MAX_MEMBERS)
      : [];
    const memberIds = Array.from(
      new Set([
        uid,
        ...rawMembers.filter((m: unknown): m is string => typeof m === 'string' && !!m),
      ]),
    );

    const rawInvites = Array.isArray(request.data?.pendingInvites)
      ? request.data.pendingInvites.slice(0, MAX_MEMBERS)
      : [];
    const pendingInvites = Array.from(
      new Set(
        rawInvites.filter((e: unknown): e is string => typeof e === 'string' && e.includes('@')),
      ),
    );

    await assertGroupSlotAvailable(db, uid);

    const now = Timestamp.now();
    const ref = await db.collection(EVENTS_COLLECTION).add({
      name,
      description,
      ownerId: uid,
      memberIds,
      pendingInvites,
      // Written EXPLICITLY at creation (spec §6.5) so the data is unambiguous
      // from day one. The count above still uses subtraction rather than relying
      // on this, because documents created before this line exist.
      archived: false,
      createdAt: now,
      updatedAt: now,
    });

    return { eventId: ref.id };
  },
);

/**
 * Unarchives an event, subject to the SAME cap as creation.
 *
 * Without this the cap is bypassable in three taps: archive A, create C,
 * unarchive A (spec §4.2.1).
 *
 * Balances are untouched in both directions — archiving and unarchiving are a
 * flag on the event document and nothing else. No Cloud Function triggers on
 * event updates, so an unarchived event keeps every balance it had.
 */
export const unarchiveEvent = onCall(
  { cors: true, timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    const uid = request.auth.uid;
    const eventId = typeof request.data?.eventId === 'string' ? request.data.eventId : '';
    if (!eventId) {
      throw new HttpsError('invalid-argument', 'eventId is required');
    }

    const db = getFirestore();
    const ref = db.collection(EVENTS_COLLECTION).doc(eventId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    // Owner-only, matching archive. An event being over is a shared fact, not a
    // per-person preference.
    if (snap.data()?.ownerId !== uid) {
      throw new HttpsError('permission-denied', 'Only the event owner can unarchive it');
    }

    // Already active: succeed without consuming a cap check. Re-running the cap
    // on a no-op could refuse an operation that changes nothing, which would be
    // both confusing and wrong — the user is not gaining a slot.
    if (!isEventArchived(snap.data() as ArchivableEvent)) {
      return { eventId, alreadyActive: true };
    }

    await assertGroupSlotAvailable(db, uid);

    await ref.update({
      archived: false,
      // REMOVED, not set false: a stale timestamp left behind would keep
      // claiming the event is archived to anything that reads it.
      archivedAt: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });

    return { eventId, alreadyActive: false };
  },
);
