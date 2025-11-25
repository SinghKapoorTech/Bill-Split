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
  arrayUnion
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Bill, BillData, BillType, BillStatus, AssignmentMode, BillMember } from '@/types/bill.types';
import { Person } from '@/types/person.types';

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
      ownerId,
      ...(groupId && { groupId }), // Only include groupId if it's defined
      billData,
      itemAssignments: {},
      people,
      customTip: '0',
      customTax: '0',
      assignmentMode: 'checkboxes',
      splitEvenly: false,
      members: [ownerMember],
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      status: 'active'
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
    await updateDoc(billRef, {
      ...updates,
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp()
    });
  },

  /**
   * Gets a bill by share code
   */
  async getBillByShareCode(shareCode: string): Promise<Bill | null> {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('shareCode', '==', shareCode),
      where('status', '==', 'active')
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
   * Joins a bill as a member (for authenticated users)
   */
  async joinBill(billId: string, userId: string, userName: string, email?: string): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const now = Timestamp.now();

    const newMember: BillMember = {
      userId,
      name: userName,
      email,
      joinedAt: now,
      isAnonymous: false
    };

    await updateDoc(billRef, {
      members: arrayUnion(newMember),
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
  }
};
