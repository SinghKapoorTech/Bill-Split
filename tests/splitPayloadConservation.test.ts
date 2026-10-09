/**
 * MONEY CONSERVATION for simple-transaction split payloads.
 *
 * The invariant (see docs/plans/bill-money-invariants.md, I1 + the
 * conservation theorem): whatever roster and split method a bill is built
 * from, the per-person items must sum to `billData.total`, and
 * `calculatePersonTotals` must then collect exactly that much. Any gap is
 * money charged to NOBODY, silently absorbed by the payer.
 *
 * Why this file exists: a fix for a ghost-assignee leak introduced a NEW leak
 * of the same kind. `handleRemovePerson` rebuilt the payload from the new
 * roster but the OLD amount maps — because those maps are redistributed by a
 * React effect that had not run yet when the synchronous write fired. For an
 * `exact` split that persisted items summing to less than the declared total
 * ($10 of $30 charged to nobody); for `percentage` the last remaining person
 * silently absorbed the removed share. Neither was caught by anything:
 * `validateBillAmounts` range-checks individual amounts and never verifies
 * that items sum to the total.
 *
 * So the first block pins that exact regression, and the second asserts the
 * property across randomly generated inputs — the class, not the instance.
 * Example-based tests only ever encode bugs somebody already found.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  redistributeSharesAcross,
  resolveSplitAmounts,
  buildPerPersonShareItems,
  type SplitMethod,
} from '@shared/splitAmounts';
import { calculatePersonTotals } from '@shared/calculations';
import type { Person } from '@/types';

const person = (id: string): Person => ({ id, name: id });

/**
 * Mirrors what `SimpleTransactionWizard.buildSplitPayload` produces for the
 * non-`equal` methods, which is where per-person items are created.
 */
function buildPayload(
  roster: Person[],
  total: number,
  method: SplitMethod,
  percentages: Record<string, number>,
  exactAmounts: Record<string, number>,
) {
  const amounts = resolveSplitAmounts(total, roster, method, percentages, exactAmounts);
  const { items, itemAssignments } = buildPerPersonShareItems(roster, amounts);

  return {
    billData: {
      items,
      subtotal: total,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total,
      restaurantName: 'T',
    },
    itemAssignments,
  };
}

const collected = (
  billData: ReturnType<typeof buildPayload>['billData'],
  roster: Person[],
  itemAssignments: Record<string, string[]>,
) =>
  calculatePersonTotals(
    billData,
    roster,
    itemAssignments,
    billData.tip,
    billData.tax,
    billData.otherFees,
  ).reduce((sum, t) => sum + t.total, 0);

