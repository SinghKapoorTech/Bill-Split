import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Bill } from '@/types/bill.types';
import { billService } from '@/services/billService';

export function useGroupBills(groupId: string) {
  const { user } = useAuth();
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!groupId || !user) {
      setBills([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const billsRef = collection(db, 'bills');
    // Query bills for this group, ordered by creation time
    const q = query(
      billsRef, 
      where('groupId', '==', groupId), 
      where('status', '==', 'active'),
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
      console.error("Error fetching group bills:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [groupId, user]);

  const createTransaction = useCallback(async (data: any) => {
    if (!user || !groupId) throw new Error("User or group not specified.");

    // Use billService to create the bill
    // We assume 'data' contains necessary bill info. 
    // If data is partial, we might need to adapt it.
    // For now, we assume the caller passes compatible data or we default it.
    
    const billId = await billService.createBill(
      user.uid,
      user.displayName || 'Anonymous',
      'group',
      data.billData || { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
      data.people || [],
      groupId
    );
    
    // Update other fields if provided
    if (data.itemAssignments || data.customTip) {
        await billService.updateBill(billId, {
            itemAssignments: data.itemAssignments,
            customTip: data.customTip,
            customTax: data.customTax,
            assignmentMode: data.assignmentMode,
            splitEvenly: data.splitEvenly,
            receiptImageUrl: data.receiptImageUrl,
            receiptFileName: data.receiptFileName
        });
    }

    return billId;
  }, [user, groupId]);

  const updateTransaction = useCallback(async (billId: string, data: Partial<Bill>) => {
    await billService.updateBill(billId, data);
  }, []);

  const deleteTransaction = useCallback(async (billId: string) => {
    // We archive instead of delete, or use delete if that's the requirement.
    // Architecture doc says "Owner can delete group (which archives all bills)".
    // For individual bills, "Owner has full control (create, edit, delete, assign)".
    // Let's assume delete means archive for now, or hard delete?
    // billService doesn't have delete, only update.
    // Let's assume status='archived' is the way.
    await billService.updateBill(billId, { status: 'archived' });
  }, []);

  return {
    transactions: bills, // Keep alias for compatibility if needed, or rename to bills
    bills,
    loading,
    createTransaction,
    updateTransaction,
    deleteTransaction,
  };
}
