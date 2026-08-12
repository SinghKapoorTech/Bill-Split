/**
 * ledgerProcessor.ts
 *
 * Cloud Function: Firestore onDocumentWritten trigger on bills/{billId}
 *
 * The heart of the ledger pipeline. When a bill is created, updated, or deleted:
 *   Stage 1: Validate & calculate personTotals from trusted server-side data
 *   Stage 2: Apply single-balance delta to balances (authoritative, in transaction)
 *   Stage 3: Apply single-balance delta to event_balances per-pair docs (in transaction)
 *
 * Balance schema (same for balances and event_balances):
 *   { balance: number, unsettledBillIds: string[], participants: [uid1, uid2] }
 *   balance > 0 → participants[0] (alphabetically smaller UID) is owed
 *   balance < 0 → participants[1] is owed
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';
import { computeBillPersonTotals } from '../../shared/calculations.js';
import {
  getFriendBalanceId,
  getEventBalanceId,
  calculateFriendFootprint,
  toSingleBalance,
  BALANCE_THRESHOLD,
  isWritableBalancePair,
  sanitizeFootprint,
  isBalanceSettledConsistent,
  personIdToFirebaseUid,
} from '../../shared/ledgerCalculations.js';
import type { PersonTotal, BillData } from '../../shared/types.js';

let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'balances';
const EVENT_BALANCES_COLLECTION = 'event_balances';

// Fields that require pipeline re-processing when changed.
// processedBalances and _ledgerVersion are excluded to prevent infinite loops.
const RELEVANT_FIELDS = [
  'billData',
  'people',
  'itemAssignments',
  'settledPersonIds',
  'paidById',
  'splitEvenly',
  'ownerId',
  'eventId',
  '_friendScanTrigger',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Key-order-stable JSON serialization for deep comparison.
 * Prevents false positives/negatives from object key insertion order differences.
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  return (
    '{' + sortedKeys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',') + '}'
  );
}

function hasRelevantChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  for (const field of RELEVANT_FIELDS) {
    if (stableStringify(before[field]) !== stableStringify(after[field])) {
      return true;
    }
  }
  return false;
}

async function resolveEligibleFriends(
  anchorId: string,
  ownerId: string,
  billParticipants: string[],
  billPeople: Array<{ id: string }> = [],
): Promise<Set<string>> {
  const linked = new Set<string>();

  // 1. Add from pre-computed participantIds (real Firebase UIDs)
  if (billParticipants && billParticipants.length > 0) {
    for (const id of billParticipants) {
      linked.add(id);
    }
  }

  // 2. Add from people array (extracting real Firebase UIDs)
  // This acts as a fallback/sync in case participantIds specifically is out of sync.
  if (billPeople && billPeople.length > 0) {
    for (const person of billPeople) {
      const uid = person.id.startsWith('user-') ? person.id.slice(5) : person.id;
      // Filter out guest IDs, ephemeral person IDs, and anonymous IDs (legacy)
      if (uid && !uid.startsWith('guest-') && !uid.startsWith('person-') && uid !== 'anonymous') {
        linked.add(uid);
      }
    }
  }

  // 3. Fallback to anchor/owner if still empty
  if (linked.size === 0) {
    linked.add(anchorId);
    linked.add(ownerId);
  }

  // 4. Also include any shadow users created by the owner OR anchor
  // (though they should already be in participantIds/people)
  const shadowQuery = await db()
    .collection('users')
    .where('isShadow', '==', true)
    .where('createdById', 'in', [ownerId, anchorId])
    .get();

  shadowQuery.forEach((doc) => {
    linked.add(doc.id);
  });

  return linked;
}

function computePersonTotals(bill: Record<string, unknown>): PersonTotal[] {
  const billData = bill.billData as BillData;
  const people = (bill.people as Array<{ id: string; name: string }>) || [];

  // Shared single source of truth — handles splitEvenly by expanding full
  // assignments so tax/tip/fees distribute proportionally and shares sum
  // exactly to the bill total (no per-share rounding drift).
  return computeBillPersonTotals(
    billData,
    people,
    (bill.itemAssignments as Record<string, string[]>) || {},
    Boolean(bill.splitEvenly),
  );
}

/**
 * Strips zero-value entries from a footprint for storage.
 */
function stripZeros(footprint: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(footprint)) {
    if (Math.abs(v) > BALANCE_THRESHOLD) result[k] = v;
  }
  return result;
}

/**
 * Computes non-zero deltas between two footprints.
 */
function computeDeltas(
  newFootprint: Record<string, number>,
  oldFootprint: Record<string, number>,
): Record<string, number> {
  const allIds = new Set([...Object.keys(oldFootprint), ...Object.keys(newFootprint)]);
  const deltas: Record<string, number> = {};
  for (const id of allIds) {
    const delta = (newFootprint[id] || 0) - (oldFootprint[id] || 0);
    if (Math.abs(delta) > BALANCE_THRESHOLD) deltas[id] = delta;
  }
  return deltas;
}

