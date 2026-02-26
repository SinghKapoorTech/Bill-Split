/**
 * Shared bill-splitting calculation logic.
 * Single source of truth used by both the client app and Cloud Functions.
 * Pure functions — no Firebase, no browser APIs.
 */

import { BillData, Person, PersonTotal, ItemAssignment } from './types.js';

export function calculatePersonTotals(
  billData: BillData | null,
  people: Person[],
  itemAssignments: ItemAssignment,
  effectiveTip: number,
  effectiveTax: number
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

  const totalAssignedSubtotal = Object.values(personSubtotals).reduce((sum, val) => sum + val, 0);

  const results: PersonTotal[] = people.map(person => {
    const personSubtotal = personSubtotals[person.id];
    const proportion = totalAssignedSubtotal > 0 ? personSubtotal / totalAssignedSubtotal : 0;
    const personTax = effectiveTax * proportion;
    const personTip = effectiveTip * proportion;
    const personTotal = personSubtotal + personTax + personTip;

    return {
      personId: person.id,
      name: person.name,
      itemsSubtotal: personSubtotal,
      tax: personTax,
      tip: personTip,
      total: personTotal,
    };
  });

  return results.filter(pt => pt.total > 0);
}

export function areAllItemsAssigned(billData: BillData | null, itemAssignments: ItemAssignment): boolean {
  if (!billData || !billData.items) return false;
  return billData.items.every(item => {
    const assignments = itemAssignments[item.id] || [];
    return assignments.length > 0;
  });
}
