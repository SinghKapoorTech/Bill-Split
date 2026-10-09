/**
 * The ledger's money-invariant BACKSTOP
 * (docs/plans/bill-money-invariants.md section 3).
 *
 * `billService.updateBill` validates too, but it is a convenience layer. This
 * is the only enforcement point that sees EVERY writer:
 *   - Admin SDK (`claimShadowUser`, `reassignOwnedBills`, recurring generator)
 *   - an UNAUTHENTICATED holder of a 6-char share code, who per
 *     firestore.rules:342 + :178-181 can replace `people`/`itemAssignments`
 *     and flip `splitEvenly` with a direct `updateDoc`
 *   - any future caller that bypasses the service
 *
 * These tests write bill documents DIRECTLY with the Admin SDK — i.e. they
 * bypass `billService` exactly the way the paths above do — and assert the
 * ledger's behaviour.
 *
 * Two behaviours are load-bearing and pull in opposite directions, which is
 * why they both get a test:
 *   1. An inconsistent bill must NOT be computed (money leaks if it is).
 *   2. An EMPTIED bill must still be torn down (real debt is stranded if it
 *      isn't — the scheduled reconciler is report-only and never repairs).
 * A naive "bail on anything suspicious" satisfies 1 and breaks 2.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill } from './helpers/builders';
import { writeBill, updateBill, deleteBill } from './helpers/triggerLoop';

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = 'alice_bob';

const cleanBill = (overrides: Partial<Parameters<typeof makeBill>[0]> = {}) =>
  makeBill({
    ownerId: ALICE,
    people: [
      { uid: ALICE, name: 'Alice' },
      { uid: BOB, name: 'Bob' },
    ],
    items: [{ name: 'Pizza', price: 20 }],
    itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
    tax: 2,
    tip: 2,
    ...overrides,
  });

const getBalance = async (id: string) => {
  const snap = await db.collection('balances').doc(id).get();
  return snap.exists ? snap.data()! : null;
};
const getBill = async (id: string) => (await db.collection('bills').doc(id).get()).data()!;

describe('ledger money-invariant backstop', () => {
  beforeEach(clearFirestore);

  it('processes a clean bill normally (the gate is not just "off")', async () => {
    await writeBill('bill-1', cleanBill());

    const bal = await getBalance(PAIR_ID);
    expect(bal).not.toBeNull();
    expect(bal!.balance).toBeCloseTo(12, 2);
  });

  describe('I1 — a ghost assignee must not be computed', () => {
    it('refuses a bill whose assignee is not in people', async () => {
      // The ghost takes 1/3 of the $20 item in the divisor and then has it
      // discarded, so computing this charges ~$6.67 to nobody.
      await writeBill(
        'bill-1',
        cleanBill({
          itemAssignments: { 'item-1': ['user-alice', 'user-bob', 'user-ghost'] },
        }),
      );

      expect(await getBalance(PAIR_ID)).toBeNull();
      const bill = await getBill('bill-1');
      expect(bill.processedBalances ?? {}).toEqual({});
    });

    it('RETAINS the last-known-good footprint when a bill becomes inconsistent', async () => {
      // This is the whole point of bailing rather than tearing down: a bad
      // edit must not destroy debt that was correctly recorded earlier.
      await writeBill('bill-1', cleanBill());
      const before = await getBalance(PAIR_ID);
      expect(before!.balance).toBeCloseTo(12, 2);

      await updateBill('bill-1', {
        itemAssignments: { 'item-1': ['user-alice', 'user-bob', 'user-ghost'] },
      });

      const after = await getBalance(PAIR_ID);
      expect(after!.balance).toBeCloseTo(12, 2); // unchanged, not zeroed
    });

    it('recovers on the next valid edit', async () => {
      await writeBill('bill-1', cleanBill());
      await updateBill('bill-1', {
        itemAssignments: { 'item-1': ['user-alice', 'user-bob', 'user-ghost'] },
      });
      // Ghost removed; the bill is consistent again.
      await updateBill('bill-1', {
        itemAssignments: { 'item-1': ['user-alice'] },
      });

      const bal = await getBalance(PAIR_ID);
      // Alice now holds the whole bill, so Bob owes nothing.
      expect(Math.abs(bal!.balance)).toBeLessThan(0.01);
    });
  });

  describe('I3 — a payer who is not a participant inverts every debt', () => {
    // NOTE on test shape: asserting "no balance doc" is VACUOUS here. A
    // non-participant anchor also produces no writable pair, so the assertion
    // holds whether the backstop bailed or the ledger simply computed nothing
    // — mutation testing proved it (disabling the bail left it green). The
    // only assertion that distinguishes the two is starting from a VALID bill
    // and requiring the existing balance to survive the bad edit.
    it('refuses the edit and keeps the previous balance intact', async () => {
      await writeBill('bill-1', cleanBill());
      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);

      await updateBill('bill-1', { paidById: 'someone-else-entirely' });

      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);
    });
  });

  describe('I7 / I8 — a basis that collects nothing', () => {
    it('refuses a zero total under splitEvenly, keeping the previous balance', async () => {
      // validateBillAmounts PASSES this (0 is a valid non-negative) and then
      // every person owes $0 and the footprint is reversed — i.e. without the
      // backstop this silently destroys the debt. So the assertion must be
      // "the balance survived", not "no doc exists".
      await writeBill('bill-1', cleanBill());
      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);

      const doc = cleanBill({ splitEvenly: true, tax: 0, tip: 0 });
      doc.billData = { ...(doc.billData as object), total: 0 };
      await updateBill('bill-1', { billData: doc.billData, splitEvenly: true });

      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);
    });

    it('refuses a zero-price basis, keeping the previous balance', async () => {
      await writeBill('bill-1', cleanBill());
      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);

      const degenerate = cleanBill({
        items: [
          { name: 'a', price: 20 },
          { name: 'b', price: -20 },
        ],
        itemAssignments: {
          'item-1': ['user-alice', 'user-bob'],
          'item-2': ['user-alice', 'user-bob'],
        },
        tax: 3,
        tip: 2,
      });
      await updateBill('bill-1', {
        billData: degenerate.billData,
        itemAssignments: degenerate.itemAssignments,
      });

      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);
    });
  });

  describe('the opposite requirement: teardown must NOT be blocked', () => {
    it('still tears down an EMPTIED bill', async () => {
      // Real debt would be stranded forever otherwise — the reconciler is
      // report-only. The backstop is skipped for `isIncomplete`.
      await writeBill('bill-1', cleanBill());
      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);

      await updateBill('bill-1', { people: [], itemAssignments: {} });

      const bal = await getBalance(PAIR_ID);
      expect(Math.abs(bal!.balance)).toBeLessThan(0.01);
    });

    it('still tears down a bill emptied of ITEMS while people remain', async () => {
      // This is the case that makes the `!isIncomplete` guard load-bearing,
      // and my first version of this suite missed it: removing the guard left
      // every test green, because an emptied-of-PEOPLE bill short-circuits the
      // checker (no people, nothing to be inconsistent with).
      //
      // Here `people` survives and stale `itemAssignments` remain, so items
      // sum to 0 with assignees present — I8 fires. Without the guard the
      // backstop would bail on a bill that still owes the ledger a reversal,
      // and the debt would be stranded forever (the reconciler is
      // report-only).
      await writeBill('bill-1', cleanBill());
      expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(12, 2);

      await updateBill('bill-1', {
        billData: {
          items: [],
          subtotal: 0,
          tax: 0,
          tip: 0,
          total: 0,
          restaurantName: 'Test Diner',
        },
      });

      const bal = await getBalance(PAIR_ID);
      expect(Math.abs(bal!.balance)).toBeLessThan(0.01);
    });

    it('still reverses on DELETE', async () => {
      await writeBill('bill-1', cleanBill());
      await deleteBill('bill-1');

      const bal = await getBalance(PAIR_ID);
      expect(Math.abs(bal?.balance ?? 0)).toBeLessThan(0.01);
    });
  });

  describe('I4 is logged but NOT fatal', () => {
    it('still processes a bill whose settledPersonIds has a stray id', async () => {
      // The known `claimShadowUser` id-form bug mis-records settledness but
      // does not make this computation wrong. Bailing would block legitimate
      // processing for every bill that hit it.
      await writeBill('bill-1', cleanBill({ settledPersonIds: ['a-stray-id-not-on-the-bill'] }));

      const bal = await getBalance(PAIR_ID);
      expect(bal).not.toBeNull();
      expect(bal!.balance).toBeCloseTo(12, 2);
    });
  });
});