// ─── Stage 2: Friend Ledger (authoritative, single balance) ─────────────────

/**
 * A planned mutation to one balance doc, composed from up to two sources:
 * the old anchor's reversal and the new anchor's delta.
 *
 * Firestore transactions require ALL reads to precede ALL writes, and when
 * the anchor flips within the same pair (e.g. paidById alice → bob on an
 * alice+bob bill) the reversal doc and the new-delta doc are the SAME
 * document — so both effects must be composed into a single per-doc write
 * whose balance is computed from one pre-composition read.
 */
interface PlannedBalanceOp {
  participants: string[];
  /** Reversal contribution — applied only if the idempotency guard passes at read time. */
  reversalDelta: number;
  hasReversal: boolean;
  /** New-footprint delta contribution (single-balance sign convention). */
  newDelta: number;
  hasNewDelta: boolean;
  /** true → arrayUnion(billId); false → arrayRemove(billId). New footprint's op wins. */
  addBillId: boolean;
  /** Event pair docs carry an eventId field. */
  eventId?: string;
}

function getPlanEntry(
  plan: Map<string, PlannedBalanceOp>,
  docId: string,
  participants: string[],
  eventId?: string,
): PlannedBalanceOp {
  let entry = plan.get(docId);
  if (!entry) {
    entry = {
      participants,
      reversalDelta: 0,
      hasReversal: false,
      newDelta: 0,
      hasNewDelta: false,
      addBillId: false,
      ...(eventId && { eventId }),
    };
    plan.set(docId, entry);
  }
  return entry;
}

