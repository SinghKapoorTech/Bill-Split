/**
 * `purgePersonFromAssignments` and the GHOST-ASSIGNEE money leak.
 *
 * Why this matters more than it looks: `people` and `itemAssignments` are two
 * independent whole-value fields on a bill, and `calculatePersonTotals`
 * divides each item by the RAW length of its assignee list before discarding
 * shares belonging to anyone absent from `people`:
 *
 *     const splitPrice = item.price / assignedPeople.length;   // raw length
 *     assignedPeople.forEach((personId) => {
 *       if (personSubtotals[personId] !== undefined) { ... }   // ghost dropped
 *     });
 *
 * So a person removed from `people` but left in `itemAssignments` silently
 * takes a share of every item they were on and that share is charged to NOBODY.
 * The remaining people's totals are unchanged, the bill under-collects, and the
 * payer absorbs the difference. Nothing in the UI shows it, because the wizard
 * renders local state where the removal already happened.
 *
 * These tests assert both halves: the pure purge, and the arithmetic claim it
 * exists to prevent (verified against the real `calculatePersonTotals`, so the
 * test fails if that function's behaviour ever changes).
 */
import { describe, it, expect } from 'vitest';
import { purgePersonFromAssignments } from '@/utils/peopleMerge';
import { calculatePersonTotals } from '@shared/calculations';
import type { ItemAssignment, Person } from '@/types';

const alice: Person = { id: 'user-alice', name: 'Alice' };
const bob: Person = { id: 'user-bob', name: 'Bob' };
const ghost: Person = { id: 'user-ghost', name: 'Ghost' };

describe('purgePersonFromAssignments', () => {
  it('removes the person from every item', () => {
    const before: ItemAssignment = {
      'item-1': ['user-alice', 'user-ghost'],
      'item-2': ['user-ghost'],
      'item-3': ['user-bob'],
    };

    expect(purgePersonFromAssignments(before, 'user-ghost')).toEqual({
      'item-1': ['user-alice'],
      'item-2': [],
      'item-3': ['user-bob'],
    });
  });

  it('keeps an emptied item as an empty list rather than deleting the key', () => {
    // A missing key and an empty list are not the same thing downstream: a
    // deleted key is indistinguishable from an item nobody has claimed yet.
    const out = purgePersonFromAssignments({ 'item-1': ['user-ghost'] }, 'user-ghost');

    expect(Object.keys(out)).toEqual(['item-1']);
    expect(out['item-1']).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before: ItemAssignment = { 'item-1': ['user-alice', 'user-ghost'] };
    purgePersonFromAssignments(before, 'user-ghost');

    expect(before['item-1']).toEqual(['user-alice', 'user-ghost']);
  });

  it('is a no-op for someone who was never assigned', () => {
    const before: ItemAssignment = { 'item-1': ['user-alice'] };

    expect(purgePersonFromAssignments(before, 'user-nobody')).toEqual(before);
  });

  it('survives a malformed/absent assignee list', () => {
    const before = { 'item-1': undefined } as unknown as ItemAssignment;

    expect(purgePersonFromAssignments(before, 'user-ghost')).toEqual({ 'item-1': [] });
  });
});

describe('the leak this prevents, measured against the real calculator', () => {
  const billData = {
    items: [{ id: 'item-1', name: 'Shared platter', price: 30 }],
    subtotal: 30,
    tax: 0,
    tip: 0,
    otherFees: 0,
    total: 30,
  };

  it("charges a ghost assignee's share to NOBODY", () => {
    // Ghost was removed from `people` but left in `itemAssignments`.
    const totals = calculatePersonTotals(
      billData,
      [alice, bob],
      { 'item-1': [alice.id, bob.id, ghost.id] },
      billData.tip,
      billData.tax,
      billData.otherFees,
    );

    const collected = totals.reduce((sum, t) => sum + t.total, 0);

    // $30 item split three ways, but only two of the three are billed.
    expect(totals.map((t) => t.total)).toEqual([10, 10]);
    expect(collected).toBe(20);
    // The missing $10 is the leak. The payer absorbs it.
    expect(billData.total - collected).toBe(10);
  });

  it('collects the full amount once the assignments are purged', () => {
    const purged = purgePersonFromAssignments({ 'item-1': [alice.id, bob.id, ghost.id] }, ghost.id);

    const totals = calculatePersonTotals(
      billData,
      [alice, bob],
      purged,
      billData.tip,
      billData.tax,
      billData.otherFees,
    );
    const collected = totals.reduce((sum, t) => sum + t.total, 0);

    expect(totals.map((t) => t.total)).toEqual([15, 15]);
    expect(collected).toBe(30);
    expect(billData.total - collected).toBe(0);
  });

  it('under-collects tax and tip too, not just the item', () => {
    const withTaxTip = { ...billData, tax: 3, tip: 6, total: 39 };

    const leaked = calculatePersonTotals(
      withTaxTip,
      [alice, bob],
      { 'item-1': [alice.id, bob.id, ghost.id] },
      withTaxTip.tip,
      withTaxTip.tax,
      withTaxTip.otherFees,
    );
    const purged = calculatePersonTotals(
      withTaxTip,
      [alice, bob],
      purgePersonFromAssignments({ 'item-1': [alice.id, bob.id, ghost.id] }, ghost.id),
      withTaxTip.tip,
      withTaxTip.tax,
      withTaxTip.otherFees,
    );

    const sum = (ts: typeof leaked) => ts.reduce((s, t) => s + t.total, 0);

    // Tax/tip are shared in proportion to each person's slice of the WHOLE
    // bill, so a ghost holding 1/3 of the only item drags those down with it.
    expect(sum(leaked)).toBeCloseTo(26, 10);
    expect(sum(purged)).toBeCloseTo(39, 10);
  });
});
