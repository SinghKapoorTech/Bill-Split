import { Timestamp } from 'firebase/firestore';
import { Person } from './person.types';

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';
export type RecurringBillStatus = 'active' | 'paused' | 'completed';

export interface RecurringBillSchedule {
  frequency: RecurringFrequency;
  dayOfWeek?: number;   // 0 (Sun) – 6 (Sat), for weekly/biweekly
  dayOfMonth?: number;  // 1–31, for monthly
  startDate: string;    // ISO date "2026-06-01"
  endDate?: string;     // optional ISO date
}

export interface RecurringBill {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  amount: number;
  paidById: string;
  people: Person[];
  splitEvenly: boolean;
  exactAmounts?: Record<string, number>;
  schedule: RecurringBillSchedule;
  status: RecurringBillStatus;
  nextRunDate: string;        // ISO date of next bill to generate
  lastRunDate: string | null; // ISO date of last generated bill
  generatedBillIds: string[];
  eventId?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
