import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { RecurringBill } from '@/types/recurring.types';
import { recurringBillService } from '@/services/recurringBillService';

export function useRecurringBills() {
  const { user } = useAuth();
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRecurringBills([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const unsubscribe = recurringBillService.subscribeToUserRecurringBills(
      user.uid,
      (bills) => {
        setRecurringBills(bills);
        setIsLoading(false);
      },
      (error) => {
        console.error('Failed to subscribe to recurring bills:', error);
        setIsLoading(false);
      }
    );

    return unsubscribe;
  }, [user?.uid]);

  return { recurringBills, isLoading };
}
