import { describe, it, expect } from 'vitest';
import { validateAmount, validateBillAmounts, MAX_BILL_AMOUNT } from '@shared/billAmountValidation';
import { calculateFriendFootprint } from '@shared/ledgerCalculations';
import type { BillData } from '@shared/types';

const okBill: BillData = {
  items: [{ id: 'a', name: 'Pizza', price: 20 }],
  subtotal: 20,
  tax: 2,
  tip: 3,
  otherFees: 0,
  total: 25,
};

describe('validateAmount (C-01)', () => {
  it('accepts ordinary money values, including zero', () => {
    expect(validateAmount('x', 0)).toBeNull();
    expect(validateAmount('x', 12.34)).toBeNull();
    expect(validateAmount('x', MAX_BILL_AMOUNT)).toBeNull();
  });

  it.each([
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ])('rejects %s', (_label, value) => {
    expect(validateAmount('x', value)).toMatch(/finite/);
  });

  it('rejects negatives', () => {
    expect(validateAmount('x', -1)).toMatch(/negative/);
  });

  it('rejects overflow-scale magnitudes', () => {
    // Parsed at runtime rather than written as a `1e309` literal: the literal
    // trips eslint's no-loss-of-precision, and the point here is precisely that
    // an overflow-scale value becomes Infinity and is caught as non-finite.
    const overflow = Number('1e309');
    expect(overflow).toBe(Infinity); // guards the premise of the next assertion
    expect(validateAmount('x', overflow)).toMatch(/finite/);
    // 1e308 is finite but absurd and must still be rejected.
    expect(validateAmount('x', 1e308)).toMatch(/maximum/);
    expect(validateAmount('x', MAX_BILL_AMOUNT + 1)).toMatch(/maximum/);
  });

  it('rejects non-numbers, including numeric strings', () => {
    // '12.00' coerces silently in arithmetic and corrupts sums.
    expect(validateAmount('x', '12.00')).toMatch(/must be a number/);
    expect(validateAmount('x', null)).toMatch(/must be a number/);
    expect(validateAmount('x', undefined)).toMatch(/must be a number/);
  });
});

describe('validateBillAmounts (C-01)', () => {
  it('accepts a well-formed bill', () => {
    expect(validateBillAmounts(okBill)).toBeNull();
  });

  it('tolerates sparse billData (missing tax/tip/otherFees)', () => {
    // computeBillPersonTotals already handles these via `billData.tip || 0`.
    expect(validateBillAmounts({ items: [{ id: 'a', name: 'P', price: 5 }], total: 5 })).toBeNull();
  });

  it('rejects a NaN in any money field', () => {
    expect(validateBillAmounts({ ...okBill, tax: NaN })).toMatch(/tax.*finite/);
    expect(validateBillAmounts({ ...okBill, tip: NaN })).toMatch(/tip.*finite/);
    expect(validateBillAmounts({ ...okBill, total: NaN })).toMatch(/total.*finite/);
    expect(validateBillAmounts({ ...okBill, subtotal: NaN })).toMatch(/subtotal.*finite/);
  });

  it('rejects a NaN item price and names the offending index', () => {
    const bill = {
      ...okBill,
      items: [
        { id: 'a', name: 'Pizza', price: 20 },
        { id: 'b', name: 'Poison', price: NaN },
      ],
    };
    expect(validateBillAmounts(bill)).toMatch(/items\[1\]\.price.*finite/);
  });

  it('rejects Infinity item prices', () => {
    expect(
      validateBillAmounts({ ...okBill, items: [{ id: 'a', name: 'P', price: Infinity }] }),
    ).toMatch(/finite/);
  });

  /**
   * REGRESSION. An earlier revision rejected every negative item price, which
   * broke the discount case the app deliberately supports:
   *   - receiptAmounts.ts:isPersistableItemPrice — "Deliberately NOT
   *     non-negative: comped lines and discounts legitimately carry a negative
   *     price".
   *   - useReceiptAnalyzer.ts:44 filters `price !== 0`, NOT `> 0`, because
   *     dropping a discount OVER-COLLECTS.
   *   - commit 1dc5343 "stop dropping discount lines, which over-collected".
   * Any receipt with a promo line failed to save, on every retry.
   */
  it('ACCEPTS negative item prices — discounts and comped lines are legitimate', () => {
    expect(
      validateBillAmounts({ ...okBill, items: [{ id: 'a', name: 'Promo', price: -10 }] }),
    ).toBeNull();

    // The exact over-collection example from useReceiptAnalyzer's own comment.
    expect(
      validateBillAmounts({
        items: [
          { id: 'a', name: 'Burger', price: 20 },
          { id: 'b', name: 'Burger', price: 20 },
          { id: 'c', name: 'Promo', price: -10 },
        ],
        subtotal: 30,
        tax: 0,
        tip: 0,
        total: 30,
      }),
    ).toBeNull();
  });

  it('still rejects an absurd NEGATIVE magnitude on an item', () => {
    expect(
      validateBillAmounts({ ...okBill, items: [{ id: 'a', name: 'P', price: -1e9 }] }),
    ).toMatch(/magnitude/);
  });

  it('keeps aggregates strictly non-negative — a discount belongs on a line', () => {
    expect(validateBillAmounts({ ...okBill, total: -1 })).toMatch(/negative/);
    expect(validateBillAmounts({ ...okBill, subtotal: -1 })).toMatch(/negative/);
    expect(validateBillAmounts({ ...okBill, tax: -1 })).toMatch(/negative/);
  });

  it('rejects missing or non-object billData', () => {
    expect(validateBillAmounts(null)).toMatch(/missing/);
    expect(validateBillAmounts('nope')).toMatch(/missing/);
  });
});

