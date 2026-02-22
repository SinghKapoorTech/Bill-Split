import { Timestamp } from 'firebase/firestore';

export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  date: Timestamp;
  eventId?: string; // Optional: If the settlement was made specifically for an event
}
