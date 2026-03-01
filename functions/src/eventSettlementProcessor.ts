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
 * friend_balances automatically. One settle action reduces both event
 * and global friend balances.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { getEventBalanceId } from '../../shared/ledgerCalculations.js';

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

function findPersonId(people: any[], targetUid: string): string | null {
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

  let billsSettled = 0;
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
    //    Zero processedEventBalances[debtorUid] to prevent ledgerProcessor
    //    from re-applying a delta to event_balances.
    //    Do NOT touch processedBalances — the ledgerProcessor will fire
    //    and update friend_balances automatically (flow-through).
    const settledBillIds: string[] = [];
    const now = Timestamp.now();

    for (let i = 0; i < billRefs.length; i++) {
      const snap = billSnaps[i];
      if (!snap.exists) continue;

      const bill = snap.data()!;
      const people = bill.people ?? [];

      const debtorPersonId = findPersonId(people, debtorUid);
      if (!debtorPersonId) continue;

      // Skip if already settled
      if ((bill.settledPersonIds ?? []).includes(debtorPersonId)) continue;

      // Zero this participant's processedEventBalances entry
      const currentProcessedEvent: Record<string, number> = bill.processedEventBalances ?? {};
      const updatedProcessedEvent = { ...currentProcessedEvent };
      delete updatedProcessedEvent[debtorUid];

      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayUnion(debtorPersonId),
        unsettledParticipantIds: FieldValue.arrayRemove(debtorUid),
        processedEventBalances: updatedProcessedEvent,
      });

      settledBillIds.push(unsettledBillIds[i]);
      billsSettled++;
    }

    // 4. Zero the event pair balance
    tx.update(balanceRef, {
      balance: 0,
      unsettledBillIds: [],
      lastUpdatedAt: now,
    });

    // 5. Write settlement record with eventId
    tx.set(settlementRef, {
      id: settlementRef.id,
      fromUserId: debtorUid,
      toUserId: creditorUid,
      amount: amountSettled,
      settledBillIds,
      eventId,
      date: now,
    });
  });

  if (billsSettled === 0 && amountSettled < 0.01) {
    logger.info('Nothing to settle (event)', { callerId, friendUserId, eventId, balanceId });
    return { settlementId: '', billsSettled: 0, amountSettled: 0 };
  }

  logger.info('Event settlement processed', {
    settlementId: settlementRef.id,
    callerId,
    friendUserId,
    eventId,
    billsSettled,
    amountSettled,
  });

  return {
    settlementId: settlementRef.id,
    billsSettled,
    amountSettled,
  };
}