async function applyFriendLedger(
  billId: string,
  linkedFriendUids: Set<string>,
  payloadPreviousAnchorId?: string,
): Promise<number> {
  const billRef = db().collection(BILLS_COLLECTION).doc(billId);
  let deltasApplied = 0;

  await db().runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) return;

    const billData = billSnap.data()!;

    // ── Recompute the footprint from FRESH committed bill state ──
    // The applied amounts and the anchor come from the freshly-read bill, not
    // the trigger payload, so a redelivered/out-of-order SUPERSEDED write can't
    // apply stale amounts (its payload described an older bill state).
    const ownerId: string = billData.ownerId;
    // A-08: normalize the anchor. `paidById` reaches Firestore from client
    // writes that bypass `createBill`'s toUid() (PaidByBanner emits the
    // `user-`-prefixed person.id), and `isWritableBalancePair` rejects prefixed
    // ids — so an un-normalized anchor makes the pipeline reverse the old
    // footprint and silently decline to write the new one, erasing the debt.
    const anchorId: string = personIdToFirebaseUid(billData.paidById || ownerId);
    const people = (billData.people as Array<{ id: string; name: string }>) || [];
    const personTotals = computeBillPersonTotals(
      billData.billData as BillData,
      people,
      (billData.itemAssignments as Record<string, string[]>) || {},
      Boolean(billData.splitEvenly),
    );
    const newFootprint = calculateFriendFootprint({
      people,
      personTotals,
      settledPersonIds: (billData.settledPersonIds as string[]) || [],
      linkedFriendUids,
      ownerId,
      creditorId: anchorId,
    });

    // ── Phase 0: Decide reversal/force-clear from FRESH bill state ──
    // Trigger delivery is at-least-once: the anchor-flip decision must come
    // from the committed footprint's own anchor, not the event payload —
    // otherwise a redelivered flip event re-applies the reversal + full delta.
    // Legacy bills without processedBalancesAnchorId fall back to the
    // payload's before-anchor (their footprint was written under it).
    const storedFootprint: Record<string, number> = billData.processedBalances || {};
    if (!billData.processedBalancesAnchorId && Object.keys(storedFootprint).length > 0) {
      logger.warn(
        'ledger: processing bill with footprint but no processedBalancesAnchorId (legacy — reconciler should backfill)',
        { billId },
      );
    }
    const storedAnchorId: string =
      billData.processedBalancesAnchorId ?? payloadPreviousAnchorId ?? anchorId;

    let reversal: { oldAnchorId: string; oldFootprint: Record<string, number> } | undefined;
    let previousBalances: Record<string, number> = storedFootprint;
    if (storedAnchorId !== anchorId) {
      if (Object.keys(storedFootprint).length > 0) {
        reversal = {
          oldAnchorId: storedAnchorId,
          oldFootprint: storedFootprint,
        };
      }
      previousBalances = {};
    }

    // Reversal (if anchor changed) is done inside this transaction to prevent
    // partial-reversal corruption, and composed per-doc with the new deltas so
    // every read happens before every write (Firestore transaction rule).
    const plan = new Map<string, PlannedBalanceOp>();

    if (reversal) {
      const { oldAnchorId, oldFootprint } = reversal;
      for (const [friendId, amount] of Object.entries(oldFootprint)) {
        if (Math.abs(amount) < BALANCE_THRESHOLD) continue;
        if (!isWritableBalancePair(oldAnchorId, friendId)) continue;
        const balanceId = getFriendBalanceId(oldAnchorId, friendId);
        const entry = getPlanEntry(plan, balanceId, [oldAnchorId, friendId].sort());
        entry.reversalDelta += toSingleBalance(oldAnchorId, friendId, -amount);
        entry.hasReversal = true;
      }
    }

    // ── Phase 1: Compute deltas for new anchor ──
    const deltas = computeDeltas(newFootprint, previousBalances);

    if (Object.keys(deltas).length === 0 && !reversal) return;

    for (const friendId of Object.keys(deltas)) {
      if (!isWritableBalancePair(anchorId, friendId)) {
        logger.warn('ledger: skipping non-writable balance pair', {
          billId,
          anchorId,
          id: friendId,
        });
        continue;
      }
      const balanceId = getFriendBalanceId(anchorId, friendId);
      const entry = getPlanEntry(plan, balanceId, [anchorId, friendId].sort());
      // Convert anchor-relative delta to single-balance sign convention
      entry.newDelta += toSingleBalance(anchorId, friendId, deltas[friendId]);
      entry.hasNewDelta = true;
      // Track unsettled bills — supersedes the reversal's arrayRemove on a shared doc
      entry.addBillId = Math.abs(newFootprint[friendId] ?? 0) > BALANCE_THRESHOLD;
    }

    // ── Phase 1b: Read every involved balance doc (all reads precede all writes) ──
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const balanceId of plan.keys()) {
      const ref = db().collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[balanceId] = ref;
      balanceSnaps[balanceId] = await tx.get(ref);
    }

    // ── Phase 2: Emit exactly one write per doc, composing reversal + delta ──
    const now = Timestamp.now();
    for (const [balanceId, entry] of plan) {
      const ref = balanceRefs[balanceId];
      const snap = balanceSnaps[balanceId];
      const existing = snap.exists ? snap.data()! : null;
      const currentBalance: number = (existing?.balance ?? 0) as number;

      // Idempotency guard: only apply the reversal if this bill is still
      // recorded on the doc (already-reversed / missing docs are skipped).
      let totalDelta = entry.newDelta;
      let reversalApplied = false;
      if (entry.hasReversal) {
        const unsettledBillIds: string[] = existing?.unsettledBillIds || [];
        if (snap.exists && unsettledBillIds.includes(billId)) {
          totalDelta += entry.reversalDelta;
          reversalApplied = true;
        }
      }

      // Reversal-only doc whose guard failed: nothing to write.
      if (!entry.hasNewDelta && !reversalApplied) continue;

      const addBillId = entry.hasNewDelta && entry.addBillId;
      const billIdUpdate = addBillId
        ? { unsettledBillIds: FieldValue.arrayUnion(billId) }
        : { unsettledBillIds: FieldValue.arrayRemove(billId) };

      // Invariant check (observability only): a near-zero balance must have no
      // unsettled bills, and a non-zero balance must have at least one.
      const existingBills: string[] = existing?.unsettledBillIds || [];
      const resultingBills = addBillId
        ? Array.from(new Set([...existingBills, billId]))
        : existingBills.filter((id) => id !== billId);
      if (!isBalanceSettledConsistent(currentBalance + totalDelta, resultingBills)) {
        logger.error('ledger: balance/unsettled invariant violated', {
          billId,
          balanceId,
          balance: currentBalance + totalDelta,
          unsettledCount: resultingBills.length,
        });
      }

      tx.set(
        ref,
        {
          id: ref.id,
          participants: entry.participants,
          balance: currentBalance + totalDelta,
          ...billIdUpdate,
          lastUpdatedAt: now,
          lastBillId: billId,
        },
        { merge: true },
      );
    }

    // Save footprint (with the anchor it was computed under) and bump version
    const currentVersion: number = billData._ledgerVersion ?? 0;
    tx.update(billRef, {
      processedBalances: sanitizeFootprint(stripZeros(newFootprint), anchorId),
      processedBalancesAnchorId: anchorId,
      _ledgerVersion: currentVersion + 1,
    });
    deltasApplied = Object.keys(deltas).length;
  });

  return deltasApplied;
}

