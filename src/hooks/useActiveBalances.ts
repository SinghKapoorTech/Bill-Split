import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useUserProfile } from './useUserProfile';
import { userService } from '@/services/userService';
import { Friend } from '@/types/person.types';

export function useActiveBalances() {
  const { profile } = useUserProfile();
  const [balances, setBalances] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refreshBalances = async () => {
    if (!profile?.uid) return;
    setIsLoading(true);
    setError(null);
    try {
      const activeBalances = await userService.getActiveBalances(profile.uid);
      setBalances(activeBalances);
    } catch (err) {
      console.error('Error fetching active balances:', err);
      setError(err instanceof Error ? err : new Error('Failed to fetch balances'));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!profile?.uid) {
      setBalances([]);
      setIsLoading(false);
      return;
    }

    // Initial fetch
    refreshBalances();

    // Set up real-time listener to re-fetch when any balance doc involving the user changes.
    // This ensures that after a bill is deleted and the Cloud Function updates the ledger,
    // the UI "relooks" the values automatically.
    const q = query(
      collection(db, 'balances'),
      where('participants', 'array-contains', profile.uid)
    );

    const unsubscribe = onSnapshot(q, () => {
      // Trigger a refresh of the hydrated balances list whenever the ledger changes
      refreshBalances();
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  return {
    balances,
    isLoading,
    error,
    refreshBalances,
  };
}
