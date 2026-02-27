/**
 * ledgerProcessor.ts
 *
 * Cloud Function: Firestore onDocumentWritten trigger on bills/{billId}
 *
 * The heart of the ledger pipeline. When a bill is created, updated, or deleted:
 *   Stage 1: Validate & calculate personTotals from trusted server-side data
 *   Stage 2: Apply friend_balances delta (authoritative, in transaction)
 *   Stage 3: Rebuild event_balances cache (best-effort, outside transaction)
 *
 * Key design decisions:
 *   - Stage 2 reads processedBalances INSIDE the transaction for consistency.
 *   - Stage 3 is outside the transaction — it's just a cache rebuild.
 *     If it fails, the authoritative data (friend_balances) is still correct.
 *   - The pipeline writes processedBalances back to the bill; the hasRelevantChange
 *     guard prevents infinite trigger loops from this write.
 *   - During transition (Commits 4-5), both client and pipeline run in parallel.
 *     This is safe because the footprint-based delta design is idempotent.
 */

import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { calculatePersonTotals } from '../../shared/calculations.js';
import {
  personIdToFirebaseUid,
  getFriendBalanceId,
  calculateFriendFootprint,
  computeFootprintDeltas,
  toProcessedBalances,
} from '../../shared/ledgerCalculations.js';
import { optimizeDebts } from '../../shared/optimizeDebts.js';
import type { PersonTotal } from '../../shared/types.js';

const db = getFirestore();

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';
const EVENT_BALANCES_COLLECTION = 'event_balances';

