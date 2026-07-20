import { Bill } from '@/types/bill.types';
import { getSettlementStatus, getSettlementStatusForUser } from '@/utils/billCalculations';

export type BillFilter = 'all' | 'unsettled' | 'settled' | 'recurring';

/**
 * Whether a regular bill matches the active filter for this viewer.
 * Settlement status mirrors MobileBillCard: per-user when a userId is present,
 * otherwise the aggregate getSettlementStatus.
 */
export function billMatchesFilter(filter: BillFilter, bill: Bill, userId: string | undefined): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'recurring':
      return false;
    case 'unsettled':
    case 'settled': {
      const status = userId ? getSettlementStatusForUser(bill, userId) : getSettlementStatus(bill);
      return filter === 'settled' ? status === 'settled' : status !== 'settled';
    }
    default:
      return false;
  }
}

/**
 * Whether a recurring-bill template matches the active filter.
 * Recurring templates only appear in the "all" and "recurring" views.
 */
export function recurringMatchesFilter(filter: BillFilter): boolean {
  return filter === 'all' || filter === 'recurring';
}
