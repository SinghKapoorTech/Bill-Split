import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { calculatePersonTotals } from '../../shared/calculations.js';
import {
  getFriendBalanceId,
  calculateFriendFootprint,
  toSingleBalance,
} from '../../shared/ledgerCalculations.js';

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'balances';

export const createBill = onCall(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const db = getFirestore();
  const { 
    billType, 
    billData, 
    people, 
    ownerId, 
    ownerName, 
    paidById, 
    eventId, 
    squadId, 
    status = 'active' 
  } = request.data;

  if (!billData || !people || !ownerId) {
    throw new HttpsError('invalid-argument', 'Missing required fields');
  }

  const billRef = db.collection(BILLS_COLLECTION).doc();
  const billId = billRef.id;
  const now = Timestamp.now();
  const creditorId = paidById || ownerId;

  // Derive participantIds (normalized UIDs)
  const ids = new Set<string>();
  ids.add(ownerId);
  for (const person of people) {
    const uid = person.id.startsWith('user-') ? person.id.slice(5) : person.id;
    if (uid && !uid.startsWith('guest-') && uid !== 'anonymous') {
      ids.add(uid);
    }
  }
  const participantIds = Array.from(ids);

  // Calculate totals and initial footprint
  const personTotals = calculatePersonTotals(
    billData,
    people,
    {}, // itemAssignments starts empty for new bills via createBill (wizard handles it later or simple trans)
    billData.tip,
    billData.tax
  );

  const linkedFriendUids = new Set(participantIds);
  const newFootprint = calculateFriendFootprint({
    people,
    personTotals,
    settledPersonIds: [],
    linkedFriendUids,
    ownerId,
    creditorId,
  });

  try {
    await db.runTransaction(async (tx) => {
      // 1. Create the bill document
      const billDoc = {
        id: billId,
        billType,
        status,
        ownerId,
        ...(eventId && { eventId }),
        ...(squadId && { squadId }),
        billData,
        itemAssignments: {},
        people,
        participantIds,
        unsettledParticipantIds: participantIds,
        splitEvenly: request.data.splitEvenly || false,
        isSimpleTransaction: request.data.isSimpleTransaction || false,
        paidById: creditorId,
        members: [{
          userId: ownerId,
          name: ownerName,
          joinedAt: now,
          isAnonymous: false
        }],
        createdAt: now,
        updatedAt: now,
        lastActivity: now,
        // Mark as processed immediately to prevent trigger double-count
        processedBalances: newFootprint,
        _ledgerVersion: 1
      };

      tx.set(billRef, billDoc);

      // 2. Update balances atomically
      for (const [friendId, amount] of Object.entries(newFootprint)) {
        if (Math.abs(amount) < 0.001) continue;

        const balanceId = getFriendBalanceId(creditorId, friendId);
        const balanceRef = db.collection(FRIEND_BALANCES_COLLECTION).doc(balanceId);
        const balanceSnap = await tx.get(balanceRef);
        
        const existing = balanceSnap.exists ? balanceSnap.data()! : null;
        const currentBalance = (existing?.balance ?? 0) as number;
        const deltaSingle = toSingleBalance(creditorId, friendId, amount);

        tx.set(balanceRef, {
          id: balanceId,
          participants: [creditorId, friendId].sort(),
          balance: currentBalance + deltaSingle,
          unsettledBillIds: FieldValue.arrayUnion(billId),
          lastUpdatedAt: now,
          lastBillId: billId,
        }, { merge: true });
      }
    });

    return { billId };
  } catch (error) {
    console.error('Failed to create bill atomically:', error);
    throw new HttpsError('internal', 'Failed to create bill and update ledger.');
  }
});

export const joinBillAsGuest = onCall(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    // Note: No require auth, guests are unauthenticated
    const db = getFirestore();
    const { billId, shareCode, guestName } = request.data;

    if (!billId || !shareCode || !guestName) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const billRef = db.collection(BILLS_COLLECTION).doc(billId);
    
    return await db.runTransaction(async (tx) => {
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', 'Bill not found');
      }

      const billData = billSnap.data()!;
      
      // Validate share code
      if (billData.shareCode !== shareCode) {
        throw new HttpsError('permission-denied', 'Invalid share code');
      }

      const now = Timestamp.now();
      if (billData.shareCodeExpiresAt && billData.shareCodeExpiresAt.toMillis() < now.toMillis()) {
        throw new HttpsError('permission-denied', 'Share code expired');
      }

      // 1. Create a shadow user in users collection
      const ownerId = billData.ownerId;
      const usersRef = db.collection('users');
      const newGuestDoc = usersRef.doc();
      const guestUserId = newGuestDoc.id;

      // Ensure a reasonable username based on the guest name
      const username = guestName
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'guest';

      const guestProfile = {
        uid: guestUserId,
        displayName: guestName,
        username: `${username}-${Date.now().toString().slice(-4)}`,
        friends: [],
        squadIds: [],
        createdAt: now,
        lastLoginAt: now,
        isShadow: true,
        createdById: ownerId
      };

      tx.set(newGuestDoc, guestProfile);

      // 2. Add the guest to the bill arrays
      const newMember = {
        userId: guestUserId,
        name: guestName,
        joinedAt: now,
        isAnonymous: true
      };

      // people array expects user- prefix for Firebase UIDs implicitly, but our new ID is just the raw UID
      const newPerson = {
        id: `user-${guestUserId}`,
        name: guestName,
      };

      tx.update(billRef, {
        members: FieldValue.arrayUnion(newMember),
        people: FieldValue.arrayUnion(newPerson),
        participantIds: FieldValue.arrayUnion(guestUserId),
        unsettledParticipantIds: FieldValue.arrayUnion(guestUserId),
        updatedAt: now,
        lastActivity: now
      });

      return { userId: guestUserId };
    });
  }
);

