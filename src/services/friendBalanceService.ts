import { doc, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Bill, PersonTotal } from '@/types';
import { userService } from './userService';
import {
  getFriendBalanceId,
  calculateFriendFootprint,
  computeFootprintDeltas,
  toProcessedBalances,
} from '@shared/ledgerCalculations';

const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';

export const friendBalanceService = {
  getFriendBalanceId,

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

      const previousBalances = billData.processedBalances || {};

      // Calculate the new footprint using shared pure function
      const newFootprint = calculateFriendFootprint({
        people: billData.people || [],
        personTotals,
        settledPersonIds: billData.settledPersonIds || [],
        linkedFriendUids: friendUserIds,
        ownerId: currentUserId,
        creditorId: billData.paidById || billData.ownerId,
      });

      // Compute deltas between old and new footprints
      const deltas = computeFootprintDeltas(newFootprint, previousBalances);

      // 1. Gather all reads for friends with non-zero deltas
      const balanceRefs: Record<string, any> = {};
      const balanceSnaps: Record<string, any> = {};

      for (const friendUserId of Object.keys(deltas)) {
        const balanceId = getFriendBalanceId(currentUserId, friendUserId);
        const balanceRef = doc(db, FRIEND_BALANCES_COLLECTION, balanceId);
        balanceRefs[friendUserId] = balanceRef;
        balanceSnaps[friendUserId] = await transaction.get(balanceRef);
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

      // Save the new footprint to the bill
      transaction.update(billRef, { processedBalances: toProcessedBalances(newFootprint) });
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

        const balanceId = getFriendBalanceId(currentUserId, friendId);
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
