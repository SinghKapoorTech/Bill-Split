/**
 * Shared split-amount math for simple transactions and recurring bills.
 * Single source of truth for "divide an amount among people" — cent rounding,
 * remainder handling, validation, and the per-person share item shape.
 * Pure functions — no Firebase, no browser APIs.
 *
 * Convention: shares are rounded to cents and the LAST person absorbs the
 * rounding remainder, so shares always sum exactly to the total.
 */

import type { BillItem, ItemAssignment } from './types.js';

export type SplitMethod = 'equal' | 'percentage' | 'exact';

/** Tolerance (in dollars or percent points) for split validation. */
export const SPLIT_TOLERANCE = 0.02;

/** Rounds a value to two decimal places (cents). */
export function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Splits `total` into `count` cent-rounded shares.
 * The last share absorbs the rounding remainder, so the shares sum exactly.
 */
export function distributeEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const share = roundCents(total / count);
  const shares = new Array<number>(count).fill(share);
  shares[count - 1] = roundCents(total - share * (count - 1));
  return shares;
}

/**
 * Resolves the amount each person owes for a split configuration.
 * For every method the last person absorbs the rounding remainder, so the
 * returned amounts sum exactly to `amount` — matching what gets persisted
 * as bill items and what the ledger pipeline records.
 */
export function resolveSplitAmounts(
  amount: number,
  people: { id: string }[],
  method: SplitMethod,
  percentages?: Record<string, number>,
  exactAmounts?: Record<string, number>
): Record<string, number> {
  const result: Record<string, number> = {};
  if (people.length === 0) return result;

  if (method === 'equal') {
    const shares = distributeEvenly(amount, people.length);
    people.forEach((person, i) => {
      result[person.id] = shares[i];
    });
    return result;
  }

  let runningTotal = 0;
  people.forEach((person, i) => {
    let share: number;
    if (i === people.length - 1) {
      share = roundCents(amount - runningTotal);
    } else if (method === 'percentage') {
      share = roundCents(amount * (percentages?.[person.id] || 0) / 100);
    } else {
      share = roundCents(exactAmounts?.[person.id] || 0);
    }
    runningTotal += share;
    result[person.id] = share;
  });
  return result;
}

/**
 * Validates a split configuration: percentages must sum to ~100,
 * exact amounts must sum to ~the total. Equal splits are always valid.
 */
export function isSplitConfigValid(
  method: SplitMethod,
  amount: number,
  percentages?: Record<string, number>,
  exactAmounts?: Record<string, number>
): boolean {
  if (method === 'percentage') {
    const sum = Object.values(percentages || {}).reduce((a, b) => a + b, 0);
    return Math.abs(sum - 100) < SPLIT_TOLERANCE;
  }
  if (method === 'exact') {
    const sum = Object.values(exactAmounts || {}).reduce((a, b) => a + b, 0);
    return Math.abs(sum - amount) < SPLIT_TOLERANCE;
  }
  return true;
}

/**
 * Builds the per-person "X's share" bill items and assignments used by
 * percentage/exact splits (one item per person, assigned only to them).
 */
export function buildPerPersonShareItems(
  people: { id: string; name: string }[],
  amounts: Record<string, number>
): { items: BillItem[]; itemAssignments: ItemAssignment } {
  const items: BillItem[] = [];
  const itemAssignments: ItemAssignment = {};
  for (const person of people) {
    const itemId = `item-${person.id}`;
    items.push({ id: itemId, name: `${person.name}'s share`, price: amounts[person.id] ?? 0 });
    itemAssignments[itemId] = [person.id];
  }
  return { items, itemAssignments };
}
