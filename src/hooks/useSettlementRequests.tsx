import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  query,
  where,
  onSnapshot,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import type { SettlementRequest } from '@/types/settlementRequest.types';

const COLLECTION = 'settlement_requests';
const STALE_DAYS = 14;

function isStale(request: SettlementRequest): boolean {
  if (!request.createdAt?.toDate) return false;
  const age = Date.now() - request.createdAt.toDate().getTime();
  return age > STALE_DAYS * 24 * 60 * 60 * 1000;
}

interface SettlementRequestsContextValue {
  outgoingRequests: SettlementRequest[];
  incomingRequests: SettlementRequest[];
  getOutgoingRequestForUser: (friendId: string, eventId?: string) => SettlementRequest | undefined;
  getIncomingRequestFromUser: (friendId: string, eventId?: string) => SettlementRequest | undefined;
  loading: boolean;
}

const SettlementRequestsContext = createContext<SettlementRequestsContextValue>({
  outgoingRequests: [],
  incomingRequests: [],
  getOutgoingRequestForUser: () => undefined,
  getIncomingRequestFromUser: () => undefined,
  loading: true,
});

export function useSettlementRequests() {
  return useContext(SettlementRequestsContext);
}

export function SettlementRequestsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [outgoingRequests, setOutgoingRequests] = useState<SettlementRequest[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<SettlementRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setOutgoingRequests([]);
      setIncomingRequests([]);
      setLoading(false);
      return;
    }

    const col = collection(db, COLLECTION);

    // Outgoing: requests I sent (I'm the debtor)
    const outQ = query(col, where('fromUserId', '==', user.uid), where('status', '==', 'pending'));
    // Incoming: requests sent to me (I'm the creditor)
    const inQ = query(col, where('toUserId', '==', user.uid), where('status', '==', 'pending'));

    let outLoaded = false;
    let inLoaded = false;

    const unsubOut = onSnapshot(outQ, (snap) => {
      const requests = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as SettlementRequest))
        .filter(r => !isStale(r));
      setOutgoingRequests(requests);
      outLoaded = true;
      if (inLoaded) setLoading(false);
    });

    const unsubIn = onSnapshot(inQ, (snap) => {
      const requests = snap.docs
        .map(d => ({ ...d.data(), id: d.id } as SettlementRequest))
        .filter(r => !isStale(r));
      setIncomingRequests(requests);
      inLoaded = true;
      if (outLoaded) setLoading(false);
    });

    return () => {
      unsubOut();
      unsubIn();
    };
  }, [user?.uid]);

  const getOutgoingRequestForUser = useCallback(
    (friendId: string, eventId?: string) =>
      outgoingRequests.find(r =>
        r.toUserId === friendId &&
        (eventId ? r.eventId === eventId : !r.eventId)
      ),
    [outgoingRequests]
  );

  const getIncomingRequestFromUser = useCallback(
    (friendId: string, eventId?: string) =>
      incomingRequests.find(r =>
        r.fromUserId === friendId &&
        (eventId ? r.eventId === eventId : !r.eventId)
      ),
    [incomingRequests]
  );

  const value = useMemo(() => ({
    outgoingRequests,
    incomingRequests,
    getOutgoingRequestForUser,
    getIncomingRequestFromUser,
    loading,
  }), [outgoingRequests, incomingRequests, getOutgoingRequestForUser, getIncomingRequestFromUser, loading]);

  return (
    <SettlementRequestsContext.Provider value={value}>
      {children}
    </SettlementRequestsContext.Provider>
  );
}
