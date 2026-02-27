import { useState, useEffect, useMemo } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { OptimizedDebt } from '@/services/eventLedgerService';
import { Bill } from '@/types/bill.types';
import { computeEventBalances } from '@/utils/eventBalanceCalculator';

const EVENT_BALANCES_COLLECTION = 'event_balances';

/**
 * Hook that provides event balance data with a client-side fallback.
 *
 * Primary: reads from the event_balances cache (populated by the pipeline).
 * Fallback: if the cache doc doesn't exist and bills are provided,
 * computes balances client-side using the same logic as the pipeline.
 *
 * @param eventId - the event to fetch balances for
 * @param bills - optional array of event bills for client-side fallback
 */
export function useEventLedger(eventId: string, bills?: Bill[]) {
  const [cacheNetBalances, setCacheNetBalances] = useState<Record<string, number> | null>(null);
  const [cacheOptimizedDebts, setCacheOptimizedDebts] = useState<OptimizedDebt[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [cacheExists, setCacheExists] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setCacheNetBalances(null);
      setCacheOptimizedDebts(null);
      setCacheExists(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ledgerRef = doc(db, EVENT_BALANCES_COLLECTION, eventId);

    const unsubscribe = onSnapshot(ledgerRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setCacheNetBalances(data.netBalances || {});
        setCacheOptimizedDebts(data.optimizedDebts || []);
        setCacheExists(true);
      } else {
        setCacheNetBalances(null);
        setCacheOptimizedDebts(null);
        setCacheExists(false);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching event ledger:', error);
      setCacheExists(false);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [eventId]);

  // Fallback: compute from bills when cache is missing
  const fallback = useMemo(() => {
    if (cacheExists || !bills || bills.length === 0) return null;
    return computeEventBalances(bills);
  }, [cacheExists, bills]);

  // Use cache when available, fallback when not
  const netBalances = cacheExists
    ? (cacheNetBalances ?? {})
    : (fallback?.netBalances ?? {});

  const optimizedDebts = cacheExists
    ? (cacheOptimizedDebts ?? [])
    : (fallback?.optimizedDebts ?? []);

  return {
    netBalances,
    optimizedDebts,
    loading,
  };
}
