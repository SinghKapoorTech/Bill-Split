import { useState, useEffect } from 'react';
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
    refreshBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid]);

  return {
    balances,
    isLoading,
    error,
    refreshBalances,
  };
}