export async function reverseFootprint(
  billId: string,
  anchorId: string,
  previousBalances: Record<string, number>,
): Promise<void> {
  await db().runTransaction(async (tx) => {
    const friendsToReverse: string[] = [];
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const [friendId, amount] of Object.entries(previousBalances)) {
      if (Math.abs(amount) < BALANCE_THRESHOLD) continue;
      friendsToReverse.push(friendId);

      const balanceId = getFriendBalanceId(anchorId, friendId);
      const ref = db().collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[friendId] = ref;
      balanceSnaps[friendId] = await tx.get(ref);
    }

    const now = Timestamp.now();
    for (const friendId of friendsToReverse) {
      const amount = previousBalances[friendId];
      const ref = balanceRefs[friendId];
      const snap = balanceSnaps[friendId];
      if (!snap.exists) continue;

      const existing = snap.data()!;

      // Idempotency: skip if this bill was already reversed
      const unsettledBillIds: string[] = existing.unsettledBillIds || [];
      if (!unsettledBillIds.includes(billId)) continue;

      const currentBalance: number = (existing?.balance ?? 0) as number;

      // Reverse: subtract the single-balance equivalent
      const reversalDelta = toSingleBalance(anchorId, friendId, -amount);

      tx.set(
        ref,
        {
          id: ref.id,
          participants: [anchorId, friendId].sort(),
          balance: currentBalance + reversalDelta,
          unsettledBillIds: FieldValue.arrayRemove(billId),
          lastUpdatedAt: now,
          lastBillId: billId,
        },
        { merge: true },
      );
    }
  });
}

// ─── Stage 3: Event Pair Ledger (per-pair deltas, in transaction) ────────────

/**
 * Resolves the set of Firebase UIDs eligible for event pair balances.
 * Includes event members and the owner's linked friends.
 */
async function resolveEventParticipants(
  anchorId: string,
  eventId: string,
  linkedFriendUids: Set<string>,
): Promise<Set<string>> {
  const eligible = new Set(linkedFriendUids);

  // Also include event members
  const eventDoc = await db().collection('events').doc(eventId).get();
  if (eventDoc.exists) {
    const memberIds: string[] = eventDoc.data()?.memberIds || [];
    for (const mid of memberIds) {
      if (mid !== anchorId) eligible.add(mid);
    }
  }

  return eligible;
}

/**
 * Calculates the event footprint: what each eligible participant owes the owner.
 * Similar to calculateFriendFootprint but uses event participant scope.
 */
function calculateEventFootprint(
  people: { id: string }[],
  personTotals: PersonTotal[],
  settledPersonIds: string[],
  eligibleUids: Set<string>,
  ownerId: string,
  creditorId: string,
): Record<string, number> {
  return calculateFriendFootprint({
    people,
    personTotals,
    settledPersonIds,
    linkedFriendUids: eligibleUids,
    ownerId,
    creditorId,
  });
}

