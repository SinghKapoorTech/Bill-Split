import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Settlement } from '@/types/settlement.types';

const SETTLEMENTS_COLLECTION = 'settlements';

export const settlementService = {
  /**
   * Creates a new settlement record between two users
   */
  async createSettlement(
    fromUserId: string,
    toUserId: string,
    amount: number,
    eventId?: string
  ): Promise<string> {
    const settlementRef = doc(collection(db, SETTLEMENTS_COLLECTION));
    const settlement: Settlement = {
      id: settlementRef.id,
      fromUserId,
      toUserId,
      amount,
      date: Timestamp.now(),
      eventId
    };
    
    await setDoc(settlementRef, settlement);
    return settlement.id;
  },

  /**
   * Gets all global settlements between two friends
   */
  async getFriendSettlements(userA: string, userB: string): Promise<Settlement[]> {
    const settlementsRef = collection(db, SETTLEMENTS_COLLECTION);
    
    // We have to query both directions since Firestore doesn't support OR on array fields simply here
    // And we don't have a combined string like userA_userB setup right now.
    const q1 = query(
      settlementsRef,
      where('fromUserId', '==', userA),
      where('toUserId', '==', userB)
    );
    
    const q2 = query(
      settlementsRef,
      where('fromUserId', '==', userB),
      where('toUserId', '==', userA)
    );
    
    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    
    const settlements = [
      ...snap1.docs.map(d => ({ id: d.id, ...d.data() } as Settlement)),
      ...snap2.docs.map(d => ({ id: d.id, ...d.data() } as Settlement))
    ];
    
    // We only want global settlements (no eventId) when querying for standard friends
    const globalSettlements = settlements.filter(s => !s.eventId);
    // Sort descending by date
    return globalSettlements.sort((a, b) => b.date.toMillis() - a.date.toMillis());
  },

  /**
   * Gets all settlements for a specific event
   */
  async getEventSettlements(eventId: string): Promise<Settlement[]> {
    const settlementsRef = collection(db, SETTLEMENTS_COLLECTION);
    const q = query(
      settlementsRef,
      where('eventId', '==', eventId)
    );
    
    const snap = await getDocs(q);
    const settlements = snap.docs.map(d => ({ id: d.id, ...d.data() } as Settlement));
    
    // Sort descending by date
    return settlements.sort((a, b) => b.date.toMillis() - a.date.toMillis());
  },

  /**
   * Deletes a settlement (e.g. if created by mistake)
   */
  async deleteSettlement(settlementId: string): Promise<void> {
    await deleteDoc(doc(db, SETTLEMENTS_COLLECTION, settlementId));
  }
};
