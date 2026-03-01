import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { OptimizedDebt, EventPairBalance } from '@/services/eventLedgerService';
import { Bill } from '@/types/bill.types';
import { computeEventBalances } from '@/utils/eventBalanceCalculator';
import { optimizeDebts } from '@shared/optimizeDebts';

const EVENT_BALANCES_COLLECTION = 'event_balances';

/**
 * Hook that provides event balance data from per-pair balance documents.
 *
 * Primary: queries event_balances where eventId matches, derives netBalances
 * and optimizedDebts from per-pair docs client-side.
 * Fallback: if no pair docs exist and bills are provided, computes balances
 * client-side using the same logic as the pipeline.
 *
 * @param eventId - the event to fetch balances for
 * @param bills - optional array of event bills for client-side fallback
 */
export function useEventLedger(eventId: string, bills?: Bill[]) {
  const [pairBalances, setPairBalances] = useState<EventPairBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [cacheExists, setCacheExists] = useState(false);

  useEffect(() => {
    if (!eventId) {
      setPairBalances([]);
      setCacheExists(false);
      setLoading(false);
      return;
    }

    setLoading(true);

    const q = query(
      collection(db, EVENT_BALANCES_COLLECTION),
      where('eventId', '==', eventId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setPairBalances([]);
        setCacheExists(false);
      } else {
        const docs = snapshot.docs.map(d => d.data() as EventPairBalance);
        setPairBalances(docs);
        setCacheExists(true);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching event pair balances:', error);
      setCacheExists(false);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [eventId]);

  // Derive netBalances from pair docs
  const cacheNetBalances = useMemo(() => {
    if (!cacheExists || pairBalances.length === 0) return null;

    const netBalances: Record<string, number> = {};
    for (const pair of pairBalances) {
      const [uid0, uid1] = pair.participants;
      if (Math.abs(pair.balance) > 0.001) {
        netBalances[uid0] = (netBalances[uid0] ?? 0) + pair.balance;
        netBalances[uid1] = (netBalances[uid1] ?? 0) - pair.balance;
      }
    }
    return netBalances;
  }, [cacheExists, pairBalances]);

  // Derive optimizedDebts from netBalances
  const cacheOptimizedDebts = useMemo(() => {
    if (!cacheNetBalances) return null;
    return optimizeDebts(cacheNetBalances);
  }, [cacheNetBalances]);

  // Fallback: compute from bills when cache is missing
  const fallback = useMemo(() => {
    if (cacheExists || !bills || bills.length === 0) return null;
    return computeEventBalances(bills);
  }, [cacheExists, bills]);

  // Use cache when available, fallback when not
  const netBalances = cacheExists
    ? (cacheNetBalances ?? {})
    : (fallback?.netBalances ?? {});

  const optimizedDebtsResult = cacheExists
    ? (cacheOptimizedDebts ?? [])
    : (fallback?.optimizedDebts ?? []);

  return {
    netBalances,
    optimizedDebts: optimizedDebtsResult,
    pairBalances,
    loading,
  };
}
