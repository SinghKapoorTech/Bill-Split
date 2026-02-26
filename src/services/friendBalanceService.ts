import { doc, updateDoc, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Bill, PersonTotal } from '@/types';
import { userService } from './userService';

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
   * Applies the exact delta of a bill to the friend_balances collection.
   * Handles Creates, Edits, and Bill-specific Settlements identically.
   * Consumed by ledgerService — do not call directly from UI code.
   *
   * Key design decisions:
   * - Uses runTransaction (read-then-write) instead of writeBatch + FieldValue.increment().
   *   This is because Firestore security rules evaluate request.resource.data BEFORE
   *   server-side transforms are applied, which causes permission errors on new document
   *   creation when FieldValue.increment() is mixed with set+merge.
   * - Resolves bill-local person IDs to real Firebase user IDs via the owner's friends list
   *   (user.friends is now string[] — just UIDs).
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

      // Now we have the old footprint (previousBalances) and the new footprint (newDeltasInside).
      // For each friend involved in either footprint, run a delta update.
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

      // Populate newProcessedBalances for ALL involved friends, even if delta is 0
      for (const friendUserId of allInvolvedFriendIds) {
        const newAmount = newDeltasInside[friendUserId] || 0;
        if (newAmount !== 0) {
          newProcessedBalances[friendUserId] = newAmount;
        }
      }

      // Save the new footprint to the bill
      transaction.update(billRef, { processedBalances: newProcessedBalances });
    });
  },

  /**
   * Reverses an idempotent footprint before a bill is deleted.
   * Accepts optional providedPreviousBalances (read before deletion) to avoid
   * race conditions with deleteDoc.
   * Consumed by ledgerService — do not call directly from UI code.
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
};
