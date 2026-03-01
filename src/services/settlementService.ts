import { httpsCallable } from 'firebase/functions';
import { functions } from '@/config/firebase';

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
};
