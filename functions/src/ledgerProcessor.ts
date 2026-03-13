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
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { calculatePersonTotals } from '../../shared/calculations.js';
import {
  getFriendBalanceId,
  getEventBalanceId,
  calculateFriendFootprint,
  toSingleBalance,
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
  'billData', 'people', 'itemAssignments', 'settledPersonIds',
  'paidById', 'splitEvenly', 'ownerId', '_friendScanTrigger',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasRelevantChange(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): boolean {
  for (const field of RELEVANT_FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      return true;
    }
  }
  return false;
}

async function resolveEligibleFriends(anchorId: string, ownerId: string, billParticipants: string[]): Promise<Set<string>> {
  const linked = new Set<string>();

  // Use the pre-computed participantIds from the bill if available, 
  // otherwise fallback to the anchor/owner set.
  if (billParticipants && billParticipants.length > 0) {
    for (const id of billParticipants) {
      linked.add(id);
    }
  } else {
    linked.add(anchorId);
    linked.add(ownerId);
  }

  // Also include any shadow users created by the owner OR anchor 
  // (though they should already be in participantIds from the bill)
  const shadowQuery = await db().collection('users')
    .where('isShadow', '==', true)
    .where('createdById', 'in', [ownerId, anchorId])
    .get();

  shadowQuery.forEach(doc => {
    linked.add(doc.id);
  });

  return linked;
}

function computePersonTotals(bill: Record<string, unknown>): PersonTotal[] {
  const billData = bill.billData as BillData;
  const people = bill.people as Array<{ id: string; name: string }> || [];

  if (bill.splitEvenly) {
    const share = billData.total / people.length;
    return people.map((p) => ({
      personId: p.id,
      name: p.name,
      itemsSubtotal: share,
      tax: 0,
      tip: 0,
      total: parseFloat(share.toFixed(2)),
    }));
  }

  return calculatePersonTotals(
    billData,
    people,
    (bill.itemAssignments as Record<string, string[]>) || {},
    billData.tip,
    billData.tax
  );
}

/**
 * Strips zero-value entries from a footprint for storage.
 */
function stripZeros(footprint: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(footprint)) {
    if (Math.abs(v) > 0.001) result[k] = v;
  }
  return result;
}

/**
 * Computes non-zero deltas between two footprints.
 */
function computeDeltas(
  newFootprint: Record<string, number>,
  oldFootprint: Record<string, number>
): Record<string, number> {
  const allIds = new Set([...Object.keys(oldFootprint), ...Object.keys(newFootprint)]);
  const deltas: Record<string, number> = {};
  for (const id of allIds) {
    const delta = (newFootprint[id] || 0) - (oldFootprint[id] || 0);
    if (Math.abs(delta) > 0.001) deltas[id] = delta;
  }
  return deltas;
}

// ─── Stage 2: Friend Ledger (authoritative, single balance) ─────────────────

async function applyFriendLedger(
  billId: string,
  anchorId: string,
  newFootprint: Record<string, number>,
  forceClearPrevious: boolean = false
): Promise<number> {
  const billRef = db().collection(BILLS_COLLECTION).doc(billId);
  let deltasApplied = 0;

  await db().runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) return;

    const billData = billSnap.data()!;
    const previousBalances = forceClearPrevious ? {} : (billData.processedBalances || {});
    const deltas = computeDeltas(newFootprint, previousBalances);

    if (Object.keys(deltas).length === 0) return;

    // Phase 1: Read all friend_balance docs
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const friendId of Object.keys(deltas)) {
      const balanceId = getFriendBalanceId(anchorId, friendId);
      const ref = db().collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[friendId] = ref;
      balanceSnaps[friendId] = await tx.get(ref);
    }

    // Phase 2: Write single-balance updates
    const now = Timestamp.now();
    for (const friendId of Object.keys(deltas)) {
      const delta = deltas[friendId];
      const ref = balanceRefs[friendId];
      const snap = balanceSnaps[friendId];
      const existing = snap.exists ? snap.data()! : null;
      const currentBalance: number = (existing?.balance ?? 0) as number;

      // Convert anchor-relative delta to single-balance sign convention
      const deltaSingle = toSingleBalance(anchorId, friendId, delta);

      // Track unsettled bills
      const friendAmount = newFootprint[friendId] ?? 0;
      const billIdUpdate = Math.abs(friendAmount) > 0.001
        ? { unsettledBillIds: FieldValue.arrayUnion(billId) }
        : { unsettledBillIds: FieldValue.arrayRemove(billId) };

      tx.set(ref, {
        id: ref.id,
        participants: [anchorId, friendId].sort(),
        balance: currentBalance + deltaSingle,
        ...billIdUpdate,
        lastUpdatedAt: now,
        lastBillId: billId,
      }, { merge: true });
    }

    // Save footprint and bump version on the bill
    const currentVersion: number = (billData._ledgerVersion ?? 0);
    tx.update(billRef, {
      processedBalances: stripZeros(newFootprint),
      _ledgerVersion: currentVersion + 1,
    });
    deltasApplied = Object.keys(deltas).length;
  });

  return deltasApplied;
}