export const leaveBillAsGuest = onCall(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    // Note: No require auth, guests are unauthenticated
    const db = getFirestore();
    const { billId, shareCode, shadowUserId } = request.data;

    if (!billId || !shareCode || !shadowUserId) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const billRef = db.collection(BILLS_COLLECTION).doc(billId);
    
    await db.runTransaction(async (tx) => {
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', 'Bill not found');
      }

      const billData = billSnap.data()!;
      
      // Validate share code
      if (billData.shareCode !== shareCode) {
        throw new HttpsError('permission-denied', 'Invalid share code');
      }

      // Security check: Must be on the bill
      const participantIds = billData.participantIds || [];
      if (!participantIds.includes(shadowUserId)) {
        throw new HttpsError('permission-denied', 'User is not a participant of this bill');
      }

      // Verify the user is actually a shadow user
      const userRef = db.collection('users').doc(shadowUserId);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists && userSnap.data()?.isShadow !== true) {
        throw new HttpsError('permission-denied', 'Cannot delete a standard user account');
      }

      // Clean up the bill document (Remove from people, members, itemAssignments)
      const people = billData.people || [];
      const updatedPeople = people.filter((p: any) => p.id !== shadowUserId && p.id !== `user-${shadowUserId}`);

      const members = billData.members || [];
      const updatedMembers = members.filter((m: any) => m.userId !== shadowUserId);

      const itemAssignments = { ...(billData.itemAssignments || {}) };
      let assignmentsChanged = false;
      for (const [itemId, assignees] of Object.entries(itemAssignments)) {
        const arr = (assignees as string[]);
        if (arr.includes(shadowUserId) || arr.includes(`user-${shadowUserId}`)) {
          itemAssignments[itemId] = arr.filter(id => id !== shadowUserId && id !== `user-${shadowUserId}`);
          assignmentsChanged = true;
        }
      }

      const now = Timestamp.now();
      const updates: any = {
        people: updatedPeople,
        members: updatedMembers,
        participantIds: FieldValue.arrayRemove(shadowUserId),
        unsettledParticipantIds: FieldValue.arrayRemove(shadowUserId),
        updatedAt: now,
        lastActivity: now
      };

      if (assignmentsChanged) {
        updates.itemAssignments = itemAssignments;
      }

      tx.update(billRef, updates);

      // Clean up the shadow user document
      if (userSnap.exists) {
        tx.delete(userRef);
      }
    });

    return { success: true };
  }
);

export const updateGuestName = onCall(
  {
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    // Note: No require auth, guests are unauthenticated
    const db = getFirestore();
    const { billId, shareCode, shadowUserId, newName } = request.data;

    if (!billId || !shareCode || !shadowUserId || !newName) {
      throw new HttpsError('invalid-argument', 'Missing required fields');
    }

    const billRef = db.collection(BILLS_COLLECTION).doc(billId);
    
    await db.runTransaction(async (tx) => {
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists) {
        throw new HttpsError('not-found', 'Bill not found');
      }

      const billData = billSnap.data()!;
      
      // Validate share code
      if (billData.shareCode !== shareCode) {
        throw new HttpsError('permission-denied', 'Invalid share code');
      }

      // Security check: Must be on the bill
      const participantIds = billData.participantIds || [];
      if (!participantIds.includes(shadowUserId)) {
        throw new HttpsError('permission-denied', 'User is not a participant of this bill');
      }

      // Update the user document if they are a shadow user
      const userRef = db.collection('users').doc(shadowUserId);
      const userSnap = await tx.get(userRef);
      if (userSnap.exists && userSnap.data()?.isShadow === true) {
        tx.update(userRef, { displayName: newName });
      }

      // Update the name everywhere in the bill
      const people = billData.people || [];
      const updatedPeople = people.map((p: any) => {
        if (p.id === shadowUserId || p.id === `user-${shadowUserId}`) {
          return { ...p, name: newName };
        }
        return p;
      });

      const members = billData.members || [];
      const updatedMembers = members.map((m: any) => {
        if (m.userId === shadowUserId) {
          return { ...m, name: newName };
        }
        return m;
      });

      tx.update(billRef, {
        people: updatedPeople,
        members: updatedMembers,
        updatedAt: Timestamp.now(),
        lastActivity: Timestamp.now()
      });
    });

    return { success: true };
  }
);
