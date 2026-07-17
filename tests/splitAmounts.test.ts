import { describe, it, expect } from 'vitest';
import {
  roundCents,
  distributeEvenly,
  resolveSplitAmounts,
  isSplitConfigValid,
  buildPerPersonShareItems,
} from '@shared/splitAmounts';

const people = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Cara' },
];

describe('roundCents', () => {
  it('rounds to two decimals', () => {
    expect(roundCents(33.333333)).toBe(33.33);
    expect(roundCents(33.335)).toBe(33.34);
    expect(roundCents(50.005)).toBe(50.01);
  });
});

describe('distributeEvenly', () => {
  it('gives the last share the rounding remainder so shares sum exactly', () => {
    expect(distributeEvenly(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(distributeEvenly(100.01, 2)).toEqual([50.01, 50]);
    expect(distributeEvenly(20, 4)).toEqual([5, 5, 5, 5]);
  });

  it('always sums exactly to the total', () => {
    for (const [total, count] of [[100.01, 2], [10, 3], [0.05, 4], [99.99, 7]] as const) {
      const shares = distributeEvenly(total, count);
      expect(shares).toHaveLength(count);
      expect(roundCents(shares.reduce((s, v) => s + v, 0))).toBeCloseTo(total, 10);
    }
  });

  it('returns [] for zero or negative count', () => {
    expect(distributeEvenly(100, 0)).toEqual([]);
    expect(distributeEvenly(100, -1)).toEqual([]);
  });
});

describe('resolveSplitAmounts', () => {
  it('equal: distributes evenly with the last person absorbing the remainder', () => {
    expect(resolveSplitAmounts(100, people, 'equal')).toEqual({
      p1: 33.33, p2: 33.33, p3: 33.34,
    });
  });

  it('percentage: rounds each share, last person gets amount minus the others', () => {
    const amounts = resolveSplitAmounts(100, people, 'percentage', {
      p1: 33.33, p2: 33.33, p3: 33.34,
    });
    expect(amounts.p1).toBe(33.33);
    expect(amounts.p2).toBe(33.33);
    expect(amounts.p3).toBe(33.34);
    expect(roundCents(amounts.p1 + amounts.p2 + amounts.p3)).toBe(100);
  });

  it('percentage: sums exactly even when rounded shares would drift', () => {
    // 3 × 33.333% of $100 rounds to 33.33 each (99.99) — last absorbs the cent.
    const amounts = resolveSplitAmounts(100, people, 'percentage', {
      p1: 33.333, p2: 33.333, p3: 33.334,
    });
    expect(roundCents(amounts.p1 + amounts.p2 + amounts.p3)).toBe(100);
    expect(amounts.p3).toBe(33.34);
  });

  it('exact: every person gets exactly what they typed — never silently altered', () => {
    // The typed amounts ARE the agreement; validation guarantees they sum.
    const amounts = resolveSplitAmounts(20.01, people.slice(0, 2), 'exact', undefined, {
      p1: 10, p2: 10.01,
    });
    expect(amounts.p1).toBe(10);
    expect(amounts.p2).toBe(10.01); // the typed value, not a forced remainder
  });

  it('exact: even an out-of-balance config is returned as typed (callers gate via isSplitConfigValid)', () => {
    const amounts = resolveSplitAmounts(20, people.slice(0, 2), 'exact', undefined, {
      p1: 10, p2: 10.01,
    });
    expect(amounts.p2).toBe(10.01); // never overridden to the remainder (10.00)
  });

  it('returns {} for empty people', () => {
    expect(resolveSplitAmounts(100, [], 'equal')).toEqual({});
  });

  it('single person gets the full amount for equal/percentage, their typed amount for exact', () => {
    const one = people.slice(0, 1);
    expect(resolveSplitAmounts(42.42, one, 'equal')).toEqual({ p1: 42.42 });
    expect(resolveSplitAmounts(42.42, one, 'percentage', { p1: 100 })).toEqual({ p1: 42.42 });
    expect(resolveSplitAmounts(42.42, one, 'exact', undefined, { p1: 42.42 })).toEqual({ p1: 42.42 });
  });
});

describe('isSplitConfigValid', () => {
  it('equal is always valid', () => {
    expect(isSplitConfigValid('equal', 100)).toBe(true);
  });

  it('percentage requires the sum to be within 0.02 of 100', () => {
    expect(isSplitConfigValid('percentage', 100, { p1: 50, p2: 50 })).toBe(true);
    expect(isSplitConfigValid('percentage', 100, { p1: 33.33, p2: 33.33, p3: 33.33 })).toBe(true);
    expect(isSplitConfigValid('percentage', 100, { p1: 60, p2: 50 })).toBe(false);
  });

  it('exact requires the amounts to sum to the total (no cent drift is tolerated)', () => {
    // A loose tolerance here is what allowed resolveSplitAmounts to silently
    // alter a typed amount: 10.00 + 10.01 must NOT validate against 20.00.
    expect(isSplitConfigValid('exact', 20, undefined, { p1: 10, p2: 10.01 })).toBe(false);
    expect(isSplitConfigValid('exact', 20.01, undefined, { p1: 10, p2: 10.01 })).toBe(true);
    expect(isSplitConfigValid('exact', 10, undefined, { p1: 5, p2: 4 })).toBe(false);
    // Float noise must still validate: 0.1 + 0.2 === 0.30000000000000004
    expect(isSplitConfigValid('exact', 0.3, undefined, { p1: 0.1, p2: 0.2 })).toBe(true);
  });
});

describe('buildPerPersonShareItems', () => {
  it('builds one "X\'s share" item per person, each assigned to that person', () => {
    const { items, itemAssignments } = buildPerPersonShareItems(people.slice(0, 2), {
      p1: 12.5, p2: 7.5,
    });
    expect(items).toEqual([
      { id: 'item-p1', name: "Alice's share", price: 12.5 },
      { id: 'item-p2', name: "Bob's share", price: 7.5 },
    ]);
    expect(itemAssignments).toEqual({ 'item-p1': ['p1'], 'item-p2': ['p2'] });
  });
});
