import { doc, getDoc, collection, query, where, getDocs, Timestamp, runTransaction } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Bill, PersonTotal } from '@/types';
import { userService } from './userService';

const EVENTS_COLLECTION = 'events';
const BILLS_COLLECTION = 'bills';
const EVENT_BALANCES_COLLECTION = 'event_balances';

export interface OptimizedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

export interface EventLedger {
  eventId: string;
  netBalances: Record<string, number>;
  optimizedDebts: OptimizedDebt[];
  processedBillIds: string[];
  lastUpdatedAt: Timestamp;
}

export const eventLedgerService = {
  /**
   * Applies a bill to the event's ledger using runTransaction.
   */
  async applyBillToEventLedger(
    eventId: string,
    billId: string,
    ownerId: string,
    personTotals: PersonTotal[]
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const eventLedgerRef = doc(db, EVENT_BALANCES_COLLECTION, eventId);

    // 1. Pre-calculate the deltas (who paid vs who owes what)
    // Positive balance means they are owed money. Negative means they owe money.
    const deltas: Record<string, number> = {};
    
    // Resolve Person IDs to Firebase User IDs to maintain ledger integrity
    const userProfile = await userService.getUserProfile(ownerId);
    const rawFriends: any[] = userProfile?.friends || [];
    const friendUserIds = new Set<string>(
      rawFriends.map(f => typeof f === 'string' ? f : (f.userId || f.id)).filter(Boolean)
    );
    friendUserIds.add(ownerId);

    let totalBillAmount = 0;
    for (const total of personTotals) {
        totalBillAmount += total.total;
    }

    for (const total of personTotals) {
      const isOwner = total.personId === ownerId;
      const firebaseUserId = friendUserIds.has(total.personId) ? total.personId : null;
      
      if (!firebaseUserId) continue;

      if (!deltas[firebaseUserId]) {
        deltas[firebaseUserId] = 0;
      }
      
      // If this is not the owner, they owe their share
      if (!isOwner) {
         deltas[firebaseUserId] -= total.total;
      }
    }
    
    // The owner paid for the whole bill, so they are owed everything except their own share
    if (!deltas[ownerId]) {
        deltas[ownerId] = 0;
    }
    
    const ownerShare = personTotals.find(t => t.personId === ownerId)?.total || 0;
    deltas[ownerId] += (totalBillAmount - ownerShare);

    // 2. Execute Transaction
    await runTransaction(db, async (transaction) => {
      const ledgerSnap = await transaction.get(eventLedgerRef);
      const billSnap = await transaction.get(billRef);

      if (!billSnap.exists()) {
        throw new Error("Bill does not exist.");
      }

      const billData = billSnap.data() as Bill & { eventLedgerProcessed?: boolean };
      
      // Prevent double counting
      if (billData.eventLedgerProcessed) {
        return;
      }

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

      // If bill was already processed but the flag wasn't set on the bill somehow
      if (ledgerData.processedBillIds.includes(billId)) {
          // just update the bill flag and return
          transaction.update(billRef, { eventLedgerProcessed: true });
          return;
      }

      // Apply deltas to net balances
      for (const [userId, delta] of Object.entries(deltas)) {
        if (!ledgerData.netBalances[userId]) {
            ledgerData.netBalances[userId] = 0;
        }
        ledgerData.netBalances[userId] += delta;
        
        // clean up tiny float errors
        if (Math.abs(ledgerData.netBalances[userId]) < 0.01) {
            ledgerData.netBalances[userId] = 0;
        }
      }

      // Run debt simplification algorithm
      ledgerData.optimizedDebts = eventLedgerService.optimizeDebts(ledgerData.netBalances);
      ledgerData.processedBillIds.push(billId);
      ledgerData.lastUpdatedAt = Timestamp.now();

      // Write updates
      transaction.set(eventLedgerRef, ledgerData, { merge: true });
      transaction.update(billRef, { eventLedgerProcessed: true });
    });
  },

  /**
   * Rebuilds the event ledger by scanning all active bills for the event.
   */
  async recalculateEventLedger(eventId: string): Promise<void> {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('eventId', '==', eventId)
    );

    const snapshot = await getDocs(q);
    const bills = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Bill));
    
    // We recreate the deltas for all bills
    const aggregatedBalances: Record<string, number> = {};
    const processedBillIds: string[] = [];

    for (const bill of bills) {
      if (!bill.people || !bill.billData || !bill.billData.items || bill.billData.items.length === 0) continue;
      
      const { calculatePersonTotals } = await import('@/utils/calculations');
      const personTotals = calculatePersonTotals(
        bill.billData,
        bill.people,
        bill.itemAssignments || {},
        bill.billData.tip || 0,
        bill.billData.tax || 0
      );

      // Resolve personas to Firebase UIDs
      const userProfile = await userService.getUserProfile(bill.ownerId);
      const rawFriends: any[] = userProfile?.friends || [];
      const friendUserIds = new Set<string>(
        rawFriends.map(f => typeof f === 'string' ? f : (f.userId || f.id)).filter(Boolean)
      );
      friendUserIds.add(bill.ownerId);

      const deltas: Record<string, number> = {};
      let totalBillAmount = 0;
      for (const total of personTotals) {
          totalBillAmount += total.total;
      }

      for (const total of personTotals) {
        const isOwner = total.personId === bill.ownerId;
        const firebaseUserId = friendUserIds.has(total.personId) ? total.personId : null;
        
        if (!firebaseUserId) continue;

        if (!deltas[firebaseUserId]) deltas[firebaseUserId] = 0;
        
        if (!isOwner) {
           deltas[firebaseUserId] -= total.total;
        }
      }
      
      if (!deltas[bill.ownerId]) deltas[bill.ownerId] = 0;
      
      const ownerShare = personTotals.find(t => t.personId === bill.ownerId)?.total || 0;
      deltas[bill.ownerId] += (totalBillAmount - ownerShare);

      // Add bill's deltas to aggregated balances
      for (const [userId, delta] of Object.entries(deltas)) {
        if (!aggregatedBalances[userId]) aggregatedBalances[userId] = 0;
        aggregatedBalances[userId] += delta;
        if (Math.abs(aggregatedBalances[userId]) < 0.01) {
            aggregatedBalances[userId] = 0;
        }
      }

      processedBillIds.push(bill.id);
    }

    const optimizedDebts = eventLedgerService.optimizeDebts(aggregatedBalances);

    const eventLedgerRef = doc(db, EVENT_BALANCES_COLLECTION, eventId);
    
    // Write new state
    await runTransaction(db, async (transaction) => {
      transaction.set(eventLedgerRef, {
        eventId,
        netBalances: aggregatedBalances,
        optimizedDebts,
        processedBillIds,
        lastUpdatedAt: Timestamp.now()
      });
      // Also ensure all bills are marked as processed
      for (const billId of processedBillIds) {
        const billRef = doc(db, BILLS_COLLECTION, billId);
        transaction.update(billRef, { eventLedgerProcessed: true });
      }
    });

    console.log(`Recalculated event ledger for ${eventId} using ${bills.length} bills.`);
  },

  /**
   * Greedy debt simplification algorithm.
   */
  optimizeDebts(netBalances: Record<string, number>): OptimizedDebt[] {
    const debtors: { userId: string; amount: number }[] = [];
    const creditors: { userId: string; amount: number }[] = [];

    // Separate into debtors (negative balance) and creditors (positive balance)
    for (const [userId, balance] of Object.entries(netBalances)) {
      if (balance < -0.01) {
        debtors.push({ userId, amount: Math.abs(balance) });
      } else if (balance > 0.01) {
        creditors.push({ userId, amount: balance });
      }
    }

    // Sort descending by amount to minimize transactions
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const optimizedDebts: OptimizedDebt[] = [];
    let i = 0; // debtor index
    let j = 0; // creditor index

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      
      const settleAmount = Math.min(debtor.amount, creditor.amount);
      
      if (settleAmount > 0.01) {
        optimizedDebts.push({
          fromUserId: debtor.userId,
          toUserId: creditor.userId,
          amount: parseFloat(settleAmount.toFixed(2))
        });
      }

      debtor.amount -= settleAmount;
      creditor.amount -= settleAmount;

      if (debtor.amount < 0.01) i++;
      if (creditor.amount < 0.01) j++;
    }

    return optimizedDebts;
  }
};
