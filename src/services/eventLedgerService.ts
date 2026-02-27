import { Timestamp } from 'firebase/firestore';

export type { OptimizedDebt } from '@shared/optimizeDebts';

/**
 * Event ledger types.
 *
 * Write functions have been removed — all event_balances mutations are now
 * handled by the server-side ledgerProcessor Cloud Function (Stage 3: cache rebuild).
 *
 * This file retains the EventLedger interface for use by read-side hooks
 * (e.g., useEventLedger).
 */

export interface EventLedger {
  eventId: string;
  netBalances: Record<string, number>;
  optimizedDebts: import('@shared/optimizeDebts').OptimizedDebt[];
  processedBillIds: string[];
  lastUpdatedAt: Timestamp;
}
