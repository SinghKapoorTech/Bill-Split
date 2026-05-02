import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { calculatePersonTotals } from '../../shared/calculations.js';
import {
  getFriendBalanceId,
  calculateFriendFootprint,
  toSingleBalance,
  BALANCE_THRESHOLD,
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
    if (uid && !uid.startsWith('guest-') && !uid.startsWith('person-') && uid !== 'anonymous') {
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
    billData.tax,
    billData.otherFees ?? 0
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
        if (Math.abs(amount) < BALANCE_THRESHOLD) continue;

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

    // If the caller is authenticated, use their real UID instead of creating a shadow user
    const callerUid = request.auth?.uid || null;

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

      // Check if authenticated user is already in the bill
      if (callerUid) {
        const existingPeople: Array<{id: string}> = billData.people || [];
        const alreadyInBill = existingPeople.some(
          (p: {id: string}) => p.id === callerUid || p.id === `user-${callerUid}`
        );
        if (alreadyInBill) {
          return { userId: callerUid };
        }
      }

      let userId: string;

      if (callerUid) {
        // Authenticated user: use their real UID, no shadow user needed
        userId = callerUid;

        const newMember = {
          userId: callerUid,
          name: guestName,
          ...(request.auth?.token?.email ? { email: request.auth.token.email } : {}),
          joinedAt: now,
          isAnonymous: false
        };

        const newPerson = {
          id: `user-${callerUid}`,
          name: guestName,
        };

        tx.update(billRef, {
          members: FieldValue.arrayUnion(newMember),
          people: FieldValue.arrayUnion(newPerson),
          participantIds: FieldValue.arrayUnion(callerUid),
          unsettledParticipantIds: FieldValue.arrayUnion(callerUid),
          updatedAt: now,
          lastActivity: now
        });
      } else {
        // Anonymous guest: create a shadow user
        const ownerId = billData.ownerId;
        const usersRef = db.collection('users');
        const newGuestDoc = usersRef.doc();
        const guestUserId = newGuestDoc.id;
        userId = guestUserId;

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

        const newMember = {
          userId: guestUserId,
          name: guestName,
          joinedAt: now,
          isAnonymous: true
        };

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
      }

      return { userId };
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

export const claimShadowUser = onCall(
  {
    cors: true,
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to claim a shadow user');
    }

    const db = getFirestore();
    const { shadowUserId } = request.data;
    const realUserId = request.auth.uid;

    if (!shadowUserId) {
      throw new HttpsError('invalid-argument', 'Missing shadowUserId');
    }

    // 1. Verify shadow user exists and is a shadow user
    const shadowUserRef = db.collection('users').doc(shadowUserId);
    const shadowUserSnap = await shadowUserRef.get();
    
    if (!shadowUserSnap.exists) {
      throw new HttpsError('not-found', 'Shadow user not found');
    }
    
    if (shadowUserSnap.data()?.isShadow !== true) {
      throw new HttpsError('permission-denied', 'Cannot claim a standard user account');
    }

    // 2. Find all bills where the shadow user is a participant
    const billsSnapshot = await db.collection(BILLS_COLLECTION)
      .where('participantIds', 'array-contains', shadowUserId)
      .get();

    // 3. Update all bills in a batch
    const batch = db.batch();

    billsSnapshot.docs.forEach((docSnap) => {
      const billData = docSnap.data();
      const billRef = docSnap.ref;

      // Update participantIds and unsettledParticipantIds
      let participantIds = billData.participantIds || [];
      if (participantIds.includes(shadowUserId)) {
        participantIds = participantIds.filter((id: string) => id !== shadowUserId);
        if (!participantIds.includes(realUserId)) participantIds.push(realUserId);
      }

      let unsettledParticipantIds = billData.unsettledParticipantIds || [];
      if (unsettledParticipantIds.includes(shadowUserId)) {
        unsettledParticipantIds = unsettledParticipantIds.filter((id: string) => id !== shadowUserId);
        if (!unsettledParticipantIds.includes(realUserId)) unsettledParticipantIds.push(realUserId);
      }

      let settledPersonIds = billData.settledPersonIds || [];
      if (settledPersonIds.includes(shadowUserId)) {
        settledPersonIds = settledPersonIds.filter((id: string) => id !== shadowUserId);
        if (!settledPersonIds.includes(realUserId)) settledPersonIds.push(realUserId);
      }

      // Update members
      const members = billData.members || [];
      const updatedMembers = members.map((m: any) => {
        if (m.userId === shadowUserId) {
          return { ...m, userId: realUserId, isAnonymous: false }; // clear anonymous flag
        }
        return m;
      });

      // Update people
      const people = billData.people || [];
      const updatedPeople = people.map((p: any) => {
        if (p.id === shadowUserId || p.id === `user-${shadowUserId}`) {
          // Migrate shadow ID to real user's prefixed ID
          return { ...p, id: `user-${realUserId}` };
        }
        return p;
      });

      // Deduplicate people matching by exact ID
      const uniquePeopleMap = new Map();
      updatedPeople.forEach((p: any) => {
        if (!uniquePeopleMap.has(p.id)) {
          uniquePeopleMap.set(p.id, p);
        }
      });
      const finalPeople = Array.from(uniquePeopleMap.values());

      // Deduplicate members matching by exact userId
      const uniqueMembersMap = new Map();
      updatedMembers.forEach((m: any) => {
        if (!uniqueMembersMap.has(m.userId)) {
          uniqueMembersMap.set(m.userId, m);
        }
      });
      const finalMembers = Array.from(uniqueMembersMap.values());

      // Update itemAssignments
      const itemAssignments = { ...(billData.itemAssignments || {}) };
      let assignmentsChanged = false;
      for (const [itemId, assignees] of Object.entries(itemAssignments)) {
        const arr = (assignees as string[]);
        if (arr.includes(shadowUserId) || arr.includes(`user-${shadowUserId}`)) {
          // Remove shadow id, add real id (avoiding duplicates)
          const newArr = arr.filter(id => id !== shadowUserId && id !== `user-${shadowUserId}`);
          if (!newArr.includes(realUserId) && !newArr.includes(`user-${realUserId}`)) {
            newArr.push(`user-${realUserId}`); // Use user- prefix for item assignments consistently
          }
          itemAssignments[itemId] = newArr;
          assignmentsChanged = true;
        }
      }

      const updates: any = {
        participantIds,
        unsettledParticipantIds,
        settledPersonIds,
        members: finalMembers,
        people: finalPeople,
        updatedAt: Timestamp.now(),
        lastActivity: Timestamp.now()
      };

      // Handle paidById if the guest was marked as payer
      if (billData.paidById === shadowUserId || billData.paidById === `user-${shadowUserId}`) {
        updates.paidById = `user-${realUserId}`;
      }

      if (assignmentsChanged) {
        updates.itemAssignments = itemAssignments;
      }

      batch.update(billRef, updates);
    });

    // 4. Delete the shadow user profile
    batch.delete(shadowUserRef);

    // 5. Commit all changes
    // Firestore batch limits to 500 operations. Highly unlikely a shadow user is on >499 bills, 
    // plus 1 delete = max 499 bills.
    await batch.commit();

    return { success: true, claimedBills: billsSnapshot.size };
  }
);
