import { doc, collection, query, where, getDocs, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Bill, PersonTotal } from '@/types';
import { userService } from './userService';
import { optimizeDebts } from '@shared/optimizeDebts';

export type { OptimizedDebt } from '@shared/optimizeDebts';

const BILLS_COLLECTION = 'bills';
const EVENT_BALANCES_COLLECTION = 'event_balances';

export interface EventLedger {
  eventId: string;
  netBalances: Record<string, number>;
  optimizedDebts: OptimizedDebt[];
  processedBillIds: string[];
  lastUpdatedAt: Timestamp;
}

/**
 * Bill people use the `user-{uid}` format from generateUserId.
 * Firebase UIDs are the raw uid string. This helper converts between the two.
 */
function personIdToFirebaseUid(personId: string): string {
  return personId.startsWith('user-') ? personId.slice(5) : personId;
}

export const eventLedgerService = {
  /**
   * Applies the exact delta of a bill to the event's ledger collection.
   * Handles Creates, Edits, and Bill-specific Settlements identically.
   * Consumed by ledgerService — do not call directly from UI code.
   */
  async applyBillToEventLedgerIdempotent(
    eventId: string,
    billId: string,
    ownerId: string,
    personTotals: PersonTotal[]
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const eventLedgerRef = doc(db, EVENT_BALANCES_COLLECTION, eventId);

    // 1. Resolve Person IDs to Firebase User IDs to maintain ledger integrity
    const userProfile = await userService.getUserProfile(ownerId);
    const rawFriends: any[] = userProfile?.friends || [];
    const friendUserIds = new Set<string>(
      rawFriends.map(f => typeof f === 'string' ? f : (f.userId || f.id)).filter(Boolean)
    );
    friendUserIds.add(ownerId);

    await runTransaction(db, async (transaction) => {
      const billSnap = await transaction.get(billRef);
      if (!billSnap.exists()) return;

      const billData = billSnap.data() as Bill;
      const settledPersonIds = billData.settledPersonIds || [];
      const previousBalances = billData.eventBalancesApplied || {};

      // 2. Pre-calculate the NEW exact debts each friend owes for this bill
      const newDeltasInside: Record<string, number> = {};
      let totalBillAmount = 0;

      for (const total of personTotals) {
        totalBillAmount += total.total;
        const firebaseUserId = personIdToFirebaseUid(total.personId);
        const isOwner = firebaseUserId === ownerId;
        const mappedFirebaseUserId = friendUserIds.has(firebaseUserId) ? firebaseUserId : null;

        if (!mappedFirebaseUserId) continue;

        if (!newDeltasInside[mappedFirebaseUserId]) {
          newDeltasInside[mappedFirebaseUserId] = 0;
        }

        // If this is not the owner, they owe their share unless settled
        if (!isOwner) {
          const owesAmount = settledPersonIds.includes(total.personId) ? 0 : total.total;
          newDeltasInside[mappedFirebaseUserId] -= owesAmount;
        }
      }

      // The owner is owed the exact sum of what everyone else owes
      if (!newDeltasInside[ownerId]) {
        newDeltasInside[ownerId] = 0;
      }

      let ownerIsOwed = 0;
      for (const [uid, amt] of Object.entries(newDeltasInside)) {
        if (uid !== ownerId) {
          ownerIsOwed += Math.abs(amt);
        }
      }
      newDeltasInside[ownerId] = ownerIsOwed;

      // 3. Read Event Ledger
      const ledgerSnap = await transaction.get(eventLedgerRef);
      let ledgerData: EventLedger;
      if (ledgerSnap.exists()) {
        ledgerData = ledgerSnap.data() as EventLedger;
      } else {
        ledgerData = {
          eventId,
          netBalances: {},
          optimizedDebts: [],
          processedBillIds: [],
          lastUpdatedAt: Timestamp.now()
        };
      }

      // 4. Reverse previous footprint
      for (const [uid, prevAmount] of Object.entries(previousBalances)) {
        if (!ledgerData.netBalances[uid]) ledgerData.netBalances[uid] = 0;
        ledgerData.netBalances[uid] -= prevAmount;
      }

      // 5. Apply new footprint
      for (const [uid, newAmount] of Object.entries(newDeltasInside)) {
        if (!ledgerData.netBalances[uid]) ledgerData.netBalances[uid] = 0;
        ledgerData.netBalances[uid] += newAmount;

        if (Math.abs(ledgerData.netBalances[uid]) < 0.01) {
          ledgerData.netBalances[uid] = 0;
        }
      }

      // 6. Re-optimize debts
      ledgerData.optimizedDebts = optimizeDebts(ledgerData.netBalances);
      ledgerData.lastUpdatedAt = Timestamp.now();

      if (!ledgerData.processedBillIds.includes(billId)) {
        ledgerData.processedBillIds.push(billId);
      }

      // 7. Write updates
      transaction.set(eventLedgerRef, ledgerData, { merge: true });
      transaction.update(billRef, { eventBalancesApplied: newDeltasInside });
    });
  },

  /**
   * Reverses an idempotent footprint before an event bill is deleted.
   * If previousBalances is provided directly (e.g. read before deletion),
   * it avoids race conditions with deleteDoc.
   * Consumed by ledgerService — do not call directly from UI code.
   */
  async reverseBillFromEventLedgerIdempotent(
    eventId: string,
    billId: string,
    providedPreviousBalances?: Record<string, number>
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const eventLedgerRef = doc(db, EVENT_BALANCES_COLLECTION, eventId);

    await runTransaction(db, async (transaction) => {
      let previousBalances = providedPreviousBalances;

      if (!previousBalances) {
        const billSnap = await transaction.get(billRef);
        if (!billSnap.exists()) return;

        const billData = billSnap.data() as Bill;
        previousBalances = billData.eventBalancesApplied;
      }

      if (!previousBalances || Object.keys(previousBalances).length === 0) return;

      const ledgerSnap = await transaction.get(eventLedgerRef);
      if (!ledgerSnap.exists()) return;

      const ledgerData = ledgerSnap.data() as EventLedger;

      // Reverse footprint
      for (const [uid, prevAmount] of Object.entries(previousBalances)) {
        if (!ledgerData.netBalances[uid]) ledgerData.netBalances[uid] = 0;
        ledgerData.netBalances[uid] -= prevAmount;
        if (Math.abs(ledgerData.netBalances[uid]) < 0.01) {
          ledgerData.netBalances[uid] = 0;
        }
      }

      // Re-optimize
      ledgerData.optimizedDebts = optimizeDebts(ledgerData.netBalances);
      ledgerData.lastUpdatedAt = Timestamp.now();
      ledgerData.processedBillIds = ledgerData.processedBillIds.filter(id => id !== billId);

      // Write updates
      transaction.set(eventLedgerRef, ledgerData, { merge: true });
      if (!providedPreviousBalances) {
        transaction.update(billRef, { eventBalancesApplied: {} });
      }
    });
  },
};
