import { doc, getDoc, updateDoc, collection, query, where, getDocs, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Bill, PersonTotal } from '@/types';
import { userService } from './userService';
import { calculatePersonTotals } from '@/utils/calculations';

const USERS_COLLECTION = 'users';
const BILLS_COLLECTION = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';

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
      const newAmount = total.total;
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
};
