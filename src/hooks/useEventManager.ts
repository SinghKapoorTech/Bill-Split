import { useState, useEffect } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  orderBy,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { TripEvent } from '@/types/event.types';
import { archiveEventDoc, unarchiveEventDoc } from '@/services/eventArchiveService';

// Firestore collection name
const EVENTS_COLLECTION = 'events';

export function useEventManager() {
  const { user } = useAuth();
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setEvents([]);
      setLoading(false);
      return;
    }

    const eventsRef = collection(db, EVENTS_COLLECTION);
    const q = query(
      eventsRef,
      where('memberIds', 'array-contains', user.uid),
      orderBy('updatedAt', 'desc'),
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const eventsData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            ownerId: data.ownerId,
            memberIds: data.memberIds || [],
            // Legacy documents have no `archived` field, and absence means
            // ACTIVE. Spread conditionally rather than defaulting to `false`
            // so the client object stays faithful to the stored document and
            // isEventArchived() remains the single arbiter.
            ...(data.archived === true ? { archived: true } : {}),
            ...(data.archivedAt ? { archivedAt: data.archivedAt } : {}),
          } as TripEvent;
        });
        setEvents(eventsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching events:', error);
        setEvents([]);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, [user]);

  /**
   * Creates an event through the `createEvent` Cloud Function.
   *
   * This was a direct `addDoc` until chunk 3. It moved server-side because
   * creation counts against the free-tier owned-active-group cap, and enforcing
   * that cap requires COUNTING the owner's active events — an aggregation query
   * that a Firestore security rule cannot run. `events` now denies client
   * creates outright, so this callable is the only way in, mirroring how
   * `createBill` already worked.
   *
   * The function is authoritative for ownership and membership: it ignores any
   * client-supplied ownerId and always adds the caller as owner and member.
   */
  const createEvent = async (name: string, description?: string, memberIds: string[] = []) => {
    if (!user) {
      throw new Error('Must be logged in to create an event');
    }

    const fn = httpsCallable<
      { name: string; description: string; memberIds: string[] },
      { eventId: string }
    >(functions, 'createEvent');

    const result = await fn({
      name,
      description: description || '',
      memberIds,
    });

    return result.data.eventId;
  };

  const deleteEvent = async (eventId: string) => {
    if (!user) {
      throw new Error('Must be logged in to delete an event');
    }

    const docRef = doc(db, EVENTS_COLLECTION, eventId);
    await deleteDoc(docRef);
  };

  // The writes themselves live in eventArchiveService so the event detail view
  // can reach them without mounting a second listener over every event. This
  // hook adds only the auth guard.
  const archiveEvent = async (eventId: string) => {
    if (!user) {
      throw new Error('Must be logged in to archive an event');
    }

    await archiveEventDoc(eventId);
  };

  const unarchiveEvent = async (eventId: string) => {
    if (!user) {
      throw new Error('Must be logged in to unarchive an event');
    }

    await unarchiveEventDoc(eventId);
  };

  return {
    events,
    loading,
    createEvent,
    deleteEvent,
    archiveEvent,
    unarchiveEvent,
  };
}
