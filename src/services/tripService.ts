import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Trip, TripInvitation } from '@/types/trip.types';

// NOTE: Firestore collection names remain 'groups' / 'groupInvitations' until data migration.
const TRIPS_COLLECTION = 'groups';
const INVITATIONS_COLLECTION = 'groupInvitations';

export const tripService = {
  /**
   * Creates a new trip
   */
  async createTrip(ownerId: string, name: string, description?: string): Promise<string> {
    const newTripRef = doc(collection(db, TRIPS_COLLECTION));
    const now = Timestamp.now();

    const newTrip: Trip = {
      id: newTripRef.id,
      name,
      description,
      ownerId,
      memberIds: [ownerId],
      pendingInvites: [],
      createdAt: now,
      updatedAt: now
    };

    await setDoc(newTripRef, newTrip);
    return newTripRef.id;
  },

  /**
   * Gets a trip by ID
   */
  async getTrip(tripId: string): Promise<Trip | null> {
    const tripRef = doc(db, TRIPS_COLLECTION, tripId);
    const tripSnap = await getDoc(tripRef);

    if (!tripSnap.exists()) {
      return null;
    }

    return tripSnap.data() as Trip;
  },

  /**
   * Updates a trip
   */
  async updateTrip(tripId: string, updates: Partial<Trip>): Promise<void> {
    const tripRef = doc(db, TRIPS_COLLECTION, tripId);
    await updateDoc(tripRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  },

  /**
   * Invites a user to a trip by email
   */
  async inviteMember(tripId: string, email: string, invitedBy: string): Promise<string> {
    const now = Timestamp.now();
    const inviteRef = doc(collection(db, INVITATIONS_COLLECTION));
    
    const invitation: TripInvitation = {
      id: inviteRef.id,
      tripId,
      email,
      invitedBy,
      status: 'pending',
      createdAt: now
    };
    
    await setDoc(inviteRef, invitation);
    
    // Update trip pending invites
    const tripRef = doc(db, TRIPS_COLLECTION, tripId);
    await updateDoc(tripRef, {
      pendingInvites: arrayUnion(email),
      updatedAt: serverTimestamp()
    });
    
    return inviteRef.id;
  },
  
  /**
   * Responds to an invitation
   */
  async respondToInvite(inviteId: string, userId: string, accept: boolean): Promise<void> {
    const inviteRef = doc(db, INVITATIONS_COLLECTION, inviteId);
    const inviteSnap = await getDoc(inviteRef);
    
    if (!inviteSnap.exists()) {
      throw new Error('Invitation not found');
    }
    
    const invite = inviteSnap.data() as TripInvitation;
    const now = Timestamp.now();
    
    await updateDoc(inviteRef, {
      status: accept ? 'accepted' : 'declined',
      respondedAt: now
    });
    
    if (accept) {
      // Add user to trip
      const tripRef = doc(db, TRIPS_COLLECTION, invite.tripId);
      await updateDoc(tripRef, {
        memberIds: arrayUnion(userId),
        pendingInvites: arrayRemove(invite.email),
        updatedAt: serverTimestamp()
      });
    }
  },
  
  /**
   * Gets pending invitations for an email
   */
  async getPendingInvitations(email: string): Promise<TripInvitation[]> {
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      where('email', '==', email),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as TripInvitation);
  }
};
