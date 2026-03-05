import { collection, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { Settlement } from '@/types/settlement.types';

export interface SettleResult {
  settlementId: string;
  billsSettled: number;
  amountSettled: number;
}

export const settlementService = {
  /**
   * Settles all outstanding bills with a friend via the Cloud Function.
   * Atomically marks all shared unsettled bills as settled, zeros the
   * friend_balances balance, and writes a settlement record.
   */
  async requestSettlement(friendUserId: string): Promise<SettleResult> {
    const fn = httpsCallable<
      { friendUserId: string },
      SettleResult
    >(functions, 'processSettlement');

    const result = await fn({ friendUserId });
    return result.data;
  },

  /**
   * Settles all outstanding bills with a friend within a specific event.
   * Only bills in that event are settled. The global friend_balances are
   * updated automatically via the ledgerProcessor flow-through.
   */
  async requestEventSettlement(eventId: string, friendUserId: string): Promise<SettleResult> {
    const fn = httpsCallable<
      { eventId: string; friendUserId: string },
      SettleResult
    >(functions, 'processEventSettlement');

    const result = await fn({ eventId, friendUserId });
    return result.data;
  },

  /**
   * Fetches all settlement records involving the specified user.
   */
  async getSettlementsForUser(userId: string): Promise<Settlement[]> {
    const settlementsCol = collection(db, 'settlements');
    
    // Perform two separate queries to avoid requiring a composite index
    // for an OR query combined with orderBy. Merging in-memory.
    const q1 = query(settlementsCol, where('fromUserId', '==', userId));
    const q2 = query(settlementsCol, where('toUserId', '==', userId));
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    const allDocs = new Map<string, Settlement>();
    
    snap1.docs.forEach(doc => {
      allDocs.set(doc.id, { id: doc.id, ...doc.data() } as Settlement);
    });
    
    snap2.docs.forEach(doc => {
      allDocs.set(doc.id, { id: doc.id, ...doc.data() } as Settlement);
    });
    
    // Sort descending by date (newest first)
    return Array.from(allDocs.values()).sort((a, b) => {
      const t1 = a.date?.toMillis() || 0;
      const t2 = b.date?.toMillis() || 0;
      return t2 - t1;
    });
  },

  /**
   * Reverses a previously created settlement.
   */
  async reverseSettlement(settlementId: string): Promise<{ reversed: boolean; billsReversed: number }> {
    const fn = httpsCallable<
      { settlementId: string },
      { reversed: boolean; billsReversed: number }
    >(functions, 'reverseSettlement');

    const result = await fn({ settlementId });
    return result.data;
  },
};
