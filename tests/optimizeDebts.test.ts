import { describe, it, expect } from 'vitest';
import { optimizeDebts, simplifyDebts, OptimizedDebt } from '@shared/optimizeDebts';

const sumBy = (debts: OptimizedDebt[], key: 'fromUserId' | 'toUserId', id: string) =>
  debts.filter(d => d[key] === id).reduce((s, d) => s + d.amount, 0);

describe('optimizeDebts (net-balance greedy)', () => {
  it('settles a simple two-party balance with one transaction', () => {
    expect(optimizeDebts({ alice: 25, bob: -25 })).toEqual([
      { fromUserId: 'bob', toUserId: 'alice', amount: 25 },
    ]);
  });

  it('minimizes transactions for multiple parties', () => {
    // cara owes 30 total; alice is owed 20, bob is owed 10 → 2 transactions.
    const debts = optimizeDebts({ alice: 20, bob: 10, cara: -30 });
    expect(debts).toHaveLength(2);
    expect(sumBy(debts, 'fromUserId', 'cara')).toBeCloseTo(30, 2);
    expect(sumBy(debts, 'toUserId', 'alice')).toBeCloseTo(20, 2);
    expect(sumBy(debts, 'toUserId', 'bob')).toBeCloseTo(10, 2);
  });

  it('conserves money: total paid equals total received', () => {
    const debts = optimizeDebts({ a: 12.34, b: -5.67, c: -6.67, d: 0 });
    const paid = debts.reduce((s, d) => s + d.amount, 0);
    expect(paid).toBeCloseTo(12.34, 2);
  });

  it('ignores near-zero balances', () => {
    expect(optimizeDebts({ alice: 0.005, bob: -0.005 })).toEqual([]);
  });
});

describe('simplifyDebts (cycle elimination)', () => {
  it('nets opposing debts between the same pair', () => {
    const result = simplifyDebts([
      { fromUserId: 'bob', toUserId: 'alice', amount: 16.5 },
      { fromUserId: 'alice', toUserId: 'bob', amount: 10 },
    ]);
    expect(result).toEqual([{ fromUserId: 'bob', toUserId: 'alice', amount: 6.5 }]);
  });

  it('cancels equal opposing debts entirely', () => {
    expect(simplifyDebts([
      { fromUserId: 'a', toUserId: 'b', amount: 10 },
      { fromUserId: 'b', toUserId: 'a', amount: 10 },
    ])).toEqual([]);
  });

  it('accumulates same-direction debts', () => {
    expect(simplifyDebts([
      { fromUserId: 'a', toUserId: 'b', amount: 10 },
      { fromUserId: 'a', toUserId: 'b', amount: 5.25 },
    ])).toEqual([{ fromUserId: 'a', toUserId: 'b', amount: 15.25 }]);
  });

  it('eliminates a three-way cycle by its minimum edge', () => {
    // a→b 10, b→c 7, c→a 5: subtracting the min (5) leaves a→b 5, b→c 2.
    const result = simplifyDebts([
      { fromUserId: 'a', toUserId: 'b', amount: 10 },
      { fromUserId: 'b', toUserId: 'c', amount: 7 },
      { fromUserId: 'c', toUserId: 'a', amount: 5 },
    ]);
    expect(result).toEqual([
      { fromUserId: 'a', toUserId: 'b', amount: 5 },
      { fromUserId: 'b', toUserId: 'c', amount: 2 },
    ]);
  });

  it('never reassigns a chain to uninvolved parties', () => {
    // a→b→c is NOT a cycle: both debts must survive as-is
    // (the greedy optimizer would collapse this to a→c, which is wrong here).
    const result = simplifyDebts([
      { fromUserId: 'a', toUserId: 'b', amount: 10 },
      { fromUserId: 'b', toUserId: 'c', amount: 10 },
    ]);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ fromUserId: 'a', toUserId: 'b', amount: 10 });
    expect(result).toContainEqual({ fromUserId: 'b', toUserId: 'c', amount: 10 });
  });

  it('drops sub-cent and self-referential debts', () => {
    expect(simplifyDebts([
      { fromUserId: 'a', toUserId: 'b', amount: 0.005 },
      { fromUserId: 'a', toUserId: 'a', amount: 50 },
    ])).toEqual([]);
  });
});
