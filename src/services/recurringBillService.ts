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
import { RecurringBill } from '@/types/recurring.types';
import { Person } from '@/types/person.types';
import { RecurringBillSchedule } from '@/types/recurring.types';

const COLLECTION = 'recurring_bills';

/**
 * Compute the first nextRunDate from a schedule config.
 */
function computeNextRunDate(schedule: RecurringBillSchedule): string {
  return schedule.startDate;
}

export const recurringBillService = {
  async createRecurringBill(params: {
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
  }): Promise<string> {
    const ref = doc(collection(db, COLLECTION));
    const nextRunDate = computeNextRunDate(params.schedule);

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
      id: ref.id,
      ownerId: params.ownerId,
      ownerName: params.ownerName,
      title: params.title,
      amount: params.amount,
      paidById: params.paidById,
      people: cleanPeople,
      splitEvenly: params.splitEvenly,
      schedule: cleanSchedule,
      status: 'active',
      nextRunDate,
      lastRunDate: null,
      generatedBillIds: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (params.exactAmounts) {
      data.exactAmounts = params.exactAmounts;
    }
    if (params.eventId) {
      data.eventId = params.eventId;
    }

    await setDoc(ref, data);
    return ref.id;
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
