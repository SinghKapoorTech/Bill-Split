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
import { TripEvent, EventInvitation } from '@/types/event.types';

// Firestore collection names
const EVENTS_COLLECTION = 'events';
const INVITATIONS_COLLECTION = 'eventInvitations';

export const eventService = {
  /**
   * Creates a new event
   */
  async createEvent(ownerId: string, name: string, description?: string): Promise<string> {
    const newEventRef = doc(collection(db, EVENTS_COLLECTION));
    const now = Timestamp.now();

    const newEvent: TripEvent = {
      id: newEventRef.id,
      name,
      description,
      ownerId,
      memberIds: [ownerId],
      pendingInvites: [],
      createdAt: now,
      updatedAt: now
    };

    await setDoc(newEventRef, newEvent);
    return newEventRef.id;
  },

  /**
   * Gets an event by ID
   */
  async getEvent(eventId: string): Promise<TripEvent | null> {
    const eventRef = doc(db, EVENTS_COLLECTION, eventId);
    const eventSnap = await getDoc(eventRef);

    if (!eventSnap.exists()) {
      return null;
    }

    return eventSnap.data() as TripEvent;
  },

  /**
   * Updates an event
   */
  async updateEvent(eventId: string, updates: Partial<TripEvent>): Promise<void> {
    const eventRef = doc(db, EVENTS_COLLECTION, eventId);
    await updateDoc(eventRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  },

  /**
   * Invites a user to an event by email
   */
  async inviteMember(eventId: string, email: string, invitedBy: string): Promise<string> {
    const now = Timestamp.now();
    const inviteRef = doc(collection(db, INVITATIONS_COLLECTION));
    
    const invitation: EventInvitation = {
      id: inviteRef.id,
      eventId: eventId,
      email,
      invitedBy,
      status: 'pending',
      createdAt: now
    };
    
    await setDoc(inviteRef, invitation);
    
    // Update event pending invites
    const eventRef = doc(db, EVENTS_COLLECTION, eventId);
    await updateDoc(eventRef, {
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
    
    const invite = inviteSnap.data() as EventInvitation;
    const now = Timestamp.now();
    
    await updateDoc(inviteRef, {
      status: accept ? 'accepted' : 'declined',
      respondedAt: now
    });
    
    if (accept) {
      const eventRef = doc(db, EVENTS_COLLECTION, invite.eventId);
      await updateDoc(eventRef, {
        memberIds: arrayUnion(userId),
        pendingInvites: arrayRemove(invite.email),
        updatedAt: serverTimestamp()
      });
    }
  },
  
  /**
   * Gets pending invitations for an email
   */
  async getPendingInvitations(email: string): Promise<EventInvitation[]> {
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      where('email', '==', email),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as EventInvitation);
  }
};
