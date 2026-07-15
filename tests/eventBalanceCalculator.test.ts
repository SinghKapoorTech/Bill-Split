import { describe, it, expect } from 'vitest';
import { computeEventBalances } from '@/utils/eventBalanceCalculator';
import type { Bill } from '@/types/bill.types';

/** Minimal Bill-shaped object for the pure calculator. */
function makeBill(overrides: Record<string, unknown>): Bill {
  return {
    id: 'bill-1',
    billType: 'event',
    ownerId: 'alice',
    people: [
      { id: 'user-alice', name: 'Alice' },
      { id: 'user-bob', name: 'Bob' },
    ],
    itemAssignments: {},
    splitEvenly: true,
    ...overrides,
  } as unknown as Bill;
}

describe('computeEventBalances', () => {
  it('splitEvenly bill: each non-payer owes the creditor their share incl. tax/tip', () => {
    // $30 items + $3 tax, split 2 ways → $16.50 each; Bob owes Alice $16.50.
    const bill = makeBill({
      billData: { items: [{ id: 'x', name: 'Dinner', price: 30 }], subtotal: 30, tax: 3, tip: 0, otherFees: 0, total: 33 },
    });

    const { netBalances, optimizedDebts } = computeEventBalances([bill]);
    expect(optimizedDebts).toEqual([{ fromUserId: 'bob', toUserId: 'alice', amount: 16.5 }]);
    expect(netBalances.bob).toBeCloseTo(-16.5, 2);
    expect(netBalances.alice).toBeCloseTo(16.5, 2);
  });

  it('itemized bill: debts follow item assignments proportionally', () => {
    // Bob has the $20 pizza only; $10 soda is Alice's. Tax $3 → Bob's share 2/3 of tax = $2.
    const bill = makeBill({
      splitEvenly: false,
      itemAssignments: { pizza: ['user-bob'], soda: ['user-alice'] },
      billData: {
        items: [
          { id: 'pizza', name: 'Pizza', price: 20 },
          { id: 'soda', name: 'Soda', price: 10 },
        ],
        subtotal: 30, tax: 3, tip: 0, otherFees: 0, total: 33,
      },
    });

    const { optimizedDebts } = computeEventBalances([bill]);
    expect(optimizedDebts).toEqual([{ fromUserId: 'bob', toUserId: 'alice', amount: 22 }]);
  });

  it('nets debts across bills when both parties paid for something', () => {
    // Bill 1: Alice paid $33 → Bob owes 16.50. Bill 2: Bob paid $20 → Alice owes 10.
    const bill1 = makeBill({
      billData: { items: [{ id: 'x', name: 'Dinner', price: 30 }], subtotal: 30, tax: 3, tip: 0, otherFees: 0, total: 33 },
    });
    const bill2 = makeBill({
      id: 'bill-2',
      ownerId: 'bob',
      billData: { items: [{ id: 'y', name: 'Drinks', price: 20 }], subtotal: 20, tax: 0, tip: 0, otherFees: 0, total: 20 },
    });

    const { optimizedDebts } = computeEventBalances([bill1, bill2]);
    expect(optimizedDebts).toEqual([{ fromUserId: 'bob', toUserId: 'alice', amount: 6.5 }]);
  });

  it('excludes settled people', () => {
    const bill = makeBill({
      settledPersonIds: ['user-bob'],
      billData: { items: [{ id: 'x', name: 'Dinner', price: 30 }], subtotal: 30, tax: 0, tip: 0, otherFees: 0, total: 30 },
    });

    const { optimizedDebts } = computeEventBalances([bill]);
    expect(optimizedDebts).toEqual([]);
  });

  it('anchors on paidById when set, not the owner', () => {
    // Alice owns the bill but Bob paid → Alice owes Bob.
    const bill = makeBill({
      paidById: 'user-bob',
      billData: { items: [{ id: 'x', name: 'Dinner', price: 30 }], subtotal: 30, tax: 0, tip: 0, otherFees: 0, total: 30 },
    });

    const { optimizedDebts } = computeEventBalances([bill]);
    expect(optimizedDebts).toEqual([{ fromUserId: 'alice', toUserId: 'bob', amount: 15 }]);
  });

  it('skips bills with no items', () => {
    const bill = makeBill({
      billData: { items: [], subtotal: 0, tax: 0, tip: 0, otherFees: 0, total: 100 },
    });
    expect(computeEventBalances([bill]).optimizedDebts).toEqual([]);
  });
});
