/**
 * settlementReversal.ts
 *
 * Cloud Function: reverseSettlement
 *
 * Reverses a previously created settlement:
 *   - Un-marks settled bills (removes from settledPersonIds, restores unsettledParticipantIds)
 *   - Reverses any "remaining amount" that was applied directly to friend_balances
 *   - Deletes the settlement record
 *
 * The ledgerProcessor pipeline auto-fires for each modified bill and recalculates
 * friend_balances + rebuilds event_balances cache. The only direct friend_balances
 * write here is reversing the remaining amount (which has no associated bill).
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { personIdToFirebaseUid, getFriendBalanceId } from '../../shared/ledgerCalculations.js';

// Lazy-initialized: getFirestore() must not run at import time because
// initializeApp() in index.ts may not have executed yet.
let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';
const SETTLEMENTS_COLLECTION = 'settlements';

// ─── Exported types ─────────────────────────────────────────────────────────

export interface ReversalRequest {
  settlementId: string;
}

export interface ReversalResult {
  reversed: boolean;
  billsReversed: number;
}

// ─── Core processor ─────────────────────────────────────────────────────────

export async function processSettlementReversalCore(
  callerId: string,
  req: ReversalRequest
): Promise<ReversalResult> {
  const { settlementId } = req;

  if (!settlementId) {
    throw new HttpsError('invalid-argument', 'settlementId is required');
  }

  // Read settlement (outside transaction — it's immutable until we delete it)
  const settlementRef = db().collection(SETTLEMENTS_COLLECTION).doc(settlementId);
  const settlementSnap = await settlementRef.get();

  if (!settlementSnap.exists) {
    throw new HttpsError('not-found', 'Settlement not found');
  }

  const settlement = settlementSnap.data()!;
  const { fromUserId, toUserId, settledBillIds, remainingAmount } = settlement;

  // Permission check: only participants can reverse
  if (callerId !== fromUserId && callerId !== toUserId) {
    throw new HttpsError('permission-denied', 'Only settlement participants can reverse it');
  }

  const billIds: string[] = settledBillIds || [];
  let billsReversed = 0;

  await db().runTransaction(async (tx) => {
    // ── Phase 1: Reads (Firestore requires all reads before writes) ───────

    // Read all settled bills
    const billRefs = billIds.map(id => db().collection(BILLS_COLLECTION).doc(id));
    const billSnaps = await Promise.all(billRefs.map(r => tx.get(r)));

    // Read friend_balances doc if we need to reverse remaining amount
    const hasRemaining = typeof remainingAmount === 'number' && remainingAmount > 0.01;
    const balId = getFriendBalanceId(fromUserId, toUserId);
    const balRef = db().collection(FRIEND_BALANCES_COLLECTION).doc(balId);
    const balSnap = hasRemaining ? await tx.get(balRef) : null;

    // ── Phase 2: Writes ──────────────────────────────────────────────────

    for (let i = 0; i < billRefs.length; i++) {
      const snap = billSnaps[i];
      if (!snap.exists) continue;

      const bill = snap.data()!;
      const billOwner = bill.ownerId;

      // Determine who was settled on this bill:
      // - Bills owned by toUserId: fromUserId was the debtor who was settled
      // - Bills owned by fromUserId: toUserId was the debtor who was settled
      const unsettlingUid = billOwner === toUserId ? fromUserId : toUserId;

      // Find internal person ID (e.g., "user-{uid}") from bill's people array
      const person = (bill.people || []).find(
        (p: any) => personIdToFirebaseUid(p.id) === unsettlingUid
      );
      if (!person) continue;

      // Un-settle: remove from settledPersonIds, restore to unsettledParticipantIds
      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayRemove(person.id),
        unsettledParticipantIds: FieldValue.arrayUnion(unsettlingUid),
      });

      billsReversed++;
    }

    // Reverse remaining amount from friend_balances
    // (This amount was applied directly by the settlement processor, not via a bill)
    if (hasRemaining && balSnap) {
      const existing = balSnap.exists ? balSnap.data()! : null;
      const fromBal = (existing?.balances?.[fromUserId] ?? 0) as number;
      const toBal = (existing?.balances?.[toUserId] ?? 0) as number;

      // Original settlement: fromBal + remaining, toBal - remaining
      // Reversal: fromBal - remaining, toBal + remaining
      tx.set(balRef, {
        id: balId,
        participants: [fromUserId, toUserId],
        balances: {
          [fromUserId]: fromBal - remainingAmount,
          [toUserId]: toBal + remainingAmount,
        },
        lastUpdatedAt: Timestamp.now(),
      }, { merge: true });
    }

    // Delete the settlement record
    tx.delete(settlementRef);
  });

  logger.info('Settlement reversed', { settlementId, billsReversed, fromUserId: settlement.fromUserId, toUserId: settlement.toUserId, amount: settlement.amount });

  return { reversed: true, billsReversed };
}
