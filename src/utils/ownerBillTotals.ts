import type { BillData, ItemAssignment, Person, PersonTotal } from '@/types';
import { computeBillPersonTotals } from '@/utils/calculations';

/**
 * Person totals for the bill the OWNER is editing.
 *
 * Routes through computeBillPersonTotals — the SAME entry point the ledger
 * pipeline uses — so the owner UI and Venmo charges never diverge from what
 * balances records. In particular, a splitEvenly bill whose declared total
 * disagrees with its component sum (a receipt discount) is charged on
 * billData.total ($45), not the component sum ($50).
 *
 * Returns [] until every item is assigned, so itemized bills don't show
 * partial totals mid-assignment (unchanged from the previous behavior).
 */
export function selectOwnerPersonTotals(
  billData: BillData | null,
  people: Person[],
  itemAssignments: ItemAssignment,
  splitEvenly: boolean,
  allItemsAssigned: boolean
): PersonTotal[] {
  if (!allItemsAssigned) return [];
  return computeBillPersonTotals(billData, people, itemAssignments, splitEvenly);
}