async function applyEventPairLedger(
  billId: string,
  eventId: string,
  eventParticipants: Set<string>,
  payloadPreviousAnchorId?: string,
  payloadPreviousEventId?: string,
): Promise<number> {
  const billRef = db().collection(BILLS_COLLECTION).doc(billId);
  let deltasApplied = 0;

  await db().runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) return;

    const billData = billSnap.data()!;

    // A newer write may have moved/removed the bill's event and committed first
    // (at-least-once / out-of-order delivery). Only apply to `eventId` when the
    // COMMITTED bill still belongs to it — otherwise this is a stale event; its
    // own trigger (or clearStaleEventFootprint) already handled the transition.
    if (billData.eventId !== eventId) return;

    // ── Recompute the footprint from FRESH committed bill state ──
    // Same reasoning as applyFriendLedger: applied amounts + anchor come from
    // the freshly-read bill, defeating superseded-write redelivery.
    const ownerId: string = billData.ownerId;
    // A-08: normalize — see applyFriendLedger.
    const anchorId: string = personIdToFirebaseUid(billData.paidById || ownerId);
    const people = (billData.people as Array<{ id: string; name: string }>) || [];
    const personTotals = computeBillPersonTotals(
      billData.billData as BillData,
      people,
      (billData.itemAssignments as Record<string, string[]>) || {},
      Boolean(billData.splitEvenly),
    );
    const newFootprint = calculateEventFootprint(
      people,
      personTotals,
      (billData.settledPersonIds as string[]) || [],
      eventParticipants,
      ownerId,
      anchorId,
    );

    // ── Phase 0: Decide reversal/force-clear from FRESH bill state ──
    // Same idempotency rule as applyFriendLedger: a redelivered flip event
    // must see the committed footprint already anchored to the new creditor
    // and no-op, so the decision comes from the stored anchor, not the payload.
    // The stored footprint also remembers WHICH event it was applied to
    // (processedEventId) — moving a bill between events must reverse the old
    // event's pair docs, not just start writing to the new event's.
    const storedFootprint: Record<string, number> = billData.processedEventBalances || {};
    if (!billData.processedEventBalancesAnchorId && Object.keys(storedFootprint).length > 0) {
      logger.warn(
        'ledger: processing bill with footprint but no processedEventBalancesAnchorId (legacy — reconciler should backfill)',
        { billId },
      );
    }
    const storedAnchorId: string =
      billData.processedEventBalancesAnchorId ?? payloadPreviousAnchorId ?? anchorId;
    const storedEventId: string = billData.processedEventId ?? payloadPreviousEventId ?? eventId;

    let reversal:
      | {
          oldAnchorId: string;
          oldEventId: string;
          oldFootprint: Record<string, number>;
        }
      | undefined;
    let previousEventBalances: Record<string, number> = storedFootprint;
    if (storedAnchorId !== anchorId || storedEventId !== eventId) {
      if (Object.keys(storedFootprint).length > 0) {
        reversal = {
          oldAnchorId: storedAnchorId,
          oldEventId: storedEventId,
          oldFootprint: storedFootprint,
        };
      }
      previousEventBalances = {};
    }

    // Same structure as applyFriendLedger: reversal (if anchor changed) is
    // composed per-doc with the new deltas so every read precedes every write,
    // and an anchor flip within the same pair/event hits the SAME doc exactly once.
    const plan = new Map<string, PlannedBalanceOp>();

    if (reversal) {
      const { oldAnchorId, oldEventId, oldFootprint } = reversal;
      for (const [participantId, amount] of Object.entries(oldFootprint)) {
        if (Math.abs(amount) < BALANCE_THRESHOLD) continue;
        if (!isWritableBalancePair(oldAnchorId, participantId)) continue;
        const balanceId = getEventBalanceId(oldEventId, oldAnchorId, participantId);
        const entry = getPlanEntry(
          plan,
          balanceId,
          [oldAnchorId, participantId].sort(),
          oldEventId,
        );
        entry.reversalDelta += toSingleBalance(oldAnchorId, participantId, -amount);
        entry.hasReversal = true;
      }
    }

    // ── Phase 1: Compute deltas for new anchor ──
    const deltas = computeDeltas(newFootprint, previousEventBalances);

    if (Object.keys(deltas).length === 0 && !reversal) return;

    for (const participantId of Object.keys(deltas)) {
      if (!isWritableBalancePair(anchorId, participantId)) {
        logger.warn('ledger: skipping non-writable balance pair', {
          billId,
          anchorId,
          id: participantId,
        });
        continue;
      }
      const balanceId = getEventBalanceId(eventId, anchorId, participantId);
      const entry = getPlanEntry(plan, balanceId, [anchorId, participantId].sort(), eventId);
      entry.newDelta += toSingleBalance(anchorId, participantId, deltas[participantId]);
      entry.hasNewDelta = true;
      entry.addBillId = Math.abs(newFootprint[participantId] ?? 0) > BALANCE_THRESHOLD;
      entry.eventId = eventId; // new footprint's eventId wins on a shared doc
    }

    // ── Phase 1b: Read every involved balance doc (all reads precede all writes) ──
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const balanceId of plan.keys()) {
      const ref = db().collection(EVENT_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[balanceId] = ref;
      balanceSnaps[balanceId] = await tx.get(ref);
    }

    // ── Phase 2: Emit exactly one write per doc, composing reversal + delta ──
    const now = Timestamp.now();
    for (const [balanceId, entry] of plan) {
      const ref = balanceRefs[balanceId];
      const snap = balanceSnaps[balanceId];
      const existing = snap.exists ? snap.data()! : null;
      const currentBalance: number = (existing?.balance ?? 0) as number;

      // Idempotency guard: only apply the reversal if this bill is still recorded
      let totalDelta = entry.newDelta;
      let reversalApplied = false;
      if (entry.hasReversal) {
        const unsettledBillIds: string[] = existing?.unsettledBillIds || [];
        if (snap.exists && unsettledBillIds.includes(billId)) {
          totalDelta += entry.reversalDelta;
          reversalApplied = true;
        }
      }

      // Reversal-only doc whose guard failed: nothing to write.
      if (!entry.hasNewDelta && !reversalApplied) continue;

      const addBillId = entry.hasNewDelta && entry.addBillId;
      const billIdUpdate = addBillId
        ? { unsettledBillIds: FieldValue.arrayUnion(billId) }
        : { unsettledBillIds: FieldValue.arrayRemove(billId) };

      // Invariant check (observability only): a near-zero balance must have no
      // unsettled bills, and a non-zero balance must have at least one.
      const existingBills: string[] = existing?.unsettledBillIds || [];
      const resultingBills = addBillId
        ? Array.from(new Set([...existingBills, billId]))
        : existingBills.filter((id) => id !== billId);
      if (!isBalanceSettledConsistent(currentBalance + totalDelta, resultingBills)) {
        logger.error('ledger: balance/unsettled invariant violated', {
          billId,
          balanceId,
          balance: currentBalance + totalDelta,
          unsettledCount: resultingBills.length,
        });
      }

      tx.set(
        ref,
        {
          id: ref.id,
          eventId: entry.eventId,
          participants: entry.participants,
          balance: currentBalance + totalDelta,
          ...billIdUpdate,
          lastUpdatedAt: now,
          lastBillId: billId,
        },
        { merge: true },
      );
    }

    // Save event footprint (with the anchor and event it was computed under)
    tx.update(billRef, {
      processedEventBalances: sanitizeFootprint(stripZeros(newFootprint), anchorId),
      processedEventBalancesAnchorId: anchorId,
      processedEventId: eventId,
    });
    deltasApplied = Object.keys(deltas).length;
  });

  return deltasApplied;
}

