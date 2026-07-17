import { describe, it, expect } from 'vitest';
import { calculatePersonTotals, areAllItemsAssigned } from '@shared/calculations';
import type { BillData } from '@shared/types';

const bill: BillData = {
  items: [
    { id: 'a', name: 'Pizza', price: 20 },
    { id: 'b', name: 'Soda', price: 10 },
  ],
  subtotal: 30,
  tax: 3,
  tip: 6,
  otherFees: 0,
  total: 39,
};

const people = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
];

describe('calculatePersonTotals', () => {
  it('distributes tax/tip proportionally to each person\'s subtotal', () => {
    // Pizza ($20) → Alice only; Soda ($10) shared. Subtotals: Alice 25, Bob 5.
    const assignments = { a: ['p1'], b: ['p1', 'p2'] };
    const totals = calculatePersonTotals(bill, people, assignments, bill.tip, bill.tax, bill.otherFees);

    const alice = totals.find((t) => t.personId === 'p1')!;
    const bob = totals.find((t) => t.personId === 'p2')!;

    expect(alice.itemsSubtotal).toBeCloseTo(25, 5);
    expect(bob.itemsSubtotal).toBeCloseTo(5, 5);
    // tax 3 + tip 6 = 9 split 25:5 → Alice 7.5, Bob 1.5
    expect(alice.total).toBeCloseTo(32.5, 5);
    expect(bob.total).toBeCloseTo(6.5, 5);
    // Sum of person totals equals the bill total.
    expect(alice.total + bob.total).toBeCloseTo(bill.total, 5);
  });

  it('returns [] for null billData or no people', () => {
    expect(calculatePersonTotals(null, people, {}, 0, 0)).toEqual([]);
    expect(calculatePersonTotals(bill, [], {}, 0, 0)).toEqual([]);
  });

  it('partially-assigned bill: tax/tip share is proportional to the FULL bill, not just assigned items', () => {
    // Guest-claim regression: $100 bill ($10 claimed, $90 unclaimed), $18 tax+tip.
    // The sole claimer must owe 10 + 18 * (10/100) = 11.80 — not 10 + all $18 = 28.
    const partialBill: BillData = {
      items: [
        { id: 'mine', name: 'Salad', price: 10 },
        { id: 'rest', name: 'Steak', price: 90 },
      ],
      subtotal: 100,
      tax: 8,
      tip: 10,
      otherFees: 0,
      total: 118,
    };
    const totals = calculatePersonTotals(partialBill, people, { mine: ['p1'] }, partialBill.tip, partialBill.tax, 0);

    const alice = totals.find((t) => t.personId === 'p1')!;
    const bob = totals.find((t) => t.personId === 'p2')!;

    expect(alice.itemsSubtotal).toBeCloseTo(10, 5);
    expect(alice.tax).toBeCloseTo(0.8, 5);
    expect(alice.tip).toBeCloseTo(1, 5);
    expect(alice.total).toBeCloseTo(11.8, 5);
    expect(bob.total).toBeCloseTo(0, 5);
  });
});

describe('areAllItemsAssigned', () => {
  it('is true only when every item has at least one assignee', () => {
    expect(areAllItemsAssigned(bill, { a: ['p1'], b: ['p2'] })).toBe(true);
    expect(areAllItemsAssigned(bill, { a: ['p1'], b: [] })).toBe(false);
    expect(areAllItemsAssigned(bill, { a: ['p1'] })).toBe(false);
  });
});
