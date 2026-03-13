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
