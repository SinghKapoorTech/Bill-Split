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
    groupId?: string
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
      ...(groupId && { groupId }), // Only include groupId if it's defined
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
  }
};
