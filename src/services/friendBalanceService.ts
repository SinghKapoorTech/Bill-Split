import { doc, getDoc, updateDoc, collection, query, where, getDocs, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Bill, PersonTotal } from '@/types';
import { userService } from './userService';
import { calculatePersonTotals } from '@/utils/calculations';

const USERS_COLLECTION = 'users';
const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';

/**
 * Bill people use the `user-{uid}` format from generateUserId.
 * Firebase UIDs are the raw uid string. This helper converts between the two.
 */
function personIdToFirebaseUid(personId: string): string {
  return personId.startsWith('user-') ? personId.slice(5) : personId;
}

export const friendBalanceService = {
  // Helper to generate the unique document ID for a friend balance pair
  getFriendBalanceId(userId1: string, userId2: string): string {
    return [userId1, userId2].sort().join('_');
  },

  /**
   * Applies the delta of a bill to the friend_balances collection.
   *
   * Key design decisions:
   * - Uses runTransaction (read-then-write) instead of writeBatch + FieldValue.increment().
   *   This is because Firestore security rules evaluate request.resource.data BEFORE
   *   server-side transforms are applied, which causes permission errors on new document
   *   creation when FieldValue.increment() is mixed with set+merge.
   * - Resolves bill-local person IDs to real Firebase user IDs via the owner's friends list
   *   (user.friends is now string[] — just UIDs).
   */
  async applyBillBalances(
    billId: string,
    currentUserId: string,
    personTotals: PersonTotal[]
  ): Promise<void> {
    // ── Step 1: Read the bill ────────────────────────────────────────────────
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const billSnap = await getDoc(billRef);
    if (!billSnap.exists()) return;

    const billData = billSnap.data() as Bill & { processedBalances?: Record<string, number> };
    if (billData.ownerId !== currentUserId) return;

    // ── Step 2: Resolve bill person IDs → Firebase user IDs ─────────────────
    const userProfile = await userService.getUserProfile(currentUserId);
    const billPeople = billData.people || [];

    // Map legacy friend objects back to string UIDs if necessary
    const rawFriends: any[] = userProfile?.friends || [];
    const friendUserIds = new Set<string>(
      rawFriends.map(f => typeof f === 'string' ? f : (f.userId || f.id)).filter(Boolean)
    );

    // Map: bill-local person UUID → Firebase user ID (or null if not a linked user)
    const personIdToUserId: Record<string, string | null> = {};
    for (const person of billPeople) {
      personIdToUserId[person.id] = friendUserIds.has(person.id) ? person.id : null;
    }

    // ── Step 3: Build list of (friendUserId, delta, newAmount) changes ───────
    const previousBalances = billData.processedBalances || {};
    const newProcessedBalances: Record<string, number> = {};

    const updates: { friendUserId: string; delta: number; newAmount: number }[] = [];

    for (const total of personTotals) {
      if (total.personId === currentUserId) continue; // skip self

      const friendUserId = personIdToUserId[total.personId] ?? null;
      if (!friendUserId) continue; // skip unlinked people

      const prevAmount = previousBalances[friendUserId] || 0;
      let newAmount = 0;
      const creditorId = billData.paidById || billData.ownerId;
      const isOwnerCreditor = creditorId === currentUserId;
      const creditorFirebaseUid = personIdToFirebaseUid(creditorId);

      if (isOwnerCreditor) {
        newAmount = total.total;
      } else {
        if (friendUserId === creditorFirebaseUid) {
          // This friend paid. The owner owes them the owner's share.
          const ownerTotalRecord = personTotals.find(pt => personIdToFirebaseUid(pt.personId) === currentUserId);
          newAmount = -(ownerTotalRecord ? ownerTotalRecord.total : 0);
        } else {
          // Another friend. They owe the creditor, not the owner.
          newAmount = 0;
        }
      }

      const delta = newAmount - prevAmount;

      if (delta === 0) {
        if (prevAmount !== 0) newProcessedBalances[friendUserId] = prevAmount;
        continue;
      }

      updates.push({ friendUserId, delta, newAmount });
    }

    // Reverse contributions for friends who were removed from the bill
    for (const [friendUserId, prevAmount] of Object.entries(previousBalances)) {
      const stillOnBill = personTotals.some(
        (t) => personIdToUserId[t.personId] === friendUserId
      );
      if (!stillOnBill && prevAmount !== 0) {
        updates.push({ friendUserId, delta: -prevAmount, newAmount: 0 });
      }
    }

    if (updates.length === 0) return;

    // ── Step 4: Apply each update via a transaction ──────────────────────────
    for (const { friendUserId, delta, newAmount } of updates) {
      const balanceId = this.getFriendBalanceId(currentUserId, friendUserId);
      const balanceRef = doc(db, FRIEND_BALANCES_COLLECTION, balanceId);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(balanceRef);
        const existing = snap.exists() ? snap.data() : null;

        const currentOwnerBal: number = existing?.balances?.[currentUserId] ?? 0;
        const currentFriendBal: number = existing?.balances?.[friendUserId] ?? 0;

        // Write exact computed values — no server-side transforms
        transaction.set(
          balanceRef,
          {
            id: balanceId,
            participants: [currentUserId, friendUserId],
            balances: {
              [currentUserId]: currentOwnerBal + delta,
              [friendUserId]: currentFriendBal - delta,
            },
            lastUpdatedAt: Timestamp.now(),
            lastBillId: billId,
          },
          { merge: true }
        );
      });

      if (newAmount !== 0) {
        newProcessedBalances[friendUserId] = newAmount;
      }
    }

    // ── Step 5: Save processed balances on the bill ──────────────────────────
    // Note: no write-back to user.friends[] needed — balances live in friend_balances.
    // The UI reads balances via getHydratedFriends() which queries friend_balances directly.
    if (Object.keys(newProcessedBalances).length > 0 || Object.keys(previousBalances).length > 0) {
      await updateDoc(billRef, { processedBalances: newProcessedBalances });
    }
  },

  /**
   * Applies the exact delta of a bill to the friend_balances collection.
   * This handles Creates, Edits, and Bill-specific Settlements identically.
   */
  async applyBillBalancesIdempotent(
    billId: string,
    currentUserId: string,
    personTotals: PersonTotal[]
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    // Resolve bill person IDs → Firebase user IDs
    const userProfile = await userService.getUserProfile(currentUserId);
    const rawFriends: any[] = userProfile?.friends || [];
    const friendUserIds = new Set<string>(
      rawFriends.map(f => typeof f === 'string' ? f : (f.userId || f.id)).filter(Boolean)
    );

    await runTransaction(db, async (transaction) => {
      const billSnap = await transaction.get(billRef);
      if (!billSnap.exists()) return;

      const billData = billSnap.data() as Bill;
      if (billData.ownerId !== currentUserId) return;

      const settledPersonIds = billData.settledPersonIds || [];
      const previousBalances = billData.processedBalances || {};
      // Map bill-local person ID (user-{uid}) → raw Firebase UID (or null if not a linked user)
      const personIdToUserId: Record<string, string | null> = {};

      for (const person of (billData.people || [])) {
        const firebaseUid = personIdToFirebaseUid(person.id);
        personIdToUserId[person.id] = friendUserIds.has(firebaseUid) ? firebaseUid : null;
      }

      // Calculate the NEW exact debts each friend owes for this bill
      const newDeltasInside: Record<string, number> = {};

      const creditorId = billData.paidById || billData.ownerId;
      const isOwnerCreditor = creditorId === currentUserId;
      const creditorFirebaseUid = personIdToFirebaseUid(creditorId);
      
      const ownerTotalRecord = personTotals.find(pt => personIdToFirebaseUid(pt.personId) === currentUserId);
      const ownerAmountOwed = ownerTotalRecord && !settledPersonIds.includes(ownerTotalRecord.personId) 
        ? ownerTotalRecord.total 
        : 0;

      for (const total of personTotals) {
        const firebaseUid = personIdToFirebaseUid(total.personId);
        const friendUserId = personIdToUserId[total.personId] ?? null;
        if (!friendUserId) continue; // skip unlinked people

        if (isOwnerCreditor) {
          if (firebaseUid === currentUserId) continue; // skip self
          const amountOwed = settledPersonIds.includes(total.personId) ? 0 : total.total;
          newDeltasInside[friendUserId] = amountOwed;
        } else {
          if (firebaseUid === creditorFirebaseUid) {
             // This friend paid. The owner owes them the owner's share.
             newDeltasInside[friendUserId] = -ownerAmountOwed;
          } else if (firebaseUid !== currentUserId) {
             // Another friend. They owe the creditor, not the owner.
             newDeltasInside[friendUserId] = 0;
          }
        }
      }

      // Now we have the old footprint (previousBalances) and the new footprint (newDeltasInside)
      // For each friend involved in either footprint, we must run a delta update.
      // previousBalances keys are raw Firebase UIDs; newDeltasInside keys are also raw Firebase UIDs
      const allInvolvedFriendIds = new Set([
        ...Object.keys(previousBalances),
        ...Object.keys(newDeltasInside)
      ]);

      const newProcessedBalances: Record<string, number> = {};

      // 1. Gather all reads
      const balanceRefs: Record<string, any> = {};
      const balanceSnaps: Record<string, any> = {};
      const deltas: Record<string, number> = {};

      for (const friendUserId of allInvolvedFriendIds) {
        const prevAmount = previousBalances[friendUserId] || 0;
        const newAmount = newDeltasInside[friendUserId] || 0;
        const delta = newAmount - prevAmount;

        if (delta !== 0) {
          deltas[friendUserId] = delta;
          const balanceId = friendBalanceService.getFriendBalanceId(currentUserId, friendUserId);
          const balanceRef = doc(db, FRIEND_BALANCES_COLLECTION, balanceId);
          balanceRefs[friendUserId] = balanceRef;
          balanceSnaps[friendUserId] = await transaction.get(balanceRef);
        }
      }

      // 2. Perform all writes
      for (const friendUserId of Object.keys(deltas)) {
        const delta = deltas[friendUserId];
        const balanceRef = balanceRefs[friendUserId];
        const snap = balanceSnaps[friendUserId];
        const existing = snap.exists() ? snap.data() : null;

        const currentOwnerBal: number = existing?.balances?.[currentUserId] ?? 0;
        const currentFriendBal: number = existing?.balances?.[friendUserId] ?? 0;
        const balanceId = balanceRef.id;

        transaction.set(
          balanceRef,
          {
            id: balanceId,
            participants: [currentUserId, friendUserId],
            balances: {
              [currentUserId]: currentOwnerBal + delta,
              [friendUserId]: currentFriendBal - delta,
            },
            lastUpdatedAt: Timestamp.now(),
            lastBillId: billId,
          },
          { merge: true }
        );
      }

      // We still need to populate newProcessedBalances for ALL involved friends, even if delta is 0
      for (const friendUserId of allInvolvedFriendIds) {
        const newAmount = newDeltasInside[friendUserId] || 0;
        if (newAmount !== 0) {
          newProcessedBalances[friendUserId] = newAmount;
        }
      }

      // Save the new footprint to the bill!
      transaction.update(billRef, { processedBalances: newProcessedBalances });
    });
  },

  /**
   * Scans a user's past bills and applies balances for any that were created
   * before the new ledger system (i.e. those missing 'processedBalances').
   * This acts as a self-healing background job.
   */
  async syncOldBillsForUser(userId: string): Promise<void> {
    try {
      const billsRef = collection(db, BILLS_COLLECTION);
      const q = query(billsRef, where('ownerId', '==', userId));
      const snap = await getDocs(q);

      for (const docSnap of snap.docs) {
        const bill = docSnap.data() as Bill & { processedBalances?: Record<string, number> };

        // Skip bills that have already been processed into the new ledger
        if (bill.processedBalances && Object.keys(bill.processedBalances).length > 0) continue;

        // Skip empty drafts or bills without items
        if (!bill.billData || !bill.billData.items || bill.billData.items.length === 0) continue;

        // Skip bills that haven't been assigned at all (unless split evenly)
        const hasAssignments = bill.itemAssignments && Object.keys(bill.itemAssignments).length > 0;
        if (!hasAssignments && !bill.splitEvenly) continue;

        // Skip bills with no people
        if (!bill.people || bill.people.length < 2) continue;

        // Calculate what the personTotals would have been when they hit the review step
        const personTotals = calculatePersonTotals(
          bill.billData,
          bill.people,
          bill.itemAssignments || {},
          bill.billData.tip || 0,
          bill.billData.tax || 0
        );

        if (personTotals.length > 0) {
          console.log(`Self-healing balances for old bill: ${bill.id}`);
          await this.applyBillBalances(docSnap.id, userId, personTotals);
        }
      }
    } catch (error) {
      console.error("Failed to execute background balance sync for old bills:", error);
    }
  },

  /**
   * Reverses all balance contributions made by a specific bill.
   * Must be called BEFORE the bill document is deleted.
   */
  async reverseBillBalances(billId: string, currentUserId: string): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const billSnap = await getDoc(billRef);
    if (!billSnap.exists()) return;

    const billData = billSnap.data() as Bill & { processedBalances?: Record<string, number> };
    if (billData.ownerId !== currentUserId) return;

    const processedBalances = billData.processedBalances;
    if (!processedBalances || Object.keys(processedBalances).length === 0) return;

    for (const [friendId, amount] of Object.entries(processedBalances)) {
      if (amount === 0) continue;

      const balanceId = this.getFriendBalanceId(currentUserId, friendId);
      const balanceRef = doc(db, FRIEND_BALANCES_COLLECTION, balanceId);

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(balanceRef);
        if (!snap.exists()) return; // Nothing to reverse

        const existing = snap.data();
        const currentOwnerBal: number = existing?.balances?.[currentUserId] ?? 0;
        const currentFriendBal: number = existing?.balances?.[friendId] ?? 0;

        transaction.set(
          balanceRef,
          {
            id: balanceId,
            participants: [currentUserId, friendId],
            balances: {
              [currentUserId]: currentOwnerBal - amount,
              [friendId]: currentFriendBal + amount,
            },
            lastUpdatedAt: Timestamp.now(),
            lastBillId: billId,
          },
          { merge: true }
        );
      });
    }
  },

  /**
   * Reverses an idempotent footprint before a bill is deleted.
   * Accepts optional providedPreviousBalances (read before deletion) to avoid
   * race conditions with deleteDoc.
   */
  async reverseBillBalancesIdempotent(
    billId: string,
    currentUserId: string,
    providedPreviousBalances?: Record<string, number>
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    await runTransaction(db, async (transaction) => {
      let previousBalances = providedPreviousBalances;

      if (!previousBalances) {
        const billSnap = await transaction.get(billRef);
        if (!billSnap.exists()) return;

        const billData = billSnap.data() as Bill;
        if (billData.ownerId !== currentUserId) return;

        previousBalances = billData.processedBalances;
      }

      if (!previousBalances || Object.keys(previousBalances).length === 0) return;

      // 1. Gather all reads
      const friendsToReverse: string[] = [];
      const balanceRefs: Record<string, any> = {};
      const balanceSnaps: Record<string, any> = {};

      for (const [friendId, amount] of Object.entries(previousBalances)) {
        if (amount === 0) continue;
        friendsToReverse.push(friendId);

        const balanceId = friendBalanceService.getFriendBalanceId(currentUserId, friendId);
        const balanceRef = doc(db, FRIEND_BALANCES_COLLECTION, balanceId);
        balanceRefs[friendId] = balanceRef;
        balanceSnaps[friendId] = await transaction.get(balanceRef);
      }

      // 2. Perform all writes
      for (const friendId of friendsToReverse) {
        const amount = previousBalances[friendId];
        const balanceRef = balanceRefs[friendId];
        const snap = balanceSnaps[friendId];

        if (!snap.exists()) continue;

        const existing = snap.data();
        const currentOwnerBal: number = existing?.balances?.[currentUserId] ?? 0;
        const currentFriendBal: number = existing?.balances?.[friendId] ?? 0;
        const balanceId = balanceRef.id;

        transaction.set(
          balanceRef,
          {
            id: balanceId,
            participants: [currentUserId, friendId],
            balances: {
              [currentUserId]: currentOwnerBal - amount,
              [friendId]: currentFriendBal + amount,
            },
            lastUpdatedAt: Timestamp.now(),
            lastBillId: billId,
          },
          { merge: true }
        );
      }

      if (!providedPreviousBalances) {
        transaction.update(billRef, { processedBalances: {} });
      }
    });
  },

  /**
   * Applies a settlement immediately to the friend balance.
   */
  async applySettlement(
    fromUserId: string, // the person paying
    toUserId: string,   // the person receiving
    amount: number
  ): Promise<void> {
    const balanceId = friendBalanceService.getFriendBalanceId(fromUserId, toUserId);
    const balanceRef = doc(db, FRIEND_BALANCES_COLLECTION, balanceId);

    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(balanceRef);
      const existing = snap.exists() ? snap.data() : null;

      const currentFromBal: number = existing?.balances?.[fromUserId] ?? 0;
      const currentToBal: number = existing?.balances?.[toUserId] ?? 0;

      // fromUser paid amount, so they are owed more (or owe less)
      // toUser received amount, so they owe more (or are owed less)
      transaction.set(
        balanceRef,
        {
          id: balanceId,
          participants: [fromUserId, toUserId],
          balances: {
            [fromUserId]: currentFromBal + amount,
            [toUserId]: currentToBal - amount,
          },
          lastUpdatedAt: Timestamp.now(),
        },
        { merge: true }
      );
    });
  },
};
