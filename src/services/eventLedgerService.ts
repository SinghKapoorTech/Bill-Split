import { Timestamp } from 'firebase/firestore';

export type { OptimizedDebt } from '@shared/optimizeDebts';

/**
 * Event ledger types.
 *
 * Write functions have been removed — all event_balances mutations are now
 * handled by the server-side ledgerProcessor Cloud Function (Stage 3: per-pair deltas).
 *
 * This file retains type interfaces for use by read-side hooks (e.g., useEventLedger).
 */

/**
 * Per-pair balance document within an event.
 * Mirrors the friend_balances schema but scoped to a single event.
 */
export interface EventPairBalance {
  id: string;
  eventId: string;
  participants: string[];
  balance: number;
  unsettledBillIds: string[];
  lastUpdatedAt: Timestamp;
  lastBillId: string;
}

