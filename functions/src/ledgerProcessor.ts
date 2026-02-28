/**
 * ledgerProcessor.ts
 *
 * Cloud Function: Firestore onDocumentWritten trigger on bills/{billId}
 *
 * The heart of the ledger pipeline. When a bill is created, updated, or deleted:
 *   Stage 1: Validate & calculate personTotals from trusted server-side data
 *   Stage 2: Apply single-balance delta to friend_balances (authoritative, in transaction)
 *   Stage 3: Rebuild event_balances cache (best-effort, outside transaction)
 *
 * friend_balances schema:
 *   { balance: number, unsettledBillIds: string[], participants: [uid1, uid2] }
 *   balance > 0 → participants[0] (alphabetically smaller UID) is owed
 *   balance < 0 → participants[1] is owed
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { calculatePersonTotals } from '../../shared/calculations.js';
import {
  personIdToFirebaseUid,
  getFriendBalanceId,
  calculateFriendFootprint,
  toSingleBalance,
} from '../../shared/ledgerCalculations.js';
import { optimizeDebts } from '../../shared/optimizeDebts.js';
import type { PersonTotal } from '../../shared/types.js';

let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';
const EVENT_BALANCES_COLLECTION = 'event_balances';

// Fields that require pipeline re-processing when changed.
// processedBalances and _ledgerVersion are excluded to prevent infinite loops.
const RELEVANT_FIELDS = [
  'billData', 'people', 'itemAssignments', 'settledPersonIds',
  'paidById', 'splitEvenly', 'ownerId', '_friendScanTrigger',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hasRelevantChange(
  before: Record<string, any>,
  after: Record<string, any>
): boolean {
  for (const field of RELEVANT_FIELDS) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) {
      return true;
    }
  }
  return false;
}

async function resolveLinkedFriends(ownerId: string): Promise<Set<string>> {
  const userDoc = await db().collection('users').doc(ownerId).get();
  const userData = userDoc.data();
  const friends: any[] = userData?.friends || [];

  const linked = new Set<string>();
  for (const f of friends) {
    const uid = typeof f === 'string' ? f : (f.userId || f.id);
    if (uid) linked.add(uid);
  }
  return linked;
}

function computePersonTotals(bill: Record<string, any>): PersonTotal[] {
  const billData = bill.billData;
  const people = bill.people || [];

  if (bill.splitEvenly) {
    const share = billData.total / people.length;
    return people.map((p: any) => ({
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
    bill.itemAssignments || {},
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
  ownerId: string,
  newFootprint: Record<string, number>
): Promise<number> {
  const billRef = db().collection(BILLS_COLLECTION).doc(billId);
  let deltasApplied = 0;

  await db().runTransaction(async (tx) => {
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) return;

    const billData = billSnap.data()!;
    const previousBalances = billData.processedBalances || {};
    const deltas = computeDeltas(newFootprint, previousBalances);

    if (Object.keys(deltas).length === 0) return;

    // Phase 1: Read all friend_balance docs
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const friendId of Object.keys(deltas)) {
      const balanceId = getFriendBalanceId(ownerId, friendId);
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

      // Convert owner-relative delta to single-balance sign convention
      const deltaSingle = toSingleBalance(ownerId, friendId, delta);

      // Track unsettled bills
      const friendAmount = newFootprint[friendId] ?? 0;
      const billIdUpdate = Math.abs(friendAmount) > 0.001
        ? { unsettledBillIds: FieldValue.arrayUnion(billId) }
        : { unsettledBillIds: FieldValue.arrayRemove(billId) };

      tx.set(ref, {
        id: ref.id,
        participants: [ownerId, friendId].sort(),
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

async function reverseFootprint(
  billId: string,
  ownerId: string,
  previousBalances: Record<string, number>
): Promise<void> {
  await db().runTransaction(async (tx) => {
    const friendsToReverse: string[] = [];
    const balanceRefs: Record<string, FirebaseFirestore.DocumentReference> = {};
    const balanceSnaps: Record<string, FirebaseFirestore.DocumentSnapshot> = {};

    for (const [friendId, amount] of Object.entries(previousBalances)) {
      if (Math.abs(amount) < 0.001) continue;
      friendsToReverse.push(friendId);

      const balanceId = getFriendBalanceId(ownerId, friendId);
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
      const currentBalance: number = (existing?.balance ?? 0) as number;

      // Reverse: subtract the single-balance equivalent
      const reversalDelta = toSingleBalance(ownerId, friendId, -amount);

      tx.set(ref, {
        id: ref.id,
        participants: [ownerId, friendId].sort(),
        balance: currentBalance + reversalDelta,
        unsettledBillIds: FieldValue.arrayRemove(billId),
        lastUpdatedAt: now,
        lastBillId: billId,
      }, { merge: true });
    }
  });
}

// ─── Stage 3: Event Cache (best-effort) ──────────────────────────────────────

async function rebuildEventCache(
  eventId: string,
  excludeBillId?: string
): Promise<void> {
  const billsSnap = await db().collection(BILLS_COLLECTION)
    .where('eventId', '==', eventId)
    .get();

  const netBalances: Record<string, number> = {};
  const processedBillIds: string[] = [];

  for (const billDoc of billsSnap.docs) {
    if (excludeBillId && billDoc.id === excludeBillId) continue;

    const bill = billDoc.data();
    const people = bill.people || [];
    const ownerId = bill.ownerId;
    const settledPersonIds = bill.settledPersonIds || [];

    if (!bill.billData?.items?.length || !ownerId || people.length === 0) continue;

    const personTotals = computePersonTotals(bill);

    let ownerIsOwed = 0;
    for (const pt of personTotals) {
      const uid = personIdToFirebaseUid(pt.personId);
      if (uid === ownerId) continue;

      const owesAmount = settledPersonIds.includes(pt.personId) ? 0 : pt.total;
      if (owesAmount > 0) {
        netBalances[uid] = (netBalances[uid] ?? 0) - owesAmount;
        ownerIsOwed += owesAmount;
      }
    }
    if (ownerIsOwed > 0.001) {
      netBalances[ownerId] = (netBalances[ownerId] ?? 0) + ownerIsOwed;
    }

    processedBillIds.push(billDoc.id);
  }

  for (const uid of Object.keys(netBalances)) {
    if (Math.abs(netBalances[uid]) < 0.01) {
      netBalances[uid] = 0;
    }
  }

  const eventLedgerRef = db().collection(EVENT_BALANCES_COLLECTION).doc(eventId);
  await eventLedgerRef.set({
    eventId,
    netBalances,
    optimizedDebts: optimizeDebts(netBalances),
    processedBillIds,
    lastUpdatedAt: Timestamp.now(),
  }, { merge: true });
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
      logger.info('Bill deleted', { billId, ownerId: before.ownerId, stage: 'DELETE' });

      const previousBalances = before.processedBalances;
      if (previousBalances && Object.keys(previousBalances).length > 0) {
        await reverseFootprint(billId, before.ownerId, previousBalances);
        logger.info('Stage 2: reversed footprint', { billId, friendsReversed: Object.keys(previousBalances).length });
      }

      if (before.eventId) {
        try {
          await rebuildEventCache(before.eventId, billId);
          logger.info('Stage 3: event cache rebuilt', { billId, eventId: before.eventId });
        } catch (err) {
          logger.error('Stage 3 failed (non-fatal)', { billId, eventId: before.eventId, error: String(err) });
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
    logger.info('Processing bill', { billId, operation, ownerId: after.ownerId, eventId: after.eventId || null });

    // ── Stage 1: VALIDATE & CALCULATE ───────────────────────────────────────
    const people = after.people || [];
    const ownerId = after.ownerId;
    const creditorId = after.paidById || ownerId;

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
    const linkedFriendUids = await resolveLinkedFriends(ownerId);
    let stage2Wrote = false;

    if (linkedFriendUids.size > 0) {
      const newFootprint = calculateFriendFootprint({
        people, personTotals, settledPersonIds,
        linkedFriendUids, ownerId, creditorId,
      });

      const deltasApplied = await applyFriendLedger(billId, ownerId, newFootprint);
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

    // ── Stage 3: EVENT CACHE (best-effort, outside transaction) ─────────────
    if (after.eventId) {
      try {
        await rebuildEventCache(after.eventId);
        logger.info('Stage 3: event cache rebuilt', { billId, eventId: after.eventId });
      } catch (err) {
        logger.error('Stage 3 failed (non-fatal)', { billId, eventId: after.eventId, error: String(err) });
      }
    }
  }
);
