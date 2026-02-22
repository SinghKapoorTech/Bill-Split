import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { OptimizedDebt } from '@/services/eventLedgerService';

const EVENT_BALANCES_COLLECTION = 'event_balances';

export function useEventLedger(eventId: string) {
  const [netBalances, setNetBalances] = useState<Record<string, number>>({});
  const [optimizedDebts, setOptimizedDebts] = useState<OptimizedDebt[]>([] as OptimizedDebt[]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) {
      setNetBalances({});
      setOptimizedDebts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ledgerRef = doc(db, EVENT_BALANCES_COLLECTION, eventId);

    const unsubscribe = onSnapshot(ledgerRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setNetBalances(data.netBalances || {});
        setOptimizedDebts(data.optimizedDebts || []);
      } else {
        setNetBalances({});
        setOptimizedDebts([]);
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching event ledger:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [eventId]);

  return {
    netBalances,
    optimizedDebts,
    loading
  };
}
