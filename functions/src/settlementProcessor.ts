/**
 * settlementProcessor.ts
 *
 * Cloud Function: processSettlement
 *
 * Settles all outstanding bills between two users in a single transaction.
 *   1. Reads friend_balances to get balance and unsettledBillIds
 *   2. Fetches each bill by ID (no broad queries)
 *   3. Marks each bill settled (settledPersonIds + unsettledParticipantIds)
 *   4. Zeros the friend_balances balance and clears unsettledBillIds
 *   5. Writes an immutable settlement record
 *
 * The ledgerProcessor pipeline does NOT need to re-fire here because we
 * directly zero the balance. The per-bill settledPersonIds changes will
 * trigger the pipeline, but the balance is already zeroed atomically.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFriendBalanceId } from '../../shared/ledgerCalculations.js';

let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';
const SETTLEMENTS_COLLECTION = 'settlements';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SettleRequest {
  friendUserId: string;
}

export interface SettleResult {
  settlementId: string;
  billsSettled: number;
  amountSettled: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toUid(personId: string): string {
  return personId.startsWith('user-') ? personId.slice(5) : personId;
}

/**
 * Derives debtor and creditor from balance sign + sorted participants.
 *   balance > 0 → participants[0] is owed (creditor), participants[1] is debtor
 *   balance < 0 → participants[1] is owed (creditor), participants[0] is debtor
 */
function deriveDebtorCreditor(
  participants: string[],
  balance: number
): { debtorUid: string; creditorUid: string } {
  const sorted = [...participants].sort();
  if (balance > 0) {
    return { creditorUid: sorted[0], debtorUid: sorted[1] };
  }
  return { creditorUid: sorted[1], debtorUid: sorted[0] };
}

/**
 * Finds the bill-local person ID that maps to a given Firebase UID.
 */
function findPersonId(people: any[], targetUid: string): string | null {
  for (const p of people) {
    if (toUid(p.id) === targetUid) return p.id;
  }
  return null;
}

// ─── Core processor ─────────────────────────────────────────────────────────

export async function processSettlementCore(
  callerId: string,
  req: SettleRequest
): Promise<SettleResult> {
  const { friendUserId } = req;

  if (!friendUserId) {
    throw new HttpsError('invalid-argument', 'friendUserId is required');
  }
  if (callerId === friendUserId) {
    throw new HttpsError('invalid-argument', 'Cannot settle with yourself');
  }

  const balanceId = getFriendBalanceId(callerId, friendUserId);
  const balanceRef = db().collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
  const settlementRef = db().collection(SETTLEMENTS_COLLECTION).doc();

  let billsSettled = 0;
  let amountSettled = 0;

  await db().runTransaction(async (tx) => {
    // 1. Read friend_balances
    const balanceSnap = await tx.get(balanceRef);
    if (!balanceSnap.exists) {
      return; // No balance document → nothing to settle
    }

    const balanceData = balanceSnap.data()!;
    const currentBalance: number = balanceData.balance ?? 0;
    const unsettledBillIds: string[] = balanceData.unsettledBillIds ?? [];

    if (Math.abs(currentBalance) < 0.01 && unsettledBillIds.length === 0) {
      return; // Already settled
    }

    amountSettled = Math.abs(currentBalance);
    const { debtorUid, creditorUid } = deriveDebtorCreditor(
      balanceData.participants,
      currentBalance
    );

    // 2. Read all unsettled bills
    const billRefs = unsettledBillIds.map(id =>
      db().collection(BILLS_COLLECTION).doc(id)
    );
    const billSnaps = await Promise.all(billRefs.map(ref => tx.get(ref)));

    // 3. Mark each bill as settled for the debtor.
    //    CRITICAL: Also update processedBalances to zero the debtor's entry.
    //    Without this, the ledgerProcessor would fire (settledPersonIds changed),
    //    see a non-zero processedBalances, compute a delta, and re-apply it on
    //    top of the already-zeroed friend_balances — causing a double-count.
    const settledBillIds: string[] = [];
    const now = Timestamp.now();

    for (let i = 0; i < billRefs.length; i++) {
      const snap = billSnaps[i];
      if (!snap.exists) continue;

      const bill = snap.data()!;
      const people = bill.people ?? [];

      // Find the debtor's person ID in this bill
      const debtorPersonId = findPersonId(people, debtorUid);
      if (!debtorPersonId) continue;

      // Skip if already settled
      if ((bill.settledPersonIds ?? []).includes(debtorPersonId)) continue;

      // Zero out this friend's processedBalances entry so the ledgerProcessor
      // sees no delta when it fires from the settledPersonIds change.
      const currentProcessed: Record<string, number> = bill.processedBalances ?? {};
      const updatedProcessed = { ...currentProcessed };
      delete updatedProcessed[debtorUid];

      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayUnion(debtorPersonId),
        unsettledParticipantIds: FieldValue.arrayRemove(debtorUid),
        processedBalances: updatedProcessed,
      });

      settledBillIds.push(unsettledBillIds[i]);
      billsSettled++;
    }

    // 4. Zero the balance and clear unsettled bill IDs
    tx.update(balanceRef, {
      balance: 0,
      unsettledBillIds: [],
      lastUpdatedAt: now,
    });

    // 5. Write settlement record
    tx.set(settlementRef, {
      id: settlementRef.id,
      fromUserId: debtorUid,
      toUserId: creditorUid,
      amount: amountSettled,
      settledBillIds,
      date: now,
    });
  });

  if (billsSettled === 0 && amountSettled < 0.01) {
    logger.info('Nothing to settle', { callerId, friendUserId, balanceId });
    return { settlementId: '', billsSettled: 0, amountSettled: 0 };
  }

  logger.info('Settlement processed', {
    settlementId: settlementRef.id,
    callerId,
    friendUserId,
    billsSettled,
    amountSettled,
  });

  return {
    settlementId: settlementRef.id,
    billsSettled,
    amountSettled,
  };
}