/**
 * Cleanup for a bill that has left its event (eventId removed) but still has a
 * stale event footprint recorded. Reverses the old event's pair docs AND clears
 * the footprint fields in ONE transaction, deciding everything from FRESH bill
 * state — so a redelivered/out-of-order "removed from event" trigger cannot
 * wipe a footprint a newer write already re-applied to a different event, and a
 * crash can never leave the pair reversed but the footprint uncleared.
 */
async function clearStaleEventFootprint(
  billId: string,
  payloadPreviousAnchorId?: string,
  payloadPreviousEventId?: string,
): Promise<void> {
  const billRef = db().collection(BILLS_COLLECTION).doc(billId);

  await db().runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) return;

    const billData = billSnap.data()!;

    // A newer write may have re-added the bill to an event and committed first
    // (at-least-once / out-of-order delivery). Only clean up when the COMMITTED
    // bill genuinely has no event — otherwise this is a stale trigger, no-op.
    if (billData.eventId) return;

    const staleFootprint: Record<string, number> = billData.processedEventBalances || {};
    const staleEventId: string | undefined = billData.processedEventId ?? payloadPreviousEventId;
    if (!staleEventId || Object.keys(staleFootprint).length === 0) return;

    const staleAnchorId: string =
      billData.processedEventBalancesAnchorId ??
      payloadPreviousAnchorId ??
      personIdToFirebaseUid(billData.paidById || billData.ownerId);

    // Read all involved pair docs (all reads precede all writes).
    const targets: Array<{
      ref: FirebaseFirestore.DocumentReference;
      snap: FirebaseFirestore.DocumentSnapshot;
      participantId: string;
      amount: number;
    }> = [];
    for (const [participantId, amount] of Object.entries(staleFootprint)) {
      if (Math.abs(amount) < BALANCE_THRESHOLD) continue;
      const balanceId = getEventBalanceId(staleEventId, staleAnchorId, participantId);
      const ref = db().collection(EVENT_BALANCES_COLLECTION).doc(balanceId);
      targets.push({ ref, snap: await tx.get(ref), participantId, amount });
    }

    const now = Timestamp.now();
    for (const { ref, snap, participantId, amount } of targets) {
      if (!snap.exists) continue;
      const existing = snap.data()!;
      // Idempotency: skip if this bill was already reversed off the pair doc.
      const unsettledBillIds: string[] = existing.unsettledBillIds || [];
      if (!unsettledBillIds.includes(billId)) continue;

      const currentBalance: number = (existing.balance ?? 0) as number;
      const reversalDelta = toSingleBalance(staleAnchorId, participantId, -amount);
      tx.set(
        ref,
        {
          id: ref.id,
          eventId: staleEventId,
          participants: [staleAnchorId, participantId].sort(),
          balance: currentBalance + reversalDelta,
          unsettledBillIds: FieldValue.arrayRemove(billId),
          lastUpdatedAt: now,
          lastBillId: billId,
        },
        { merge: true },
      );
    }

    // Clear the stale event footprint in the SAME transaction as the reversal.
    tx.update(billRef, {
      processedEventBalances: {},
      processedEventBalancesAnchorId: FieldValue.delete(),
      processedEventId: FieldValue.delete(),
    });
  });
}

