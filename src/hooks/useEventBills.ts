import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  doc,
  deleteDoc,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Bill } from '@/types/bill.types';
import { billService } from '@/services/billService';

export function useEventBills(eventId: string) {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId || !user) {
      setBills([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const billsRef = collection(db, 'bills');
    const q = query(
      billsRef, 
      where('eventId', '==', eventId), 
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const billsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Bill[];
      setBills(billsData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching event bills:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [eventId, user]);

  const createTransaction = useCallback(async (data: any) => {
    if (!user || !eventId) throw new Error('User or event not specified.');

    const billId = await billService.createBill(
      user.uid,
      user.displayName || 'Anonymous',
      'group',
      data.billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
      data.people || [],
      eventId
    );
    
    if (data.itemAssignments || data.splitEvenly || data.receiptImageUrl || data.receiptFileName) {
      const updates: any = {};
      if (data.itemAssignments) updates.itemAssignments = data.itemAssignments;
      if (data.splitEvenly !== undefined) updates.splitEvenly = data.splitEvenly;
      if (data.receiptImageUrl) updates.receiptImageUrl = data.receiptImageUrl;
      if (data.receiptFileName) updates.receiptFileName = data.receiptFileName;
      
      await billService.updateBill(billId, updates);
    }

    return billId;
  }, [user, eventId]);

  const updateTransaction = useCallback(async (billId: string, data: Partial<Bill>) => {
    await billService.updateBill(billId, data);
  }, []);

  const deleteTransaction = useCallback(async (billId: string) => {
    const billRef = doc(db, 'bills', billId);
    await deleteDoc(billRef);
  }, []);

  return {
    transactions: bills,
    bills,
    loading,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
