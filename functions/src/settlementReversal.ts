/**
 * settlementReversal.ts
 *
 * Cloud Function: reverseSettlement
 *
 * Reverses a previously created settlement:
 *   1. Un-marks settled bills (removes from settledPersonIds, restores unsettledParticipantIds)
 *   2. Deletes the settlement record
 *
 * The ledgerProcessor pipeline auto-fires for each modified bill and recalculates
 * friend_balances (single balance + unsettledBillIds). No direct friend_balances
 * writes are needed here.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { personIdToFirebaseUid } from '../../shared/ledgerCalculations.js';

let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const SETTLEMENTS_COLLECTION = 'settlements';

// ─── Types ──────────────────────────────────────────────────────────────────

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

  const settlementRef = db().collection(SETTLEMENTS_COLLECTION).doc(settlementId);
  const settlementSnap = await settlementRef.get();

  if (!settlementSnap.exists) {
    throw new HttpsError('not-found', 'Settlement not found');
  }

  const settlement = settlementSnap.data()!;
  const { fromUserId, toUserId, settledBillIds } = settlement;

  if (callerId !== fromUserId && callerId !== toUserId) {
    throw new HttpsError('permission-denied', 'Only settlement participants can reverse it');
  }

  const billIds: string[] = settledBillIds || [];
  let billsReversed = 0;

  await db().runTransaction(async (tx) => {
    // Phase 1: Read all settled bills
    const billRefs = billIds.map(id => db().collection(BILLS_COLLECTION).doc(id));
    const billSnaps = await Promise.all(billRefs.map(r => tx.get(r)));

    // Phase 2: Un-settle each bill
    for (let i = 0; i < billRefs.length; i++) {
      const snap = billSnaps[i];
      if (!snap.exists) continue;

      const bill = snap.data()!;
      const billOwner = bill.ownerId;

      // Determine who was the debtor on this bill
      const creditorUid = personIdToFirebaseUid(bill.paidById || billOwner);
      const unsettlingUid = creditorUid === toUserId ? fromUserId : toUserId;

      const person = (bill.people || []).find(
        (p: any) => personIdToFirebaseUid(p.id) === unsettlingUid
      );
      if (!person) continue;

      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayRemove(person.id),
        unsettledParticipantIds: FieldValue.arrayUnion(unsettlingUid),
      });

      billsReversed++;
    }

    // Delete the settlement record
    tx.delete(settlementRef);
  });

  logger.info('Settlement reversed', {
    settlementId,
    billsReversed,
    fromUserId,
    toUserId,
  });

  return { reversed: true, billsReversed };
}