// Fields that require pipeline re-processing when changed.
// processedBalances is intentionally excluded — the pipeline writes it,
// so including it would cause infinite loops.
const RELEVANT_FIELDS = [
  'billData', 'people', 'itemAssignments', 'settledPersonIds',
  'paidById', 'splitEvenly', 'ownerId',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Checks whether any pipeline-relevant fields changed between snapshots.
 * Returns false if only pipeline-written fields (processedBalances) changed,
 * which prevents infinite trigger loops.
 */
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

/**
 * Resolves which bill participants are linked Firebase users
 * by reading the owner's friends list.
 */
async function resolveLinkedFriends(ownerId: string): Promise<Set<string>> {
  const userDoc = await db.collection('users').doc(ownerId).get();
  const userData = userDoc.data();
  const friends: any[] = userData?.friends || [];

  const linked = new Set<string>();
  for (const f of friends) {
    const uid = typeof f === 'string' ? f : (f.userId || f.id);
    if (uid) linked.add(uid);
  }
  return linked;
}

/**
 * Computes personTotals from bill data, handling both splitEvenly and
 * item-assignment-based splits.
 */
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

// ─── Stage 2: Friend Ledger (authoritative) ──────────────────────────────────

/**
 * Applies footprint deltas to friend_balances in a single transaction.
 * Reads processedBalances from the bill INSIDE the transaction for consistency,
 * then saves the updated processedBalances footprint back to the bill.
 *
 * Returns the number of friend_balance documents updated.
 */
async function applyFriendLedger(
  billId: string,
  ownerId: string,
  newFootprint: Record<string, number>
): Promise<number> {
  const billRef = db.collection(BILLS_COLLECTION).doc(billId);
  let deltasApplied = 0;

  await db.runTransaction(async (tx) => {
    // Read bill inside transaction for latest processedBalances
    const billSnap = await tx.get(billRef);
    if (!billSnap.exists) return;

    const billData = billSnap.data()!;
    const previousBalances = billData.processedBalances || {};

    const deltas = computeFootprintDeltas(newFootprint, previousBalances);
    if (Object.keys(deltas).length === 0) return;

    // Phase 1: Read all friend_balance docs (Firestore requires reads before writes)
    const balanceRefs: Record<string, any> = {};
    const balanceSnaps: Record<string, any> = {};

    for (const friendUserId of Object.keys(deltas)) {
      const balanceId = getFriendBalanceId(ownerId, friendUserId);
      const ref = db.collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[friendUserId] = ref;
      balanceSnaps[friendUserId] = await tx.get(ref);
    }

    // Phase 2: Write all friend_balance updates
    const now = Timestamp.now();
    for (const friendUserId of Object.keys(deltas)) {
      const delta = deltas[friendUserId];
      const ref = balanceRefs[friendUserId];
      const snap = balanceSnaps[friendUserId];
      const existing = snap.exists ? snap.data()! : null;

      const currentOwnerBal: number = (existing?.balances?.[ownerId] ?? 0) as number;
      const currentFriendBal: number = (existing?.balances?.[friendUserId] ?? 0) as number;

      tx.set(ref, {
        id: ref.id,
        participants: [ownerId, friendUserId],
        balances: {
          [ownerId]: currentOwnerBal + delta,
          [friendUserId]: currentFriendBal - delta,
        },
        lastUpdatedAt: now,
        lastBillId: billId,
      }, { merge: true });
    }

    // Save the new footprint on the bill
    tx.update(billRef, { processedBalances: toProcessedBalances(newFootprint) });
    deltasApplied = Object.keys(deltas).length;
  });

  return deltasApplied;
}

/**
 * Reverses a bill's processedBalances footprint from friend_balances.
 * Used when a bill is deleted.
 */
async function reverseFootprint(
  billId: string,
  ownerId: string,
  previousBalances: Record<string, number>
): Promise<void> {
  await db.runTransaction(async (tx) => {
    // Phase 1: Read all affected friend_balance docs
    const friendsToReverse: string[] = [];
    const balanceRefs: Record<string, any> = {};
    const balanceSnaps: Record<string, any> = {};

    for (const [friendId, amount] of Object.entries(previousBalances)) {
      if (Math.abs(amount) < 0.001) continue;
      friendsToReverse.push(friendId);

      const balanceId = getFriendBalanceId(ownerId, friendId);
      const ref = db.collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
      balanceRefs[friendId] = ref;
      balanceSnaps[friendId] = await tx.get(ref);
    }

    // Phase 2: Write reversals
    const now = Timestamp.now();
    for (const friendId of friendsToReverse) {
      const amount = previousBalances[friendId];
      const ref = balanceRefs[friendId];
      const snap = balanceSnaps[friendId];
      if (!snap.exists) continue;

      const existing = snap.data()!;
      const currentOwnerBal: number = (existing?.balances?.[ownerId] ?? 0) as number;
      const currentFriendBal: number = (existing?.balances?.[friendId] ?? 0) as number;

      tx.set(ref, {
        id: ref.id,
        participants: [ownerId, friendId],
        balances: {
          [ownerId]: currentOwnerBal - amount,
          [friendId]: currentFriendBal + amount,
        },
        lastUpdatedAt: now,
        lastBillId: billId,
      }, { merge: true });
    }
  });
}

// ─── Stage 3: Event Cache (best-effort) ──────────────────────────────────────

/**
 * Rebuilds the event_balances cache from scratch by querying all bills
 * in the event, aggregating per-person totals, and running optimizeDebts.
 *
 * This is intentionally a full rebuild (not incremental) because event_balances
 * is a read-only cache. Rebuilding is simpler, more debuggable, and self-healing.
 *
 * @param eventId - the event whose cache to rebuild
 * @param excludeBillId - bill to exclude (used during deletion)
 */
async function rebuildEventCache(
  eventId: string,
  excludeBillId?: string
): Promise<void> {
  const billsSnap = await db.collection(BILLS_COLLECTION)
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

    // Aggregate: non-owner participants owe (negative), owner is owed (positive)
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

  // Clean near-zero values
  for (const uid of Object.keys(netBalances)) {
    if (Math.abs(netBalances[uid]) < 0.01) {
      netBalances[uid] = 0;
    }
  }

  const eventLedgerRef = db.collection(EVENT_BALANCES_COLLECTION).doc(eventId);
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
      console.log(`[ledgerProcessor] DELETE bill ${billId}`);

      const previousBalances = before.processedBalances;
      if (previousBalances && Object.keys(previousBalances).length > 0) {
        await reverseFootprint(billId, before.ownerId, previousBalances);
        console.log(`[ledgerProcessor] Stage 2: reversed footprint`);
      }

      if (before.eventId) {
        try {
          await rebuildEventCache(before.eventId, billId);
          console.log(`[ledgerProcessor] Stage 3: event cache rebuilt`);
        } catch (err) {
          console.error(`[ledgerProcessor] Stage 3 failed (non-fatal):`, err);
        }
      }
      return;
    }

    // ── CREATE or UPDATE ────────────────────────────────────────────────────
    if (!after) return;

    // Guard: skip if no relevant fields changed
    // (prevents infinite loop from our own processedBalances write)
    if (before && !hasRelevantChange(before, after)) {
      return;
    }

    const stage = before ? 'UPDATE' : 'CREATE';
    console.log(`[ledgerProcessor] ${stage} bill ${billId}`);

    // ── Stage 1: VALIDATE & CALCULATE ───────────────────────────────────────
    const people = after.people || [];
    const ownerId = after.ownerId;
    const creditorId = after.paidById || ownerId;

    if (!after.billData?.items?.length || !ownerId || people.length === 0) {
      console.log(`[ledgerProcessor] Incomplete data, skipping`);
      return;
    }

    const settledPersonIds = after.settledPersonIds || [];
    const personTotals = computePersonTotals(after);

    if (personTotals.length === 0) {
      console.log(`[ledgerProcessor] No person totals, skipping`);
      return;
    }

    // ── Stage 2: FRIEND LEDGER (authoritative, in transaction) ──────────────
    const linkedFriendUids = await resolveLinkedFriends(ownerId);

    if (linkedFriendUids.size > 0) {
      const newFootprint = calculateFriendFootprint({
        people, personTotals, settledPersonIds,
        linkedFriendUids, ownerId, creditorId,
      });

      const deltasApplied = await applyFriendLedger(billId, ownerId, newFootprint);
      console.log(`[ledgerProcessor] Stage 2: ${deltasApplied} friend balance(s) updated`);
    } else {
      console.log(`[ledgerProcessor] Stage 2: no linked friends, skipping`);
    }

    // ── Stage 3: EVENT CACHE (best-effort, outside transaction) ─────────────
    if (after.eventId) {
      try {
        await rebuildEventCache(after.eventId);
        console.log(`[ledgerProcessor] Stage 3: event cache rebuilt`);
      } catch (err) {
        console.error(`[ledgerProcessor] Stage 3 failed (non-fatal):`, err);
      }
    }
  }
);
