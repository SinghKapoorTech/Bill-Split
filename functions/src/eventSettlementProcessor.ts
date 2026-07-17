/**
 * eventSettlementProcessor.ts
 *
 * Cloud Function: processEventSettlement
 *
 * Settles all outstanding bills between two users within a specific event.
 *   1. Reads the event pair balance doc to get balance and unsettledBillIds
 *   2. Fetches each bill by ID
 *   3. Marks each bill settled (settledPersonIds + unsettledParticipantIds)
 *   4. Zeros the event pair balance and clears unsettledBillIds
 *   5. Writes an immutable settlement record with eventId
 *
 * Flow-through: Does NOT zero processedBalances on the bill — so when
 * the ledgerProcessor fires from the settledPersonIds change, it updates
 * balances automatically. One settle action reduces both event
 * and global friend balances.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { getEventBalanceId, BALANCE_THRESHOLD, toSingleBalance } from '../../shared/ledgerCalculations.js';

let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const EVENT_BALANCES_COLLECTION = 'event_balances';
const SETTLEMENTS_COLLECTION = 'settlements';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface EventSettleRequest {
  eventId: string;
  friendUserId: string;
}

export interface EventSettleResult {
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

function findPersonId(people: Array<{ id: string }>, targetUid: string): string | null {
  for (const p of people) {
    if (toUid(p.id) === targetUid) return p.id;
  }
  return null;
}

// ─── Core processor ─────────────────────────────────────────────────────────

export async function processEventSettlementCore(
  callerId: string,
  req: EventSettleRequest
): Promise<EventSettleResult> {
  const { eventId, friendUserId } = req;

  if (!eventId) {
    throw new HttpsError('invalid-argument', 'eventId is required');
  }
  if (!friendUserId) {
    throw new HttpsError('invalid-argument', 'friendUserId is required');
  }
  if (callerId === friendUserId) {
    throw new HttpsError('invalid-argument', 'Cannot settle with yourself');
  }

  const balanceId = getEventBalanceId(eventId, callerId, friendUserId);
  const balanceRef = db().collection(EVENT_BALANCES_COLLECTION).doc(balanceId);
  const settlementRef = db().collection(SETTLEMENTS_COLLECTION).doc();

  // Result counters are assigned from the committed attempt at the end of the
  // transaction closure — never accumulated inside it — so a Firestore retry
  // (which re-runs the whole closure) can't double-count or duplicate them.
  let billsSettled = 0;
  let billsSkipped = 0;
  let amountSettled = 0;

  await db().runTransaction(async (tx) => {
    // 1. Read event pair balance
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
    //    who did not pay it. Offsetting bills (balance ~0 with unsettled
    //    bills in both directions) must each settle their own debtor;
    //    blanket-settling the aggregate debtor would settle the creditor on
    //    reverse-direction bills and silently erase those debts.
    //    Zero ONLY processedEventBalances[billDebtorUid] — the event pair
    //    balance is zeroed directly below, so the pipeline must see no event
    //    delta. processedBalances is deliberately left untouched: when the
    //    ledgerProcessor fires from the settledPersonIds change, it computes a
    //    zero footprint for the debtor, diffs it against the stale
    //    processedBalances entry, and applies the negative delta to the global
    //    balances doc — the flow-through described in this file's docstring.
    const settledBillIds: string[] = [];
    const skippedBillIds: string[] = [];   // declared INSIDE the closure (retry-safe)
    // Balance-sign contribution of the bills we actually settle. The event
    // pair balance is reduced by EXACTLY this — skipped bills keep their debt.
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
        logger.warn('Event settlement: could not resolve this bill\'s debtor', {
          billId: unsettledBillIds[i],
          billAnchorUid,
          pair: [callerId, friendUserId],
          eventId,
          peopleIds: people.map((p: { id: string }) => p.id),
        });
        skippedBillIds.push(unsettledBillIds[i]);
        continue;
      }

      // Skip if already settled
      if ((bill.settledPersonIds ?? []).includes(debtorPersonId)) continue;

      // Zero this participant's processedEventBalances entry (event ledger only)
      const currentProcessedEvent: Record<string, number> = bill.processedEventBalances ?? {};
      settledDelta += toSingleBalance(billAnchorUid, billDebtorUid, currentProcessedEvent[billDebtorUid] ?? 0);
      const updatedProcessedEvent = { ...currentProcessedEvent };
      delete updatedProcessedEvent[billDebtorUid];

      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayUnion(debtorPersonId),
        unsettledParticipantIds: FieldValue.arrayRemove(billDebtorUid),
        processedEventBalances: updatedProcessedEvent,
      });

      settledBillIds.push(unsettledBillIds[i]);
    }

    // Publish counters from THIS attempt's inner state (retry-safe).
    billsSettled = settledBillIds.length;
    billsSkipped = skippedBillIds.length;

    // Nothing actually settled (e.g. every bill skipped) → leave the event
    // pair balance and record untouched rather than wiping unresolved debt.
    if (settledBillIds.length === 0) return;

    // Direction of the immutable record follows the amount ACTUALLY settled,
    // not the aggregate balance — with skips they can point opposite ways.
    amountSettled = Math.abs(settledDelta);
    const { debtorUid, creditorUid } = deriveDebtorCreditor(
      balanceData.participants,
      settledDelta
    );

    // 4. Reduce the event pair balance by ONLY the settled portion and drop
    //    only the settled bills; skipped bills keep their debt and stay tracked.
    tx.update(balanceRef, {
      balance: currentBalance - settledDelta,
      unsettledBillIds: skippedBillIds,
      lastUpdatedAt: now,
    });

    // 5. Write settlement record with eventId (amount = what was actually settled)
    tx.set(settlementRef, {
      id: settlementRef.id,
      fromUserId: debtorUid,
      toUserId: creditorUid,
      amount: amountSettled,
      settledBillIds,
      ...(skippedBillIds.length > 0 && { skippedBillIds }),
      eventId,
      date: now,
    });
  });

  if (billsSettled === 0 && amountSettled < BALANCE_THRESHOLD) {
    logger.info('Nothing to settle (event)', { callerId, friendUserId, eventId, balanceId });
    return { settlementId: '', billsSettled: 0, billsSkipped: 0, amountSettled: 0 };
  }

  logger.info('Event settlement processed', {
    settlementId: settlementRef.id,
    callerId,
    friendUserId,
    eventId,
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
