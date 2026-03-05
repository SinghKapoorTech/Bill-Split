import { Timestamp } from 'firebase/firestore';

export interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  settledBillIds: string[];
  eventId?: string;
  date: Timestamp;
}
