import { Timestamp } from 'firebase/firestore';

export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  remainingAmount?: number; // Amount not covered by bills (applied directly to friend_balances)
  date: Timestamp;
  eventId?: string; // Optional: If the settlement was made specifically for an event
  billsSettled?: number; // Number of bills fully settled
  settledBillIds?: string[]; // Bill IDs that were fully settled by this settlement (for reversal)
  idempotencyKey?: string; // Client-generated UUID to prevent duplicate settlements on retry
}
