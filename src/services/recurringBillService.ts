import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  orderBy,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  RecurringBill,
  RecurringBillSchedule,
  RecurringGeneratedType,
  RecurringAirbnbData,
} from '@/types/recurring.types';
import { Person } from '@/types/person.types';
import { BillData } from '@/types/bill.types';
import { firstRunDate } from '@shared/recurringSchedule';

const COLLECTION = 'recurring_bills';

/**
 * The first run date, aligned to the schedule's dayOfWeek / dayOfMonth on or
 * after the start date (not the raw start date — see shared/recurringSchedule).
 */
function computeNextRunDate(schedule: RecurringBillSchedule): string {
  return firstRunDate(schedule);
}

/** Fields a user can set when creating OR editing a recurring bill template. */
export interface RecurringBillInput {
  ownerId: string;
  ownerName: string;
  title: string;
  amount: number;
  paidById: string;
  people: Person[];
  splitEvenly: boolean;
  exactAmounts?: Record<string, number>;
  schedule: RecurringBillSchedule;
  eventId?: string;
  generatedType?: RecurringGeneratedType;
  billData?: BillData;
  itemAssignments?: Record<string, string[]>;
  isAirbnb?: boolean;
  airbnbData?: RecurringAirbnbData;
}

/**
 * Build the Firestore-safe writable fields shared by create and update.
 * Strips `undefined` (Firestore rejects it) via conditional inclusion.
 */
function buildWritableData(params: RecurringBillInput): Record<string, unknown> {
  const cleanPeople = params.people.map(p => {
    const clean: Record<string, unknown> = { id: p.id, name: p.name };
    if (p.venmoId) clean.venmoId = p.venmoId;
    return clean;
  });

  const cleanSchedule: Record<string, unknown> = {
    frequency: params.schedule.frequency,
    startDate: params.schedule.startDate,
  };
  if (params.schedule.dayOfWeek !== undefined) cleanSchedule.dayOfWeek = params.schedule.dayOfWeek;
  if (params.schedule.dayOfMonth !== undefined) cleanSchedule.dayOfMonth = params.schedule.dayOfMonth;
  if (params.schedule.endDate) cleanSchedule.endDate = params.schedule.endDate;

  const data: Record<string, unknown> = {
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    title: params.title,
    amount: params.amount,
    paidById: params.paidById,
    people: cleanPeople,
    splitEvenly: params.splitEvenly,
    schedule: cleanSchedule,
    generatedType: params.generatedType ?? 'quick',
  };

  if (params.exactAmounts) data.exactAmounts = params.exactAmounts;
  if (params.eventId) data.eventId = params.eventId;
  // Bill snapshot copied into each generated occurrence (detailed/airbnb/quick).
  if (params.billData) data.billData = params.billData;
  if (params.itemAssignments) data.itemAssignments = params.itemAssignments;
  if (params.isAirbnb) data.isAirbnb = true;
  if (params.airbnbData) data.airbnbData = params.airbnbData;

  return data;
}

export const recurringBillService = {
  async createRecurringBill(params: RecurringBillInput): Promise<string> {
    const ref = doc(collection(db, COLLECTION));

    const data: Record<string, unknown> = {
      ...buildWritableData(params),
      id: ref.id,
      status: 'active',
      nextRunDate: computeNextRunDate(params.schedule),
      lastRunDate: null,
      generatedBillIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, data);
    return ref.id;
  },

  /**
   * Update an existing template in place (edit flow). Rewrites the user-editable
   * fields and recomputes nextRunDate from the (possibly changed) schedule;
   * preserves createdAt/status/generatedBillIds.
   */
  async updateRecurringBillFromInput(id: string, params: RecurringBillInput): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
      ...buildWritableData(params),
      nextRunDate: computeNextRunDate(params.schedule),
      updatedAt: serverTimestamp(),
    });
  },

  async getRecurringBill(id: string): Promise<RecurringBill | null> {
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? (snap.data() as RecurringBill) : null;
  },

  async getRecurringBillsByUser(userId: string): Promise<RecurringBill[]> {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data() as RecurringBill);
  },

  subscribeToUserRecurringBills(
    userId: string,
    onData: (bills: RecurringBill[]) => void,
    onError?: (error: Error) => void
  ): Unsubscribe {
    const q = query(
      collection(db, COLLECTION),
      where('ownerId', '==', userId),
      orderBy('createdAt', 'desc')
    );
    return onSnapshot(
      q,
      (snap) => onData(snap.docs.map(d => d.data() as RecurringBill)),
      (err) => onError?.(err)
    );
  },

  async updateRecurringBill(
    id: string,
    updates: Partial<Omit<RecurringBill, 'id' | 'createdAt'>>
  ): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
  },

  async pauseRecurringBill(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'paused',
      updatedAt: serverTimestamp(),
    });
  },

  async resumeRecurringBill(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  },

  async deleteRecurringBill(id: string): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), {
      status: 'completed',
      updatedAt: serverTimestamp(),
    });
  },
};
