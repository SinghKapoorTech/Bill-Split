import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { makeBill } from './helpers/builders';
import { writeBill, updateBill, deleteBill } from './helpers/triggerLoop';

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = 'alice_bob'; // getFriendBalanceId(alice, bob)

function standardBill(overrides: Partial<Parameters<typeof makeBill>[0]> = {}) {
  return makeBill({
    ownerId: ALICE,
    people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
    items: [{ name: 'Pizza', price: 20 }],
    itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
    tax: 2,
    tip: 2,
    ...overrides,
  });
}

async function getBalance(id: string) {
  const snap = await db.collection('balances').doc(id).get();
  return snap.exists ? snap.data()! : null;
}

async function getBill(id: string) {
  return (await db.collection('bills').doc(id).get()).data()!;
}

describe('ledger pipeline — core flows', () => {
  beforeEach(clearFirestore);

  it('bill create writes the friend balance and footprint', async () => {
    await writeBill('bill-1', standardBill());

    const bal = await getBalance(PAIR_ID);
    expect(bal).not.toBeNull();
    expect(bal!.participants).toEqual(['alice', 'bob']);
    expect(bal!.balance).toBeCloseTo(12, 2);            // Bob owes Alice 12
    expect(bal!.unsettledBillIds).toContain('bill-1');

    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [BOB]: expect.closeTo(12, 2) });
    expect(bill._ledgerVersion).toBeGreaterThanOrEqual(1);
  });

  it('re-processing an unchanged bill does not double-count (idempotent delta)', async () => {
    await writeBill('bill-1', standardBill());
    // _friendScanTrigger IS a relevant field → forces a full pipeline re-run
    await updateBill('bill-1', { _friendScanTrigger: Timestamp.now() });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(12, 2);
    expect(bal!.unsettledBillIds).toEqual(['bill-1']);
  });

  it('editing an item price applies the delta exactly once', async () => {
    await writeBill('bill-1', standardBill());
    // Pizza 20 → 30: subtotal 30, total 34; each share 15 + 1 tax + 1 tip = 17
    await updateBill('bill-1', {
      billData: {
        items: [{ id: 'item-1', name: 'Pizza', price: 30 }],
        subtotal: 30,
        tax: 2,
        tip: 2,
        total: 34,
        restaurantName: 'Test Diner',
      },
    });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(17, 2);
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [BOB]: expect.closeTo(17, 2) });
  });

  it('changing paidById reverses the old anchor and applies the new one', async () => {
    await writeBill('bill-1', standardBill());          // Alice creditor: +12
    await updateBill('bill-1', { paidById: BOB });      // now Alice owes Bob 12

    const bal = await getBalance(PAIR_ID);
    // anchor bob, debtor alice → toSingleBalance('bob','alice',12) = -12
    expect(bal!.balance).toBeCloseTo(-12, 2);
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [ALICE]: expect.closeTo(12, 2) });
  });

  it('deleting a bill reverses its footprint to zero', async () => {
    await writeBill('bill-1', standardBill());
    await deleteBill('bill-1');

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(0, 2);
    expect(bal!.unsettledBillIds).not.toContain('bill-1');
  });

  it('marking the debtor settled flows through to a zero balance', async () => {
    await writeBill('bill-1', standardBill());
    await updateBill('bill-1', { settledPersonIds: ['user-bob'] });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(0, 2);
    expect(bal!.unsettledBillIds).not.toContain('bill-1');
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({});          // stripZeros removed bob
  });

  it('unlinked guests are excluded from balances', async () => {
    await writeBill('bill-1', makeBill({
      ownerId: ALICE,
      people: [
        { uid: ALICE, name: 'Alice' },
        { uid: BOB, name: 'Bob' },
        { name: 'Carol' },                               // guest: person-carol
      ],
      items: [{ name: 'Sushi', price: 30 }],
      itemAssignments: { 'item-1': ['user-alice', 'user-bob', 'person-carol'] },
    }));

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(10, 2);             // only Bob's 30/3 share
    const bill = await getBill('bill-1');
    expect(Object.keys(bill.processedBalances)).toEqual([BOB]); // no carol entry
  });
});