/**
 * D-03 — `calculateFriendFootprint` used `if (amountOwed >= 0)`, which dropped
 * negative totals from the footprint entirely. On a later edit `computeDeltas`
 * sees the key vanish and reverses the prior amount, destroying value. That
 * same predicate was ALSO the only thing filtering NaN, which is why C-01 and
 * D-03 have to land together.
 */
describe('calculateFriendFootprint — finiteness, not sign (D-03)', () => {
  const base = {
    people: [
      { id: 'user-alice', name: 'Alice' },
      { id: 'user-bob', name: 'Bob' },
    ],
    settledPersonIds: [] as string[],
    linkedFriendUids: new Set(['alice', 'bob']),
    ownerId: 'alice',
    creditorId: 'alice',
  };

  it('records a negative amount instead of dropping the person', () => {
    const footprint = calculateFriendFootprint({
      ...base,
      personTotals: [
        {
          personId: 'user-bob',
          name: 'Bob',
          itemsSubtotal: -5,
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: -5,
        },
      ],
    });
    // Previously: key absent entirely → a later edit reverses the prior value.
    expect(footprint).toHaveProperty('bob');
    expect(footprint.bob).toBe(-5);
  });

  it('still records zero', () => {
    const footprint = calculateFriendFootprint({
      ...base,
      personTotals: [
        {
          personId: 'user-bob',
          name: 'Bob',
          itemsSubtotal: 0,
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: 0,
        },
      ],
    });
    expect(footprint.bob).toBe(0);
  });

  it('still excludes NaN — the guarantee C-01 now backs explicitly', () => {
    const footprint = calculateFriendFootprint({
      ...base,
      personTotals: [
        {
          personId: 'user-bob',
          name: 'Bob',
          itemsSubtotal: NaN,
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: NaN,
        },
      ],
    });
    expect(footprint).not.toHaveProperty('bob');
  });

  it('still excludes Infinity', () => {
    const footprint = calculateFriendFootprint({
      ...base,
      personTotals: [
        {
          personId: 'user-bob',
          name: 'Bob',
          itemsSubtotal: Infinity,
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: Infinity,
        },
      ],
    });
    expect(footprint).not.toHaveProperty('bob');
  });
});
