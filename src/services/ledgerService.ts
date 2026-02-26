import { friendBalanceService } from './friendBalanceService';
import { eventLedgerService } from './eventLedgerService';
import { PersonTotal } from '@/types';

/**
 * Unified ledger orchestration service.
 *
 * Writes to both `friend_balances` and `event_balances` in parallel.
 * This is the single entry point for all ledger mutations — callers should
 * never import friendBalanceService or eventLedgerService directly.
 *
 * Both underlying writes are idempotent (delta-based footprint), so calling
 * this multiple times with the same inputs is safe and produces a net-zero diff.
 */
export const ledgerService = {
  /**
   * Applies a bill's financial footprint to both ledgers.
   * Handles bill creates, edits, and per-person settlement toggles identically.
   *
   * @param billId       - Firestore bill document ID
   * @param ownerId      - Firebase UID of the bill owner (the person who paid)
   * @param personTotals - Computed totals per person (from calculatePersonTotals)
   * @param eventId      - Optional. If provided, also updates the event ledger.
   */
  async applyBillToLedgers(
    billId: string,
    ownerId: string,
    personTotals: PersonTotal[],
    eventId?: string
  ): Promise<void> {
    await friendBalanceService.applyBillBalancesIdempotent(billId, ownerId, personTotals);

    if (eventId) {
      await eventLedgerService.applyBillToEventLedgerIdempotent(eventId, billId, ownerId, personTotals);
    }
  },

  /**
   * Reverses a bill's financial footprint from both ledgers.
   * Must be called BEFORE the bill document is deleted to avoid a race condition.
   *
   * @param billId                - Firestore bill document ID
   * @param ownerId               - Firebase UID of the bill owner
   * @param eventId               - Optional. If provided, also reverses from the event ledger.
   * @param prevFriendBalances    - Optional pre-read footprint from bill.processedBalances
   * @param prevEventBalances     - Optional pre-read footprint from bill.eventBalancesApplied
   */
  async reverseBillFromLedgers(
    billId: string,
    ownerId: string,
    eventId?: string,
    prevFriendBalances?: Record<string, number>,
    prevEventBalances?: Record<string, number>
  ): Promise<void> {
    await friendBalanceService.reverseBillBalancesIdempotent(billId, ownerId, prevFriendBalances);

    if (eventId) {
      await eventLedgerService.reverseBillFromEventLedgerIdempotent(eventId, billId, prevEventBalances);
    }
  },
};
