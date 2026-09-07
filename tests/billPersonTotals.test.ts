import { describe, it, expect } from 'vitest';
import {
  calculatePersonTotals,
  buildEvenSplitAssignments,
  computeBillPersonTotals,
} from '@shared/calculations';
import type { BillData } from '@shared/types';

const people = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Cara' },
];

const bill: BillData = {
  items: [
    { id: 'a', name: 'Pizza', price: 20 },
    { id: 'b', name: 'Soda', price: 10 },
  ],
  subtotal: 30,
  tax: 3,
  tip: 6,
  otherFees: 1,
  total: 40,
};

describe('buildEvenSplitAssignments', () => {
  it('assigns every person to every item', () => {
    const assignments = buildEvenSplitAssignments(bill, people);
    expect(assignments).toEqual({
      a: ['p1', 'p2', 'p3'],
      b: ['p1', 'p2', 'p3'],
    });
  });

  it('returns {} for null billData or empty people', () => {
    expect(buildEvenSplitAssignments(null, people)).toEqual({});
    expect(buildEvenSplitAssignments(bill, [])).toEqual({});
  });
});

describe('computeBillPersonTotals', () => {
  it('splitEvenly: distributes tax/tip/fees and sums exactly to the bill total', () => {
    // Regression: the old ledger lump-share path rounded each share
    // independently ($100.01 / 2 → $50.01 + $50.01 = $100.02).
    const oddBill: BillData = {
      items: [{ id: 'x', name: 'Thing', price: 100.01 }],
      subtotal: 100.01,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: 100.01,
    };
    const totals = computeBillPersonTotals(oddBill, people.slice(0, 2), {}, true);
    expect(totals).toHaveLength(2);
    expect(totals[0].total + totals[1].total).toBeCloseTo(100.01, 10);
  });

  it('splitEvenly: matches the canonical calculation with full assignments', () => {
    const expected = calculatePersonTotals(
      bill,
      people,
      buildEvenSplitAssignments(bill, people),
      bill.tip,
      bill.tax,
      bill.otherFees,
    );
    const actual = computeBillPersonTotals(bill, people, {}, true);
    expect(actual).toEqual(expected);
    // Each person carries a proportional tax share (old server path zeroed it).
    expect(actual[0].tax).toBeCloseTo(1, 5);
    expect(actual.reduce((s, t) => s + t.total, 0)).toBeCloseTo(bill.total, 10);
  });

  it('splitEvenly with a discount: splits billData.total, not the component sum', () => {
    // AI-scanned receipt: items $90, tax $10, $10 discount → total $90.
    // Users are shown and agree to $90; each of 2 people owes $45 —
    // not (90 + 10) / 2 = $50.
    const discountedBill: BillData = {
      items: [{ id: 'x', name: 'Feast', price: 90 }],
      subtotal: 90,
      tax: 10,
      tip: 0,
      otherFees: 0,
      total: 90,
    };
    const totals = computeBillPersonTotals(discountedBill, people.slice(0, 2), {}, true);
    expect(totals).toHaveLength(2);
    expect(totals[0].total).toBeCloseTo(45, 10);
    expect(totals[1].total).toBeCloseTo(45, 10);
    expect(totals[0].total + totals[1].total).toBeCloseTo(90, 10);
  });

  // Phase 2.1 — a bill with NO items distributes NO money, regardless of
  // splitEvenly. This used to return total/n cent-exact shares, which
  // contradicted every other layer: the ledger (`computable` in
  // ledgerProcessor / reconcileLedger.ts:330), reconcileBalances.ts:150 and
  // eventBalanceCalculator.ts:36 all SKIP a no-items bill outright. The old
  // behaviour meant the UI displayed amounts and built Venmo charges for money
  // the ledger would never record. One rule now, everywhere: no items → no money.
  // (Cent-exact distribution still applies where it is actually reachable — the
  // discount branch above, where items exist but disagree with the total.)
  it('splitEvenly with no items: distributes nothing', () => {
    const emptyBill: BillData = {
      items: [],
      subtotal: 0,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: 100.01,
    };
    const totals = computeBillPersonTotals(emptyBill, people.slice(0, 2), {}, true);
    // Shape matches the itemized no-items path (people, all zero) so UI lists
    // that map over the result still render every person.
    expect(totals).toHaveLength(2);
    expect(totals[0].total).toBe(0);
    expect(totals[1].total).toBe(0);
    expect(totals.reduce((s, t) => s + t.total, 0)).toBe(0);
  });

  it('splitEvenly with no items: agrees with the itemized path on the same bill', () => {
    // The contradiction 2.1 resolves — both paths must answer identically.
    const emptyBill: BillData = {
      items: [],
      subtotal: 0,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: 100.01,
    };
    const evenly = computeBillPersonTotals(emptyBill, people.slice(0, 2), {}, true);
    const itemized = computeBillPersonTotals(emptyBill, people.slice(0, 2), {}, false);
    expect(evenly).toEqual(itemized);
  });

  it('itemized: delegates to calculatePersonTotals with the given assignments', () => {
    const assignments = { a: ['p1'], b: ['p2', 'p3'] };
    const expected = calculatePersonTotals(
      bill,
      people,
      assignments,
      bill.tip,
      bill.tax,
      bill.otherFees,
    );
    expect(computeBillPersonTotals(bill, people, assignments, false)).toEqual(expected);
  });

  it('tolerates missing tax/tip/otherFees fields on billData', () => {
    const sparseBill = {
      items: [{ id: 'a', name: 'Pizza', price: 20 }],
      subtotal: 20,
      total: 20,
    } as unknown as BillData;
    const totals = computeBillPersonTotals(sparseBill, people.slice(0, 2), {}, true);
    expect(totals.reduce((s, t) => s + t.total, 0)).toBeCloseTo(20, 10);
  });

  it('returns [] for null billData or no people', () => {
    expect(computeBillPersonTotals(null, people, {}, true)).toEqual([]);
    expect(computeBillPersonTotals(bill, [], {}, false)).toEqual([]);
  });
});
