import { useState, useEffect } from 'react';
import { collection, addDoc, deleteDoc, doc, query, where, onSnapshot, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { Trip } from '@/types/trip.types';

// NOTE: Firestore collection name remains 'groups' until data migration.
const TRIPS_COLLECTION = 'groups';

export function useTripManager() {
  const { user } = useAuth();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setTrips([]);
      setLoading(false);
      return;
    }

    const tripsRef = collection(db, TRIPS_COLLECTION);
    const q = query(
      tripsRef,
      where('ownerId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const tripsData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            ownerId: data.ownerId,
            memberIds: data.memberIds || [],
          } as Trip;
        });
        setTrips(tripsData);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching trips:', error);
        setTrips([]);
        setLoading(false);    
      }
    );

    return () => unsubscribe();
  }, [user]);

  const createTrip = async (name: string, description?: string) => {
    if (!user) {
      throw new Error('Must be logged in to create a trip');
    }

    const now = Timestamp.now();
    const tripData = {
      name,
      description: description || '',
      createdAt: now,
      updatedAt: now,
      ownerId: user.uid,
      memberIds: [user.uid],
    };

    const docRef = await addDoc(collection(db, TRIPS_COLLECTION), tripData);
    return docRef.id;
  };

  const deleteTrip = async (tripId: string) => {
    if (!user) {
      throw new Error('Must be logged in to delete a trip');
    }

    const docRef = doc(db, TRIPS_COLLECTION, tripId);
    await deleteDoc(docRef);
  };

  return {
    trips,
    loading,
    createTrip,
    deleteTrip,
  };
}
