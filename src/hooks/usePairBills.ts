import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  DocumentData,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { getFriendBalanceId, getEventBalanceId } from '@shared/ledgerCalculations';

interface PairBillIds {
  unsettledIds: Set<string>;
  settledIds: Set<string>;
  isLoading: boolean;
}

/**
 * Subscribes to the ledger documents that define which bills belong to a
 * given pair of users (current user ↔ targetUserId), optionally scoped to
 * an event. The unsettled set is sourced from the pair balance doc
 * (`balances` or `event_balances`); the settled set is derived from
 * `settlements` records between the pair.
 *
 * Consumers filter their own bill list against these sets — this is the
 * single source of truth for "which bills are between us", matching what
 * the server-side ledger pipeline already records.
 */
export function usePairBills(
  targetUserId: string | undefined,
  eventId?: string
): PairBillIds {
  const { user } = useAuth();
  const [unsettledIds, setUnsettledIds] = useState<Set<string>>(new Set());
  const [settlementsToFriend, setSettlementsToFriend] = useState<DocumentData[]>([]);
  const [settlementsFromFriend, setSettlementsFromFriend] = useState<DocumentData[]>([]);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [settlementsLoaded, setSettlementsLoaded] = useState({ to: false, from: false });

  // Subscribe to pair balance doc (balances or event_balances)
  useEffect(() => {
    if (!user?.uid || !targetUserId) {
      setUnsettledIds(new Set());
      setBalanceLoaded(true);
      return;
    }

    setBalanceLoaded(false);

    const balanceId = eventId
      ? getEventBalanceId(eventId, user.uid, targetUserId)
      : getFriendBalanceId(user.uid, targetUserId);
    const collectionName = eventId ? 'event_balances' : 'balances';
    const ref = doc(db, collectionName, balanceId);

    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data() as { unsettledBillIds?: string[] } | undefined;
        setUnsettledIds(new Set(data?.unsettledBillIds ?? []));
        setBalanceLoaded(true);
      },
      (error) => {
        console.warn('usePairBills: balance subscription error', error);
        setUnsettledIds(new Set());
        setBalanceLoaded(true);
      }
    );

    return () => unsubscribe();
  }, [user?.uid, targetUserId, eventId]);

  // Subscribe to settlements between the pair (two queries: each direction)
  useEffect(() => {
    if (!user?.uid || !targetUserId) {
      setSettlementsToFriend([]);
      setSettlementsFromFriend([]);
      setSettlementsLoaded({ to: true, from: true });
      return;
    }

    setSettlementsLoaded({ to: false, from: false });

    const settlementsCol = collection(db, 'settlements');
    const qToFriend = query(
      settlementsCol,
      where('fromUserId', '==', user.uid),
      where('toUserId', '==', targetUserId)
    );
    const qFromFriend = query(
      settlementsCol,
      where('fromUserId', '==', targetUserId),
      where('toUserId', '==', user.uid)
    );

    const unsubTo = onSnapshot(
      qToFriend,
      (snap) => {
        setSettlementsToFriend(snap.docs.map((d) => d.data()));
        setSettlementsLoaded((prev) => ({ ...prev, to: true }));
      },
      (error) => {
        console.warn('usePairBills: settlements (to-friend) error', error);
        setSettlementsLoaded((prev) => ({ ...prev, to: true }));
      }
    );
    const unsubFrom = onSnapshot(
      qFromFriend,
      (snap) => {
        setSettlementsFromFriend(snap.docs.map((d) => d.data()));
        setSettlementsLoaded((prev) => ({ ...prev, from: true }));
      },
      (error) => {
        console.warn('usePairBills: settlements (from-friend) error', error);
        setSettlementsLoaded((prev) => ({ ...prev, from: true }));
      }
    );

    return () => {
      unsubTo();
      unsubFrom();
    };
  }, [user?.uid, targetUserId]);

  // Derive the settled set, filtering by eventId when scoped to an event
  const settledIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of [...settlementsToFriend, ...settlementsFromFriend]) {
      if (eventId && s.eventId !== eventId) continue;
      const billIds = (s.settledBillIds ?? []) as string[];
      for (const id of billIds) ids.add(id);
    }
    return ids;
  }, [settlementsToFriend, settlementsFromFriend, eventId]);

  const isLoading =
    !balanceLoaded || !settlementsLoaded.to || !settlementsLoaded.from;

  return { unsettledIds, settledIds, isLoading };
}
