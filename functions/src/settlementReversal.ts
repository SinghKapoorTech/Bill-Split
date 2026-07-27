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
 * balances (single balance + unsettledBillIds). No direct balances
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
  req: ReversalRequest,
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
    const billRefs = billIds.map((id) => db().collection(BILLS_COLLECTION).doc(id));
    const billSnaps = await Promise.all(billRefs.map((r) => tx.get(r)));

    // Phase 2: Un-settle each bill.
    //
    // The person to un-settle is whichever of the settlement's two parties is
    // ACTUALLY recorded in this bill's settledPersonIds. Deriving it from the
    // bill's current paidById (as this used to) breaks the moment someone
    // corrects who paid: the anchor then matches neither party, the old code
    // silently fell through to `toUserId` — the CREDITOR — and un-settled
    // nobody while still deleting the settlement record, erasing the debt.
    // Reading actual settled state is anchor-independent and self-correcting.
    let reversedThisAttempt = 0;
    for (let i = 0; i < billRefs.length; i++) {
      const snap = billSnaps[i];
      if (!snap.exists) continue;

      const bill = snap.data()!;
      const settledPersonIds: string[] = bill.settledPersonIds || [];
      const people = (bill.people || []) as Array<{ id: string }>;
      const isSettledParty = (uid: string) => (p: { id: string }) =>
        personIdToFirebaseUid(p.id) === uid && settledPersonIds.includes(p.id);

      // Prefer the recorded debtor; fall back to the creditor, which is the
      // settled party on reverse-direction bills within a mixed pair.
      const person =
        people.find(isSettledParty(fromUserId)) ?? people.find(isSettledParty(toUserId));

      if (!person) {
        logger.warn('Reversal: neither party is settled on this bill, skipping', {
          settlementId,
          billId: billIds[i],
          fromUserId,
          toUserId,
        });
        continue;
      }

      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayRemove(person.id),
        unsettledParticipantIds: FieldValue.arrayUnion(personIdToFirebaseUid(person.id)),
      });

      reversedThisAttempt++;
    }

    // Publish the counter from THIS attempt's inner state — never accumulate
    // across attempts, or a Firestore transaction retry double-counts.
    // (Mirrors settlementProcessor / eventSettlementProcessor.)
    billsReversed = reversedThisAttempt;

    // Only retire the settlement record if we actually undid something.
    // Deleting it after un-settling nothing would destroy the sole record of
    // the payment while leaving every bill marked settled — the exact failure
    // this function exists to prevent. This is reachable: claimShadowUser
    // rewrites people/itemAssignments/paidById but NOT settledPersonIds, so a
    // claimed guest leaves stale person ids that match neither party.
    // (An orphaned record whose bills were all deleted still gets cleaned up.)
    const anyBillStillExists = billSnaps.some((snap) => snap.exists);
    if (reversedThisAttempt === 0 && anyBillStillExists) {
      throw new HttpsError(
        'failed-precondition',
        'Could not identify the settled party on any bill; settlement left intact.',
      );
    }

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