export async function reverseFootprint(
  billId: string,
  anchorId: string,
  previousBalances: Record<string, number>
): Promise<void> {
  await db().runTransaction(async (tx) => {
    const friendsToReverse: string[] = [];
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const [friendId, amount] of Object.entries(previousBalances)) {
      if (Math.abs(amount) < 0.001) continue;
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

      tx.set(ref, {
        id: ref.id,
        participants: [anchorId, friendId].sort(),
        balance: currentBalance + reversalDelta,
        unsettledBillIds: FieldValue.arrayRemove(billId),
        lastUpdatedAt: now,
        lastBillId: billId,
      }, { merge: true });
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
  linkedFriendUids: Set<string>
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
  creditorId: string
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
  anchorId: string,
  newFootprint: Record<string, number>,
  forceClearPrevious: boolean = false
): Promise<number> {
  const billRef = db().collection(BILLS_COLLECTION).doc(billId);
  let deltasApplied = 0;

  await db().runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) return;

    const billData = billSnap.data()!;
    const previousEventBalances = forceClearPrevious ? {} : (billData.processedEventBalances || {});
    const deltas = computeDeltas(newFootprint, previousEventBalances);

    if (Object.keys(deltas).length === 0) return;

    // Phase 1: Read all event pair balance docs
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const participantId of Object.keys(deltas)) {
      const balanceId = getEventBalanceId(eventId, anchorId, participantId);
      const ref = db().collection(EVENT_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[participantId] = ref;
      balanceSnaps[participantId] = await tx.get(ref);
    }

    // Phase 2: Write per-pair balance updates
    const now = Timestamp.now();
    for (const participantId of Object.keys(deltas)) {
      const delta = deltas[participantId];
      const ref = balanceRefs[participantId];
      const snap = balanceSnaps[participantId];
      const existing = snap.exists ? snap.data()! : null;
      const currentBalance: number = (existing?.balance ?? 0) as number;

      const deltaSingle = toSingleBalance(anchorId, participantId, delta);

      const participantAmount = newFootprint[participantId] ?? 0;
      const billIdUpdate = Math.abs(participantAmount) > 0.001
        ? { unsettledBillIds: FieldValue.arrayUnion(billId) }
        : { unsettledBillIds: FieldValue.arrayRemove(billId) };

      tx.set(ref, {
        id: ref.id,
        eventId,
        participants: [anchorId, participantId].sort(),
        balance: currentBalance + deltaSingle,
        ...billIdUpdate,
        lastUpdatedAt: now,
        lastBillId: billId,
      }, { merge: true });
    }

    // Save event footprint on the bill
    tx.update(billRef, {
      processedEventBalances: stripZeros(newFootprint),
    });
    deltasApplied = Object.keys(deltas).length;
  });

  return deltasApplied;
}

export async function reverseEventFootprint(
  billId: string,
  eventId: string,
  anchorId: string,
  previousEventBalances: Record<string, number>
): Promise<void> {
  await db().runTransaction(async (tx) => {
    const participantsToReverse: string[] = [];
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const [participantId, amount] of Object.entries(previousEventBalances)) {
      if (Math.abs(amount) < 0.001) continue;
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

      tx.set(ref, {
        id: ref.id,
        eventId,
        participants: [anchorId, participantId].sort(),
        balance: currentBalance + reversalDelta,
        unsettledBillIds: FieldValue.arrayRemove(billId),
        lastUpdatedAt: now,
        lastBillId: billId,
      }, { merge: true });
    }
  });
}

// ─── Main trigger ─────────────────────────────────────────────────────────────

