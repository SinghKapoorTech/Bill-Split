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
import { optimizeDebts, OptimizedDebt } from '@shared/optimizeDebts';

export interface ComputedEventBalances {
  netBalances: Record<string, number>;
  optimizedDebts: OptimizedDebt[];
}

/**
 * Computes event balances from an array of bills.
 * Mirrors the server-side rebuildEventCache() logic:
 *   - For each bill, compute person totals
 *   - Non-owner participants owe (negative), owner is owed (positive)
 *   - Settled persons contribute 0
 *   - Run optimizeDebts on aggregate
 */
export function computeEventBalances(bills: Bill[]): ComputedEventBalances {
  const netBalances: Record<string, number> = {};

  for (const bill of bills) {
    const people = bill.people || [];
    const ownerId = bill.ownerId;
    const settledPersonIds = bill.settledPersonIds || [];

    if (!bill.billData?.items?.length || !ownerId || people.length === 0) continue;

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
        bill.billData.tax
      );
    }

    // Aggregate: non-owner participants owe (negative), owner is owed (positive)
    let ownerIsOwed = 0;
    for (const pt of personTotals) {
      const uid = personIdToFirebaseUid(pt.personId);
      if (uid === ownerId) continue;

      const owesAmount = settledPersonIds.includes(pt.personId) ? 0 : pt.total;
      if (owesAmount > 0) {
        netBalances[uid] = (netBalances[uid] ?? 0) - owesAmount;
        ownerIsOwed += owesAmount;
      }
    }
    if (ownerIsOwed > 0.001) {
      netBalances[ownerId] = (netBalances[ownerId] ?? 0) + ownerIsOwed;
    }
  }

  // Clean near-zero values
  for (const uid of Object.keys(netBalances)) {
    if (Math.abs(netBalances[uid]) < 0.01) {
      netBalances[uid] = 0;
    }
  }

  return {
    netBalances,
    optimizedDebts: optimizeDebts(netBalances),
  };
}
