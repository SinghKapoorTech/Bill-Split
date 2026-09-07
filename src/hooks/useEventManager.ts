import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  Timestamp,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
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

  const createEvent = async (name: string, description?: string, memberIds: string[] = []) => {
    if (!user) {
      throw new Error('Must be logged in to create an event');
    }

    const uniqueMemberIds = Array.from(new Set([user.uid, ...memberIds]));

    const now = Timestamp.now();
    const eventData = {
      name,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      ownerId: user.uid,
      memberIds: uniqueMemberIds,
    };

    const docRef = await addDoc(collection(db, EVENTS_COLLECTION), eventData);
    return docRef.id;
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