export async function reverseEventFootprint(
  billId: string,
  eventId: string,
  anchorId: string,
  previousEventBalances: Record<string, number>,
): Promise<void> {
  await db().runTransaction(async (tx) => {
    const participantsToReverse: string[] = [];
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const [participantId, amount] of Object.entries(previousEventBalances)) {
      if (Math.abs(amount) < BALANCE_THRESHOLD) continue;
      participantsToReverse.push(participantId);

      const balanceId = getEventBalanceId(eventId, anchorId, participantId);
      const ref = db().collection(EVENT_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[participantId] = ref;
      balanceSnaps[participantId] = await tx.get(ref);
    }

    const now = Timestamp.now();
    for (const participantId of participantsToReverse) {
      const amount = previousEventBalances[participantId];
      const ref = balanceRefs[participantId];
      const snap = balanceSnaps[participantId];
      if (!snap.exists) continue;

      const existing = snap.data()!;

      // Idempotency: skip if this bill was already reversed
      const unsettledBillIds: string[] = existing.unsettledBillIds || [];
      if (!unsettledBillIds.includes(billId)) continue;

      const currentBalance: number = (existing?.balance ?? 0) as number;
      const reversalDelta = toSingleBalance(anchorId, participantId, -amount);

      tx.set(
        ref,
        {
          id: ref.id,
          eventId,
          participants: [anchorId, participantId].sort(),
          balance: currentBalance + reversalDelta,
          unsettledBillIds: FieldValue.arrayRemove(billId),
          lastUpdatedAt: now,
          lastBillId: billId,
        },
        { merge: true },
      );
    }
  });
}

// ─── Main trigger ─────────────────────────────────────────────────────────────

/**
 * Core pipeline logic for a bills/{billId} write. Extracted from the trigger
 * so integration tests can invoke it in-process (same pattern as
 * processSettlementCore etc.). MUST stay behavior-identical to the trigger.
 */
