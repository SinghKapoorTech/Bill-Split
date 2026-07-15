import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeUser } from './helpers/builders';
import { writeBill, updateUser, withBillTriggers } from './helpers/triggerLoop';
import { generateDueRecurringBills } from '../../functions/src/recurringBillProcessor';

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = 'alice_bob';

async function getBalance() {
  const snap = await db.collection('balances').doc(PAIR_ID).get();
  return snap.exists ? snap.data()! : null;
}

describe('recurring bill generation', () => {
  beforeEach(clearFirestore);

  const template = {
    id: 'rec1',
    ownerId: ALICE,
    ownerName: 'Alice',
    title: 'Rent',
    amount: 100,
    paidById: ALICE,
    people: [
      { id: `user-${ALICE}`, name: 'Alice' },
      { id: `user-${BOB}`, name: 'Bob' },
    ],
    splitEvenly: true,
    schedule: { frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' },
    status: 'active',
    nextRunDate: '2026-07-01',
    lastRunDate: '2026-06-01',
    generatedBillIds: [],
  };

  it('generates a due bill and the pipeline picks it up', async () => {
    await db.collection('recurring_bills').doc('rec1').set(template);

    const result = await withBillTriggers(() => generateDueRecurringBills(db, '2026-07-01'));
    expect(result.created).toBe(1);

    const bills = await db.collection('bills')
      .where('recurringBillId', '==', 'rec1').get();
    expect(bills.size).toBe(1);

    // $100 split evenly between 2 → Bob owes Alice 50
    const bal = await getBalance();
    expect(bal!.balance).toBeCloseTo(50, 2);
  });

  it('running the same generation pass twice is idempotent', async () => {
    await db.collection('recurring_bills').doc('rec1').set(template);

    await withBillTriggers(() => generateDueRecurringBills(db, '2026-07-01'));
    const second = await withBillTriggers(() => generateDueRecurringBills(db, '2026-07-01'));
    expect(second.created).toBe(0);

    const bills = await db.collection('bills')
      .where('recurringBillId', '==', 'rec1').get();
    expect(bills.size).toBe(1);

    const bal = await getBalance();
    expect(bal!.balance).toBeCloseTo(50, 2);              // not 100
  });
});

describe('friend-add retroactive scan', () => {
  beforeEach(clearFirestore);

  async function seedSharedBill() {
    await db.collection('users').doc(ALICE).set(makeUser({ friends: [] }));
    await writeBill('bill-1', makeBill({
      ownerId: ALICE,
      people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
      items: [{ name: 'Pizza', price: 24 }],
      itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
    }));
    expect((await getBalance())!.balance).toBeCloseTo(12, 2);
  }

  it('adding a friend touches shared bills and re-processes them idempotently', async () => {
    await seedSharedBill();

    await updateUser(ALICE, { friends: [BOB] });

    const bill = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(bill._friendScanTrigger).toBeDefined();        // scan touched the bill

    const bal = await getBalance();
    expect(bal!.balance).toBeCloseTo(12, 2);              // no double-count
    expect(bal!.unsettledBillIds).toEqual(['bill-1']);
  });

  it('a user update that adds no friends touches nothing', async () => {
    await seedSharedBill();
    const before = (await db.collection('bills').doc('bill-1').get()).updateTime;

    await updateUser(ALICE, { venmoId: 'alice-venmo' });

    const after = (await db.collection('bills').doc('bill-1').get()).updateTime;
    expect(after!.isEqual(before!)).toBe(true);           // bill untouched
    expect((await getBalance())!.balance).toBeCloseTo(12, 2);
  });
});
