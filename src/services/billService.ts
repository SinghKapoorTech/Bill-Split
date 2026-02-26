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
import { Bill, BillData, BillType, BillMember } from '@/types/bill.types';
import { Person } from '@/types/person.types';
import { removeUndefinedFields } from '@/utils/firestoreHelpers';
import { calculatePersonTotals } from '@/utils/calculations';

const BILLS_COLLECTION = 'bills';

export const billService = {
  /**
   * Creates a new bill
   */
  async createBill(
    ownerId: string,
    ownerName: string,
    billType: BillType,
    billData: BillData,
    people: Person[],
    eventId?: string,
    squadId?: string
  ): Promise<string> {
    const newBillRef = doc(collection(db, BILLS_COLLECTION));
    const now = Timestamp.now();

    const ownerMember: BillMember = {
      userId: ownerId,
      name: ownerName,
      joinedAt: now,
      isAnonymous: false
    };

    const newBill: Bill = {
      id: newBillRef.id,
      billType,
      status: 'active',
      ownerId,
      ...(eventId && { eventId }), // Only include eventId if it's defined
      ...(squadId && { squadId }), // Only include squadId if it's defined
      billData,
      itemAssignments: {},
      people,
      splitEvenly: false,
      members: [ownerMember],
      createdAt: now,
      updatedAt: now,
      lastActivity: now
    };

    await setDoc(newBillRef, newBill);
    return newBillRef.id;
  },

  /**
   * Creates a new simple transaction
   */
  async createSimpleTransaction(
    ownerId: string,
    ownerName: string,
    amount: number,
    title: string,
    paidById: string,
    people: Person[],
    eventId?: string,
    squadId?: string
  ): Promise<string> {
    const newBillRef = doc(collection(db, BILLS_COLLECTION));
    const now = Timestamp.now();

    const ownerMember: BillMember = {
      userId: ownerId,
      name: ownerName,
      joinedAt: now,
      isAnonymous: false
    };

    // A simple transaction has exactly one dummy item
    const dummyItemId = `item-${Date.now()}`;
    const billData: BillData = {
      items: [
        {
          id: dummyItemId,
          name: title,
          price: amount
        }
      ],
      subtotal: amount,
      tax: 0,
      tip: 0,
      total: amount,
      restaurantName: title
    };

    // Assign to everyone by default
    const itemAssignments = {
      [dummyItemId]: people.map(p => p.id)
    };

    const newBill: Bill = {
      id: newBillRef.id,
      billType: eventId ? 'event' : 'private',
      status: 'active',
      ownerId,
      ...(eventId && { eventId }),
      ...(squadId && { squadId }),
      isSimpleTransaction: true,
      paidById,
      title,
      billData,
      itemAssignments,
      people,
      splitEvenly: true,
      members: [ownerMember],
      createdAt: now,
      updatedAt: now,
      lastActivity: now
    };

    await setDoc(newBillRef, newBill);
    return newBillRef.id;
  },

  /**
   * Gets a bill by ID
   */
  async getBill(billId: string): Promise<Bill | null> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const billSnap = await getDoc(billRef);

    if (!billSnap.exists()) {
      return null;
    }

    return billSnap.data() as Bill;
  },

  /**
   * Gets all bills associated with an event
   */
  async getBillsByEvent(eventId: string): Promise<Bill[]> {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('eventId', '==', eventId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Bill);
  },

  /**
   * Gets all bills associated with a squad
   */
  async getBillsBySquad(squadId: string): Promise<Bill[]> {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('squadId', '==', squadId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as Bill);
  },

  /**
   * Updates a bill
   */
  async updateBill(billId: string, updates: Partial<Bill>): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    // Remove undefined fields to prevent Firestore errors
    const cleanedUpdates = removeUndefinedFields({
      ...updates,
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp()
    });

    try {
      await updateDoc(billRef, cleanedUpdates);
    } catch (error) {
      console.error('FAILED TO SAVE BILL:', error);
      console.error('Bill ID:', billId);
      console.error('Update Payload Keys:', Object.keys(cleanedUpdates));
      // console.error('Full Payload:', cleanedUpdates); // Uncomment for deep debugging
      throw error;
    }
  },

  /**
   * Gets a bill by share code
   */
  async getBillByShareCode(shareCode: string): Promise<Bill | null> {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('shareCode', '==', shareCode)
    );

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }

    const bill = querySnapshot.docs[0].data() as Bill;

    // Check expiration
    if (bill.shareCodeExpiresAt && bill.shareCodeExpiresAt.toMillis() < Date.now()) {
      return null;
    }

    return bill;
  },

  /**
   * Joins a bill as a member (for authenticated or anonymous users)
   * Also adds the user to the people array so they can claim items immediately
   */
  async joinBill(billId: string, userId: string, userName: string, email?: string): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const now = Timestamp.now();

    // Build member object without undefined fields (Firestore doesn't accept undefined)
    const newMember: BillMember = {
      userId,
      name: userName,
      joinedAt: now,
      isAnonymous: userId.startsWith('guest-') || userId === 'anonymous'
    };

    // Only add email if defined
    if (email) {
      newMember.email = email;
    }

    // Create person object for the people array (for item assignment)
    const newPerson = {
      id: userId,
      name: userName,
    };

    await updateDoc(billRef, {
      members: arrayUnion(newMember),
      people: arrayUnion(newPerson),
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp()
    });
  },

  /**
   * Generates a unique share code for a bill
   */
  async generateShareCode(billId: string, userId: string): Promise<string> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const billSnap = await getDoc(billRef);

    if (!billSnap.exists()) {
      throw new Error('Bill not found');
    }

    const billData = billSnap.data() as Bill;
    const now = Timestamp.now();

    // Check if existing code is valid (not expired)
    if (
      billData.shareCode &&
      billData.shareCodeExpiresAt &&
      billData.shareCodeExpiresAt.toMillis() > now.toMillis()
    ) {
      return billData.shareCode;
    }

    // Generate new code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Expires in 7 days
    const expiresAt = new Timestamp(now.seconds + 7 * 24 * 60 * 60, now.nanoseconds);

    await updateDoc(billRef, {
      shareCode: code,
      shareCodeCreatedAt: now,
      shareCodeExpiresAt: expiresAt,
      shareCodeCreatedBy: userId,
      updatedAt: serverTimestamp()
    });

    return code;
  },

  /**
   * Atomically toggles a person's assignment to an item
   * Uses arrayUnion/arrayRemove to prevent race conditions
   */
  async toggleItemAssignment(
    billId: string,
    itemId: string,
    personId: string,
    isAssigned: boolean
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    // key in the map: itemAssignments.itemId
    const fieldPath = `itemAssignments.${itemId}`;

    if (isAssigned) {
      await updateDoc(billRef, {
        [fieldPath]: arrayUnion(personId),
        updatedAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      });
    } else {
      await updateDoc(billRef, {
        [fieldPath]: arrayRemove(personId),
        updatedAt: serverTimestamp(),
        lastActivity: serverTimestamp()
      });
    }
  },

  /**
   * Updates a person's details (name, venmoId) in the bill
   * This requires a read-modify-write cycle for the people array
   */
  async updatePersonDetails(
    billId: string,
    personId: string,
    updates: Partial<Person>
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    // 1. Get current bill data
    const billSnap = await getDoc(billRef);
    if (!billSnap.exists()) throw new Error('Bill not found');

    const billData = billSnap.data() as Bill;
    const people = billData.people || [];

    // 2. Find and update the person
    const personIndex = people.findIndex(p => p.id === personId);
    if (personIndex === -1) throw new Error('Person not found on this bill');

    const updatedPeople = [...people];
    updatedPeople[personIndex] = {
      ...updatedPeople[personIndex],
      ...updates
    };

    // 3. Write back the updated people array
    // Also update member record if this person is a member
    const members = billData.members || [];
    const memberIndex = members.findIndex(m => m.userId === personId);

    const updatePayload: any = {
      people: updatedPeople,
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp()
    };

    if (memberIndex !== -1 && updates.name) {
      const updatedMembers = [...members];
      updatedMembers[memberIndex] = {
        ...updatedMembers[memberIndex],
        name: updates.name
      };
      updatePayload.members = updatedMembers;
    }

    await updateDoc(billRef, updatePayload);
  },

  /**
   * Distributes a settlement amount across the oldest outstanding bills between two users.
   * Modifies each bill's settledPersonIds and registers the transaction footprints
   * via friendBalanceService and eventLedgerService (if applicable).
   * Returns the remaining unapplied settlement amount (for partial payments or overpayments).
   */
  async markBillsAsSettledForUser(
    fromUserId: string, // the person paying
    toUserId: string,   // the person receiving
    amountToSettle: number,
    eventId?: string    // restrict to event if provided
  ): Promise<number> {
    if (amountToSettle <= 0) return 0;

    // 1. Fetch all bills where toUserId is the owner
    const billsRef = collection(db, BILLS_COLLECTION);
    const q = eventId
      ? query(billsRef, where('eventId', '==', eventId), where('ownerId', '==', toUserId))
      : query(billsRef, where('ownerId', '==', toUserId));

    const snap = await getDocs(q);
    const bills = snap.docs.map(d => ({ id: d.id, ...d.data() } as Bill))
      .sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeA - timeB; // Oldest first
      });

    // We will need friendBalanceService and eventLedgerService
    const { friendBalanceService } = await import('@/services/friendBalanceService');
    const { eventLedgerService } = await import('@/services/eventLedgerService');
    const { userService } = await import('@/services/userService');

    const ownerProfile = await userService.getUserProfile(toUserId);
    const ownerFriends = new Set((ownerProfile?.friends || []).map((f: any) => typeof f === 'string' ? f : (f.userId || f.id)).filter(Boolean));

    let remainingAmount = amountToSettle;

    for (const bill of bills) {
      if (remainingAmount <= 0) break;
      if (!bill.billData || !bill.billData.items) continue;

      const settledPersonIds = bill.settledPersonIds || [];

      // We must check if fromUserId is actually participating in this bill under any persona mapped to them
      let internalPersonId: string | null = null;
      for (const p of (bill.people || [])) {
        if (p.id === fromUserId || (ownerFriends.has(p.id) && p.id === fromUserId)) {
          internalPersonId = p.id;
          break;
        }
      }

      if (!internalPersonId || settledPersonIds.includes(internalPersonId)) {
        continue; // They are not in the bill or already settled
      }

      // Calculate what they owe
      const personTotals = calculatePersonTotals(
        bill.billData,
        bill.people || [],
        bill.itemAssignments || {},
        bill.billData.tip || 0,
        bill.billData.tax || 0
      );

      const toPayTotal = personTotals.find(pt => pt.personId === internalPersonId)?.total || 0;
      if (toPayTotal <= 0) continue;

      // Decide if we have enough to fully settle this bill
      if (remainingAmount >= toPayTotal - 0.01) { // 1 cent grace margin for floating points
        // Full settlement of this bill!
        const billRef = doc(db, BILLS_COLLECTION, bill.id);

        // 1. Mark as settled in Firestore
        await updateDoc(billRef, {
          settledPersonIds: arrayUnion(internalPersonId)
        });

        // 2. Re-apply footprints
        await friendBalanceService.applyBillBalancesIdempotent(
          bill.id,
          toUserId,
          personTotals
        );

        if (bill.eventId) {
          await eventLedgerService.applyBillToEventLedgerIdempotent(
            bill.eventId,
            bill.id,
            toUserId,
            personTotals
          );
        }

        remainingAmount -= toPayTotal;
      } else {
        // Partial settlement logic chosen (Option B): Wait for full settlement of the individual bill.
        // We will just consume the remainingAmount (meaning they made a partial dent in the overarching ledger)
        // but we don't modify the bill itself so it remains in their "Unsettled" view.
        remainingAmount = 0;
        break;
      }
    }

    return remainingAmount;
  }
};
