/**
 * settlementProcessor.ts
 *
 * Cloud Function: processSettlement
 *
 * Settles all outstanding bills between two users in a single transaction.
 *   1. Reads balances to get balance and unsettledBillIds
 *   2. Fetches each bill by ID (no broad queries)
 *   3. Marks each bill settled (settledPersonIds + unsettledParticipantIds)
 *   4. Zeros the balances balance and clears unsettledBillIds
 *   5. Writes an immutable settlement record
 *
 * The ledgerProcessor pipeline does NOT need to re-fire here because we
 * directly zero the balance. The per-bill settledPersonIds changes will
 * trigger the pipeline, but the balance is already zeroed atomically.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { getFriendBalanceId, BALANCE_THRESHOLD, toSingleBalance } from '../../shared/ledgerCalculations.js';

let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'balances';
const SETTLEMENTS_COLLECTION = 'settlements';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SettleRequest {
  friendUserId: string;
}

export interface SettleResult {
  settlementId: string;
  billsSettled: number;
  billsSkipped: number;
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
function findPersonId(people: { id: string }[], targetUid: string): string | null {
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

  // Result counters are assigned from the committed attempt at the end of the
  // transaction closure — never accumulated inside it — so a Firestore retry
  // (which re-runs the whole closure) can't double-count or duplicate them.
  let billsSettled = 0;
  let billsSkipped = 0;
  let amountSettled = 0;

  await db().runTransaction(async (tx) => {
    // 1. Read balances
    const balanceSnap = await tx.get(balanceRef);
    if (!balanceSnap.exists) {
      return; // No balance document → nothing to settle
    }

    const balanceData = balanceSnap.data()!;
    const currentBalance: number = balanceData.balance ?? 0;
    const unsettledBillIds: string[] = balanceData.unsettledBillIds ?? [];

    if (Math.abs(currentBalance) < BALANCE_THRESHOLD && unsettledBillIds.length === 0) {
      return; // Already settled
    }

    // 2. Read all unsettled bills
    const billRefs = unsettledBillIds.map(id =>
      db().collection(BILLS_COLLECTION).doc(id)
    );
    const billSnaps = await Promise.all(billRefs.map(ref => tx.get(ref)));

    // 3. Mark each bill as settled for THAT BILL's debtor — the pair member
    //    who did not pay it. A pair's unsettled bills can point in both
    //    directions (mixed/offsetting debts), so the aggregate debtor must
    //    not be blanket-settled onto every bill: that would settle the
    //    creditor on reverse-direction bills and silently erase the debt.
    //    CRITICAL: Also update processedBalances to zero the debtor's entry.
    //    Without this, the ledgerProcessor would fire (settledPersonIds changed),
    //    see a non-zero processedBalances, compute a delta, and re-apply it on
    //    top of the already-zeroed balances — causing a double-count.
    const settledBillIds: string[] = [];
    const skippedBillIds: string[] = [];   // declared INSIDE the closure (retry-safe)
    // Balance-sign contribution of the bills we actually settle. The pair
    // balance is reduced by EXACTLY this — so bills we skip keep their debt.
    let settledDelta = 0;
    const now = Timestamp.now();

    for (let i = 0; i < billRefs.length; i++) {
      const snap = billSnaps[i];
      if (!snap.exists) continue;

      const bill = snap.data()!;
      const people = bill.people ?? [];

      // This bill's debtor = the pair member who is not its payer/anchor.
      const billAnchorUid = toUid(bill.paidById || bill.ownerId);
      const billDebtorUid =
        billAnchorUid === callerId ? friendUserId :
        billAnchorUid === friendUserId ? callerId : null;
      const debtorPersonId = billDebtorUid ? findPersonId(people, billDebtorUid) : null;
      if (!billDebtorUid || !debtorPersonId) {
        logger.warn('Settlement: could not resolve this bill\'s debtor', {
          billId: unsettledBillIds[i],
          billAnchorUid,
          pair: [callerId, friendUserId],
          peopleIds: people.map((p: { id: string }) => p.id),
        });
        skippedBillIds.push(unsettledBillIds[i]);
        continue;
      }

      // Skip if already settled
      if ((bill.settledPersonIds ?? []).includes(debtorPersonId)) continue;

      // Zero out this friend's processedBalances entry so the ledgerProcessor
      // sees no delta when it fires from the settledPersonIds change.
      const currentProcessed: Record<string, number> = bill.processedBalances ?? {};
      settledDelta += toSingleBalance(billAnchorUid, billDebtorUid, currentProcessed[billDebtorUid] ?? 0);
      const updatedProcessed = { ...currentProcessed };
      delete updatedProcessed[billDebtorUid];

      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayUnion(debtorPersonId),
        unsettledParticipantIds: FieldValue.arrayRemove(billDebtorUid),
        processedBalances: updatedProcessed,
      });

      settledBillIds.push(unsettledBillIds[i]);
    }

    // Publish counters from THIS attempt's inner state (retry-safe).
    billsSettled = settledBillIds.length;
    billsSkipped = skippedBillIds.length;

    // Nothing actually settled (e.g. every bill skipped) → leave the balance
    // and record untouched rather than wiping unresolved debt.
    if (settledBillIds.length === 0) return;

    // Direction of the immutable record follows the amount ACTUALLY settled,
    // not the aggregate balance — with skips they can point opposite ways.
    amountSettled = Math.abs(settledDelta);
    const { debtorUid, creditorUid } = deriveDebtorCreditor(
      balanceData.participants,
      settledDelta
    );

    // 4. Reduce the balance by ONLY the settled portion and drop only the
    //    settled bills. Skipped bills keep their debt and stay in
    //    unsettledBillIds so the pipeline can still reverse them.
    tx.update(balanceRef, {
      balance: currentBalance - settledDelta,
      unsettledBillIds: skippedBillIds,
      lastUpdatedAt: now,
    });

    // 5. Write settlement record (amount = what was actually settled)
    tx.set(settlementRef, {
      id: settlementRef.id,
      fromUserId: debtorUid,
      toUserId: creditorUid,
      amount: amountSettled,
      settledBillIds,
      ...(skippedBillIds.length > 0 && { skippedBillIds }),
      date: now,
    });
  });

  if (billsSettled === 0 && amountSettled < BALANCE_THRESHOLD) {
    logger.info('Nothing to settle', { callerId, friendUserId, balanceId });
    return { settlementId: '', billsSettled: 0, billsSkipped: 0, amountSettled: 0 };
  }

  logger.info('Settlement processed', {
    settlementId: settlementRef.id,
    callerId,
    friendUserId,
    billsSettled,
    billsSkipped,
    amountSettled,
  });

  return {
    settlementId: settlementRef.id,
    billsSettled,
    billsSkipped,
    amountSettled,
  };
}
