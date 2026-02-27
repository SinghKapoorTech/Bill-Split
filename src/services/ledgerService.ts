import { PersonTotal } from '@/types';

/**
 * Ledger orchestration service — NOW A NO-OP.
 *
 * All ledger mutations are handled by the server-side `ledgerProcessor` Cloud Function,
 * which triggers on Firestore `onDocumentWritten('bills/{billId}')`.
 *
 * The client only writes bill documents. The pipeline handles:
 *   - friend_balances updates (authoritative, in transaction)
 *   - event_balances cache rebuilds (best-effort)
 *   - Footprint reversal on bill deletion
 *
 * These methods are retained with their original signatures so existing callers
 * don't break during the transition. They will be fully removed in a future cleanup.
 */
export const ledgerService = {
  async applyBillToLedgers(
    _billId: string,
    _ownerId: string,
    _personTotals: PersonTotal[],
    _eventId?: string
  ): Promise<void> {
    // No-op: handled by server-side ledgerProcessor pipeline
  },

  async reverseBillFromLedgers(
    _billId: string,
    _ownerId: string,
    _eventId?: string,
    _prevFriendBalances?: Record<string, number>,
    _prevEventBalances?: Record<string, number>
  ): Promise<void> {
    // No-op: handled by server-side ledgerProcessor pipeline (onDelete trigger)
  },
};
