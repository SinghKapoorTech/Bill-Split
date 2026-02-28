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
};
