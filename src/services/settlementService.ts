import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { Settlement } from '@/types/settlement.types';

const SETTLEMENTS_COLLECTION = 'settlements';

export interface SettlementResult {
  settlementId: string;
  billsSettled: number;
  amountApplied: number;
  remainingAmount: number;
  hasMore: boolean;
}


export const settlementService = {
  /**
   * Requests a settlement via the Cloud Function.
   * The function atomically marks bills as settled and updates all ledgers.
   * Sends an idempotencyKey to prevent duplicate settlements on network retry.
   */
  async requestSettlement(
    fromUserId: string,
    toUserId: string,
    amount: number,
    eventId?: string
  ): Promise<SettlementResult> {
    const idempotencyKey = crypto.randomUUID();

    const fn = httpsCallable<
      { fromUserId: string; toUserId: string; amount: number; eventId?: string; idempotencyKey: string },
      SettlementResult
    >(functions, 'processSettlement');

    const result = await fn({ fromUserId, toUserId, amount, idempotencyKey, ...(eventId ? { eventId } : {}) });
    return result.data;
  },

  /**
   * Gets all global settlements between two friends
   */
  async getFriendSettlements(userA: string, userB: string): Promise<Settlement[]> {
    const settlementsRef = collection(db, SETTLEMENTS_COLLECTION);
    
    // We have to query both directions since Firestore doesn't support OR on array fields simply here
    // And we don't have a combined string like userA_userB setup right now.
    const q1 = query(
      settlementsRef,
      where('fromUserId', '==', userA),
      where('toUserId', '==', userB)
    );
    
    const q2 = query(
      settlementsRef,
      where('fromUserId', '==', userB),
      where('toUserId', '==', userA)
    );
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    const settlements = [
      ...snap1.docs.map(d => ({ id: d.id, ...d.data() } as Settlement)),
      ...snap2.docs.map(d => ({ id: d.id, ...d.data() } as Settlement))
    ];
    
    // We only want global settlements (no eventId) when querying for standard friends
    const globalSettlements = settlements.filter(s => !s.eventId);
    // Sort descending by date
    return globalSettlements.sort((a, b) => b.date.toMillis() - a.date.toMillis());
  },

  /**
   * Gets all settlements for a specific event
   */
  async getEventSettlements(eventId: string): Promise<Settlement[]> {
    const settlementsRef = collection(db, SETTLEMENTS_COLLECTION);
    const q = query(
      settlementsRef,
      where('eventId', '==', eventId)
    );
    
    const snap = await getDocs(q);
    const settlements = snap.docs.map(d => ({ id: d.id, ...d.data() } as Settlement));
    
    // Sort descending by date
    return settlements.sort((a, b) => b.date.toMillis() - a.date.toMillis());
  },

  /**
   * Reverses a settlement via the Cloud Function.
   * Un-settles bills, reverses remaining amount from friend_balances,
   * and deletes the settlement record atomically.
   */
  async deleteSettlement(settlementId: string): Promise<{ reversed: boolean; billsReversed: number }> {
    const fn = httpsCallable<
      { settlementId: string },
      { reversed: boolean; billsReversed: number }
    >(functions, 'reverseSettlement');

    const result = await fn({ settlementId });
    return result.data;
  }
};
