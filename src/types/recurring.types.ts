import { Timestamp } from 'firebase/firestore';
import { Person } from './person.types';
import { BillData, Bill } from './bill.types';

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';
export type RecurringBillStatus = 'active' | 'paused' | 'completed';

/** Which kind of bill each cycle generates. */
export type RecurringGeneratedType = 'quick' | 'detailed' | 'airbnb';

/** Airbnb stay metadata, mirrored from Bill['airbnbData']. */
export type RecurringAirbnbData = NonNullable<Bill['airbnbData']>;

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

  /**
   * Which kind of bill each cycle generates. Absent on legacy docs → treat as 'quick'.
   */
  generatedType?: RecurringGeneratedType;

  /**
   * Full bill snapshot copied into each generated occurrence. Present for
   * 'detailed' and 'airbnb' (and new 'quick') templates. Absent on legacy quick
   * docs, which fall back to the amount-based builder server-side.
   */
  billData?: BillData;
  itemAssignments?: Record<string, string[]>;

  // Airbnb-specific snapshot fields (only for generatedType === 'airbnb')
  isAirbnb?: boolean;
  airbnbData?: RecurringAirbnbData;

  createdAt: Timestamp;
  updatedAt: Timestamp;
}