describe('the removal regression this file was written for', () => {
  const A = person('user-A');
  const B = person('user-B');
  const TOTAL = 30;

  it('EXACT: stale amount maps leak the removed share — the bug', () => {
    // What the broken fix wrote: fresh roster, STALE exactAmounts.
    const staleExact = { 'user-A': 10, 'user-B': 10, 'user-C': 10 };
    const { billData, itemAssignments } = buildPayload([A, B], TOTAL, 'exact', {}, staleExact);

    const itemsSum = billData.items.reduce((s, i) => s + i.price, 0);
    expect(itemsSum).toBe(20); // items no longer sum to the declared total
    expect(billData.total).toBe(30);
    expect(collected(billData, [A, B], itemAssignments)).toBe(20);
    // $10 charged to nobody.
  });

  it('EXACT: redistributing first conserves the total — the fix', () => {
    const remaining = [A, B];
    const fresh = redistributeSharesAcross(remaining, TOTAL);
    expect(fresh).toEqual({ 'user-A': 15, 'user-B': 15 });

    const { billData, itemAssignments } = buildPayload(remaining, TOTAL, 'exact', {}, fresh);

    expect(billData.items.reduce((s, i) => s + i.price, 0)).toBeCloseTo(30, 10);
    expect(collected(billData, remaining, itemAssignments)).toBeCloseTo(30, 10);
  });

  it('PERCENTAGE: stale maps dump the removed share on the last person', () => {
    // resolveSplitAmounts gives the LAST person `total - runningTotal`, so a
    // stale 1/3-each map silently charges B double.
    const stalePct = { 'user-A': 33.33, 'user-B': 33.33, 'user-C': 33.34 };
    const { billData, itemAssignments } = buildPayload([A, B], TOTAL, 'percentage', stalePct, {});

    const totals = calculatePersonTotals(billData, [A, B], itemAssignments, 0, 0, 0);
    const bTotal = totals.find((t) => t.personId === 'user-B')!.total;

    // Conserves, but B is charged $20 on a bill they split in thirds.
    expect(collected(billData, [A, B], itemAssignments)).toBeCloseTo(30, 10);
    expect(bTotal).toBeCloseTo(20, 10);
  });

  it('PERCENTAGE: redistributing first splits it evenly — the fix', () => {
    const remaining = [A, B];
    const fresh = redistributeSharesAcross(remaining, 100);

    const { billData, itemAssignments } = buildPayload(remaining, TOTAL, 'percentage', fresh, {});

    const totals = calculatePersonTotals(billData, remaining, itemAssignments, 0, 0, 0);
    expect(totals.map((t) => t.total)).toEqual([15, 15]);
    expect(collected(billData, remaining, itemAssignments)).toBeCloseTo(30, 10);
  });
});

describe('property: a redistributed payload always conserves the total', () => {
  const rosterOf = (n: number) => Array.from({ length: n }, (_, i) => person(`user-${i}`));


  it('EXACT and PERCENTAGE conserve for any roster size and total', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 200000 }),
        fc.constantFrom<SplitMethod>('exact', 'percentage'),
        (n, cents, method) => {
          const roster = rosterOf(n);
          const total = cents / 100;

          const percentages = redistributeSharesAcross(roster, 100);
          const exactAmounts = redistributeSharesAcross(roster, total);

          const { billData, itemAssignments } = buildPayload(
            roster,
            total,
            method,
            percentages,
            exactAmounts,
          );

          // I1: every assignee is a person on the bill.
          const ids = new Set(roster.map((p) => p.id));
          for (const assignees of Object.values(itemAssignments)) {
            for (const a of assignees) expect(ids.has(a)).toBe(true);
          }

          // Conservation: items sum to the declared total, and the calculator
          // collects all of it. Half a cent per person covers rounding.
          const itemsSum = billData.items.reduce((s, i) => s + i.price, 0);
          const tol = Math.max(0.01, n * 0.005);
          expect(Math.abs(itemsSum - total)).toBeLessThanOrEqual(tol);
          expect(
            Math.abs(collected(billData, roster, itemAssignments) - total),
          ).toBeLessThanOrEqual(tol);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('removing any one person still conserves, after redistributing', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.integer({ min: 1, max: 200000 }),
        fc.constantFrom<SplitMethod>('exact', 'percentage'),
        fc.nat(),
        (n, cents, method, victimSeed) => {
          const roster = rosterOf(n);
          const total = cents / 100;
          const victim = roster[victimSeed % n];
          const remaining = roster.filter((p) => p.id !== victim.id);

          // The fix: redistribute across the REMAINING roster first.
          const percentages = redistributeSharesAcross(remaining, 100);
          const exactAmounts = redistributeSharesAcross(remaining, total);

          const { billData, itemAssignments } = buildPayload(
            remaining,
            total,
            method,
            percentages,
            exactAmounts,
          );

          // No ghost: the removed person appears nowhere in the assignments.
          for (const assignees of Object.values(itemAssignments)) {
            expect(assignees).not.toContain(victim.id);
          }

          const tol = Math.max(0.01, remaining.length * 0.005);
          expect(
            Math.abs(collected(billData, remaining, itemAssignments) - total),
          ).toBeLessThanOrEqual(tol);
        },
      ),
      { numRuns: 500 },
    );
  });
});
