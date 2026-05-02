/**
 * Client-side event balance calculator.
 *
 * Computes event balances directly from bills when the server-side
 * event_balances cache is missing or stale. Mirrors the logic in
 * ledgerProcessor.ts rebuildEventCache() exactly.
 *
 * Pure function — no Firestore, no side effects.
 */

import { Bill } from '@/types/bill.types';
import { calculatePersonTotals } from '@shared/calculations';
import { personIdToFirebaseUid } from '@shared/ledgerCalculations';
import { simplifyDebts, OptimizedDebt } from '@shared/optimizeDebts';

export interface ComputedEventBalances {
  netBalances: Record<string, number>;
  optimizedDebts: OptimizedDebt[];
}

/**
 * Computes event balances from an array of bills.
 * Builds directed pair debts (each participant owes the bill's creditor)
 * then simplifies via cycle elimination only — never reassigns debts
 * to uninvolved parties.
 */
export function computeEventBalances(bills: Bill[]): ComputedEventBalances {
  const netBalances: Record<string, number> = {};
  const pairDebts: OptimizedDebt[] = [];

  for (const bill of bills) {
    const people = bill.people || [];
    const creditorId = personIdToFirebaseUid(bill.paidById || bill.ownerId);
    const settledPersonIds = bill.settledPersonIds || [];

    if (!bill.billData?.items?.length || !creditorId || people.length === 0) continue;

    // Compute person totals — handles both splitEvenly and item-assignment splits
    let personTotals;
    if (bill.splitEvenly) {
      const share = bill.billData.total / people.length;
      personTotals = people.map(p => ({
        personId: p.id,
        name: p.name,
        itemsSubtotal: share,
        tax: 0,
        tip: 0,
        total: parseFloat(share.toFixed(2)),
      }));
    } else {
      personTotals = calculatePersonTotals(
        bill.billData,
        people,
        bill.itemAssignments || {},
        bill.billData.tip,
        bill.billData.tax,
        bill.billData.otherFees ?? 0
      );
    }

    // Build directed pair debts: each non-creditor participant owes the creditor
    for (const pt of personTotals) {
      const uid = personIdToFirebaseUid(pt.personId);
      if (uid === creditorId) continue;

      const owesAmount = settledPersonIds.includes(pt.personId) ? 0 : pt.total;
      if (owesAmount > 0.01 && uid !== creditorId) {
        pairDebts.push({ fromUserId: uid, toUserId: creditorId, amount: owesAmount });
        // Also track net balances for consumers that need them
        netBalances[uid] = (netBalances[uid] ?? 0) - owesAmount;
        netBalances[creditorId] = (netBalances[creditorId] ?? 0) + owesAmount;
      }
    }
  }

  // Clean near-zero net values
  for (const uid of Object.keys(netBalances)) {
    if (Math.abs(netBalances[uid]) < 0.01) {
      netBalances[uid] = 0;
    }
  }

  const simplifiedDebts = simplifyDebts(pairDebts);

  // Deduplicate by (fromUserId, toUserId) — guards against any edge case producing two rows
  const seenKeys = new Set<string>();
  const dedupedDebts = simplifiedDebts.filter(d => {
    const key = `${d.fromUserId}|${d.toUserId}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  return {
    netBalances,
    optimizedDebts: dedupedDebts,
  };
}