export async function processLedgerWrite(
  billId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined,
): Promise<void> {
  // ── DELETE ──────────────────────────────────────────────────────────────
  if (before && !after) {
    // A-08: deliberately NOT normalized — DELETE only ever REVERSES, so this is
    // purely a read locator for where the footprint was written (see the note
    // on payloadPreviousAnchorId). A stored processed*AnchorId still wins below;
    // this is only the fallback for legacy bills that lack one, and for those
    // the un-normalized value is the correct guess.
    const anchorId = before.paidById || before.ownerId;
    logger.info('Bill deleted', { billId, anchorId, stage: 'DELETE' });

    const previousBalances = before.processedBalances;
    if (previousBalances && Object.keys(previousBalances).length > 0) {
      // Reverse under the anchor the footprint was recorded with (falls back
      // to the payload anchor for legacy bills without the anchor field).
      await reverseFootprint(
        billId,
        before.processedBalancesAnchorId ?? anchorId,
        previousBalances,
      );
      logger.info('Stage 2: reversed footprint', {
        billId,
        friendsReversed: Object.keys(previousBalances).length,
      });
    }

    // Prefer the event the footprint was actually applied to (a bill can be
    // deleted after moving events, before the pipeline caught up).
    const deletedEventId = before.processedEventId ?? before.eventId;
    if (deletedEventId) {
      const previousEventBalances = before.processedEventBalances;
      if (previousEventBalances && Object.keys(previousEventBalances).length > 0) {
        try {
          await reverseEventFootprint(
            billId,
            deletedEventId,
            before.processedEventBalancesAnchorId ?? anchorId,
            previousEventBalances,
          );
          logger.info('Stage 3: reversed event footprint', {
            billId,
            eventId: deletedEventId,
            participantsReversed: Object.keys(previousEventBalances).length,
          });
        } catch (err) {
          logger.error('Stage 3 failed (non-fatal)', {
            billId,
            eventId: deletedEventId,
            error: String(err),
          });
        }
      }
    }
    return;
  }

  // ── CREATE or UPDATE ────────────────────────────────────────────────────
  if (!after) return;

  if (before && !hasRelevantChange(before, after)) {
    return;
  }

  const operation = before ? 'UPDATE' : 'CREATE';
  const ownerId = after.ownerId;
  // A-08: normalize the anchor at the entry point too, so logs and every
  // downstream consumer see the same uid the balance docs are keyed by.
  const creditorId = personIdToFirebaseUid(after.paidById || ownerId);

  logger.info('Processing bill', {
    billId,
    operation,
    creditorId,
    eventId: after.eventId || null,
  });

  // Anchor changes (e.g. user edits who paid the bill) are detected and
  // reversed atomically INSIDE applyFriendLedger/applyEventPairLedger, from
  // the freshly-read bill's processed*AnchorId — so redelivered trigger
  // events (at-least-once semantics) are no-ops. The payload's before-anchor
  // is passed only as a fallback for legacy bills without the anchor field.
  // A-08: deliberately NOT normalized. This is a READ locator — it answers
  // "where was the previous footprint written?", not "where does the next one
  // go?". Its only consumer is the fallback for legacy bills that have a
  // footprint but no processed*AnchorId, and those footprints were written by
  // the pre-hardening pipeline under whatever anchor the bill carried at the
  // time — prefix included. Normalizing here would make the stale and current
  // anchors compare equal, skipping the reversal and applying only the delta
  // to a doc that was never seeded. Normalize write targets, preserve locators.
  const payloadPreviousAnchorId = before ? before.paidById || before.ownerId : undefined;
  const payloadPreviousEventId = before?.eventId;

  // ── Stage 1: VALIDATE & CALCULATE ───────────────────────────────────────
  const people = after.people || [];

  // A bill that was already applied to the ledger carries a footprint. If it is
  // later emptied (every item or every person removed) it still owes the ledger
  // a teardown: the stages below recompute a zero/empty footprint and the delta
  // machinery reverses the stored one. Returning early here would strand the
  // balance forever — the scheduled reconciler is report-only and never repairs.
  const hasStoredFootprint =
    Object.keys((after.processedBalances as Record<string, number>) || {}).length > 0 ||
    Object.keys((after.processedEventBalances as Record<string, number>) || {}).length > 0;

  const isIncomplete = !after.billData?.items?.length || people.length === 0;

  // ownerId is required either way: without it there is no anchor to resolve,
  // so neither an apply nor a teardown can be attributed to a pair.
  if (!ownerId || (isIncomplete && !hasStoredFootprint)) {
    logger.info('Stage 1: incomplete data, skipping', { billId });
    return;
  }

  if (isIncomplete) {
    logger.info('Stage 1: bill emptied — tearing down its stored footprint', {
      billId,
    });
  }

  // Payload-based totals gate Stage 1 only; the authoritative footprint is
  // recomputed from fresh committed state inside the ledger transactions.
  const personTotals = computePersonTotals(after);

  if (personTotals.length === 0 && !hasStoredFootprint) {
    logger.info('Stage 1: no person totals, skipping', { billId });
    return;
  }

  // ── Stage 2: FRIEND LEDGER (authoritative, in transaction) ──────────────
  const participantIds = after.participantIds || [];
  const linkedFriendUids = await resolveEligibleFriends(
    creditorId,
    ownerId,
    participantIds,
    people,
  );
  let stage2Wrote = false;

  if (linkedFriendUids.size > 0) {
    // The footprint is recomputed from fresh committed state INSIDE the
    // transaction (redelivery-safe); we only pass the eligible-friend set.
    const deltasApplied = await applyFriendLedger(
      billId,
      linkedFriendUids,
      payloadPreviousAnchorId,
    );
    stage2Wrote = deltasApplied > 0;
    logger.info('Stage 2: friend ledger updated', {
      billId,
      deltasApplied,
      linkedFriends: linkedFriendUids.size,
    });
  } else {
    logger.info('Stage 2: no linked friends, skipping', { billId, ownerId });
  }

  if (!stage2Wrote) {
    const billRef = db().collection(BILLS_COLLECTION).doc(billId);
    const currentVersion: number = after._ledgerVersion ?? 0;
    await billRef.update({ _ledgerVersion: currentVersion + 1 });
  }

  // ── Stage 3: EVENT PAIR LEDGER (per-pair deltas, in transaction) ────────
  if (after.eventId) {
    try {
      const eventParticipants = await resolveEventParticipants(
        creditorId,
        after.eventId,
        linkedFriendUids,
      );

      if (eventParticipants.size > 0) {
        // Footprint recomputed from fresh committed state inside the
        // transaction (redelivery-safe); we only pass the participant set.
        const eventDeltasApplied = await applyEventPairLedger(
          billId,
          after.eventId,
          eventParticipants,
          payloadPreviousAnchorId,
          payloadPreviousEventId,
        );
        logger.info('Stage 3: event pair ledger updated', {
          billId,
          eventId: after.eventId,
          deltasApplied: eventDeltasApplied,
        });
      } else {
        logger.info('Stage 3: no event participants, skipping', {
          billId,
          eventId: after.eventId,
        });
      }
    } catch (err) {
      logger.error('Stage 3 failed (non-fatal)', {
        billId,
        eventId: after.eventId,
        error: String(err),
      });
    }
  } else {
    // Bill has no event but a stale event footprint may remain (eventId was
    // removed): reverse the old event's pair docs and clear the footprint —
    // atomically, from fresh committed state (redelivery/crash safe).
    try {
      await clearStaleEventFootprint(billId, payloadPreviousAnchorId, payloadPreviousEventId);
    } catch (err) {
      logger.error('Stage 3 event-removal reversal failed (non-fatal)', {
        billId,
        error: String(err),
      });
    }
  }
}

export const ledgerProcessor = onDocumentWritten(
  { document: 'bills/{billId}', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    await processLedgerWrite(
      event.params.billId,
      event.data?.before?.data(),
      event.data?.after?.data(),
    );
  },
);
