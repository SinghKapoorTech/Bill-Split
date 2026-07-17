/**
 * Shared bill-splitting calculation logic.
 * Single source of truth used by both the client app and Cloud Functions.
 * Pure functions — no Firebase, no browser APIs.
 */

import { BillData, Person, PersonTotal, ItemAssignment } from './types.js';
import { distributeEvenly } from './splitAmounts.js';

export function calculatePersonTotals(
  billData: BillData | null,
  people: Person[],
  itemAssignments: ItemAssignment,
  effectiveTip: number,
  effectiveTax: number,
  effectiveOtherFees: number = 0
): PersonTotal[] {
  if (!billData || people.length === 0) return [];

  const personSubtotals: Record<string, number> = {};
  people.forEach(person => {
    personSubtotals[person.id] = 0;
  });

  billData.items.forEach(item => {
    const assignedPeople = itemAssignments[item.id] || [];
    if (assignedPeople.length > 0) {
      const splitPrice = item.price / assignedPeople.length;
      assignedPeople.forEach(personId => {
        if (personSubtotals[personId] !== undefined) {
          personSubtotals[personId] += splitPrice;
        }
      });
    }
  });

  // Tax/tip/fees are shared in proportion to each person's slice of the WHOLE
  // bill (sum of all item prices), not just the currently-assigned items —
  // otherwise the first claimer on a partially-assigned bill absorbs 100% of
  // the tax/tip. Fully-assigned bills are unaffected (the sums are equal).
  const totalItemsSubtotal = billData.items.reduce((sum, item) => sum + item.price, 0);

  const results: PersonTotal[] = people.map(person => {
    const personSubtotal = personSubtotals[person.id];
    const proportion = totalItemsSubtotal > 0 ? personSubtotal / totalItemsSubtotal : 0;
    const personTax = effectiveTax * proportion;
    const personTip = effectiveTip * proportion;
    const personOtherFees = effectiveOtherFees * proportion;
    const personTotal = personSubtotal + personTax + personTip + personOtherFees;

    return {
      personId: person.id,
      name: person.name,
      itemsSubtotal: personSubtotal,
      tax: personTax,
      tip: personTip,
      otherFees: personOtherFees,
      total: personTotal,
    };
  });

  return results;
}

/**
 * Builds the full assignment map for an even split: every person on every item.
 * Single source of truth for the "split evenly" → assignments expansion
 * (used by the ledger pipeline, event balance calculator, and bill splitter UI).
 */
export function buildEvenSplitAssignments(
  billData: BillData | null,
  people: Person[]
): ItemAssignment {
  if (!billData?.items?.length || people.length === 0) return {};

  const assignments: ItemAssignment = {};
  const everyone = people.map(person => person.id);
  billData.items.forEach(item => {
    assignments[item.id] = everyone;
  });
  return assignments;
}

/**
 * Computes person totals for a bill, handling the splitEvenly flag.
 * This is the single entry point for "what does each person owe on this bill?" —
 * it routes even splits through the same proportional calculation as itemized
 * splits, so client and server always agree and shares sum exactly to the total.
 */
export function computeBillPersonTotals(
  billData: BillData | null,
  people: Person[],
  itemAssignments: ItemAssignment,
  splitEvenly: boolean
): PersonTotal[] {
  if (!billData || people.length === 0) return [];

  let effectiveAssignments = itemAssignments || {};

  if (splitEvenly) {
    if (billData.items?.length) {
      // When the declared total disagrees with the component sum (discounts,
      // unparsed receipt lines), the users were shown and agreed to
      // billData.total — split THAT, cent-exact. The proportional item
      // expansion below would silently charge the component sum instead.
      const componentSum =
        billData.items.reduce((sum, item) => sum + item.price, 0) +
        (billData.tax || 0) + (billData.tip || 0) + (billData.otherFees || 0);
      const declaredTotal = billData.total;
      if (
        typeof declaredTotal === 'number' && isFinite(declaredTotal) &&
        Math.abs(componentSum - declaredTotal) > 0.01
      ) {
        const shares = distributeEvenly(declaredTotal, people.length);
        return people.map((person, i) => ({
          personId: person.id,
          name: person.name,
          itemsSubtotal: shares[i],
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: shares[i],
        }));
      }
      effectiveAssignments = buildEvenSplitAssignments(billData, people);
    } else {
      // No items to split (legacy/edge data): cent-exact even shares of the
      // total (naive division yields unpayable fractions like 50.005).
      const shares = distributeEvenly(billData.total, people.length);
      return people.map((person, i) => ({
        personId: person.id,
        name: person.name,
        itemsSubtotal: shares[i],
        tax: 0,
        tip: 0,
        otherFees: 0,
        total: shares[i],
      }));
    }
  }

  return calculatePersonTotals(
    billData,
    people,
    effectiveAssignments,
    billData.tip || 0,
    billData.tax || 0,
    billData.otherFees || 0
  );
}

export function areAllItemsAssigned(billData: BillData | null, itemAssignments: ItemAssignment): boolean {
  if (!billData || !billData.items) return false;
  return billData.items.every(item => {
    const assignments = itemAssignments[item.id] || [];
    return assignments.length > 0;
  });
}