export const ledgerProcessor = onDocumentWritten(
  { document: 'bills/{billId}', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    const billId = event.params.billId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (before && !after) {
      const anchorId = before.paidById || before.ownerId;
      logger.info('Bill deleted', { billId, anchorId, stage: 'DELETE' });

      const previousBalances = before.processedBalances;
      if (previousBalances && Object.keys(previousBalances).length > 0) {
        await reverseFootprint(billId, anchorId, previousBalances);
        logger.info('Stage 2: reversed footprint', { billId, friendsReversed: Object.keys(previousBalances).length });
      }

      if (before.eventId) {
        const previousEventBalances = before.processedEventBalances;
        if (previousEventBalances && Object.keys(previousEventBalances).length > 0) {
          try {
            await reverseEventFootprint(billId, before.eventId, anchorId, previousEventBalances);
            logger.info('Stage 3: reversed event footprint', { billId, eventId: before.eventId, participantsReversed: Object.keys(previousEventBalances).length });
          } catch (err) {
            logger.error('Stage 3 failed (non-fatal)', { billId, eventId: before.eventId, error: String(err) });
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
    const creditorId = after.paidById || ownerId;

    logger.info('Processing bill', { billId, operation, creditorId, eventId: after.eventId || null });

    // Handle Anchor Change (e.g. user edits who paid the bill)
    let forceClearPrevious = false;
    if (before && after) {
      const previousAnchorId = before.paidById || before.ownerId;
      if (previousAnchorId !== creditorId) {
        logger.info('Anchor changed, reversing previous balances completely', { previousAnchorId, currentAnchorId: creditorId });

        if (before.processedBalances && Object.keys(before.processedBalances).length > 0) {
          await reverseFootprint(billId, previousAnchorId, before.processedBalances);
        }

        if (before.eventId && before.processedEventBalances && Object.keys(before.processedEventBalances).length > 0) {
          await reverseEventFootprint(billId, before.eventId, previousAnchorId, before.processedEventBalances);
        }

        forceClearPrevious = true;
      }
    }

    // ── Stage 1: VALIDATE & CALCULATE ───────────────────────────────────────
    const people = after.people || [];

    if (!after.billData?.items?.length || !ownerId || people.length === 0) {
      logger.info('Stage 1: incomplete data, skipping', { billId });
      return;
    }

    const settledPersonIds = after.settledPersonIds || [];
    const personTotals = computePersonTotals(after);

    if (personTotals.length === 0) {
      logger.info('Stage 1: no person totals, skipping', { billId });
      return;
    }

    // ── Stage 2: FRIEND LEDGER (authoritative, in transaction) ──────────────
    const participantIds = after.participantIds || [];
    const linkedFriendUids = await resolveEligibleFriends(creditorId, ownerId, participantIds);
    let stage2Wrote = false;

    if (linkedFriendUids.size > 0) {
      const newFootprint = calculateFriendFootprint({
        people, personTotals, settledPersonIds,
        linkedFriendUids, ownerId, creditorId,
      });

      const deltasApplied = await applyFriendLedger(billId, creditorId, newFootprint, forceClearPrevious);
      stage2Wrote = deltasApplied > 0;
      logger.info('Stage 2: friend ledger updated', { billId, deltasApplied, linkedFriends: linkedFriendUids.size });
    } else {
      logger.info('Stage 2: no linked friends, skipping', { billId, ownerId });
    }

    if (!stage2Wrote) {
      const billRef = db().collection(BILLS_COLLECTION).doc(billId);
      const currentVersion: number = (after._ledgerVersion ?? 0);
      await billRef.update({ _ledgerVersion: currentVersion + 1 });
    }

    // ── Stage 3: EVENT PAIR LEDGER (per-pair deltas, in transaction) ────────
    if (after.eventId) {
      try {
        const eventParticipants = await resolveEventParticipants(creditorId, after.eventId, linkedFriendUids);

        if (eventParticipants.size > 0) {
          const eventFootprint = calculateEventFootprint(
            people, personTotals, settledPersonIds,
            eventParticipants, ownerId, creditorId
          );

          const eventDeltasApplied = await applyEventPairLedger(billId, after.eventId, creditorId, eventFootprint, forceClearPrevious);
          logger.info('Stage 3: event pair ledger updated', { billId, eventId: after.eventId, deltasApplied: eventDeltasApplied });
        } else {
          logger.info('Stage 3: no event participants, skipping', { billId, eventId: after.eventId });
        }
      } catch (err) {
        logger.error('Stage 3 failed (non-fatal)', { billId, eventId: after.eventId, error: String(err) });
      }
    }
  }
);
