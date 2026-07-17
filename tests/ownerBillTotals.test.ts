import { describe, it, expect } from 'vitest';
import { selectOwnerPersonTotals } from '@/utils/ownerBillTotals';
import type { BillData } from '@shared/types';

const people = [
  { id: 'user-a', name: 'A' },
  { id: 'user-b', name: 'B' },
];

describe('selectOwnerPersonTotals', () => {
  it('splitEvenly discount bill charges billData.total, matching the ledger (not the component sum)', () => {
    // AI-scanned receipt: items $90 + tax $10, declared total $90 (a receipt
    // discount). The user agreed to $90. The owner UI/Venmo must charge $45
    // each — the SAME amount the ledger pipeline records via
    // computeBillPersonTotals — NOT (90 + 10) / 2 = $50.
    const bill: BillData = {
      items: [{ id: 'x', name: 'Feast', price: 90 }],
      subtotal: 90, tax: 10, tip: 0, otherFees: 0, total: 90,
    };
    const totals = selectOwnerPersonTotals(bill, people, {}, true, true);
    expect(totals).toHaveLength(2);
    expect(totals[0].total).toBeCloseTo(45, 10);
    expect(totals[1].total).toBeCloseTo(45, 10);
    expect(totals[0].total + totals[1].total).toBeCloseTo(90, 10);
  });

  it('normal splitEvenly bill (no discount) is unchanged — tax/tip distributed, sums to total', () => {
    const bill: BillData = {
      items: [{ id: 'x', name: 'Pizza', price: 30 }],
      subtotal: 30, tax: 3, tip: 6, otherFees: 0, total: 39,
    };
    const totals = selectOwnerPersonTotals(bill, people, {}, true, true);
    expect(totals[0].total + totals[1].total).toBeCloseTo(39, 10);
    expect(totals[0].tax).toBeCloseTo(1.5, 10);
  });

  it('itemized split delegates to the assignment-based calculation', () => {
    const bill: BillData = {
      items: [
        { id: 'a', name: 'Steak', price: 40 },
        { id: 'b', name: 'Salad', price: 10 },
      ],
      subtotal: 50, tax: 0, tip: 0, otherFees: 0, total: 50,
    };
    const assignments = { a: ['user-a'], b: ['user-b'] };
    const totals = selectOwnerPersonTotals(bill, people, assignments, false, true);
    const a = totals.find(t => t.personId === 'user-a')!;
    const b = totals.find(t => t.personId === 'user-b')!;
    expect(a.total).toBeCloseTo(40, 10);
    expect(b.total).toBeCloseTo(10, 10);
  });

  it('returns [] until every item is assigned (itemized bill mid-assignment)', () => {
    const bill: BillData = {
      items: [{ id: 'x', name: 'X', price: 10 }],
      subtotal: 10, tax: 0, tip: 0, otherFees: 0, total: 10,
    };
    expect(selectOwnerPersonTotals(bill, people, {}, false, false)).toEqual([]);
  });
});
