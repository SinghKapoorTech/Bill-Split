import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, withBillTriggers } from './helpers/triggerLoop';
import { processSettlementCore } from '../../functions/src/settlementProcessor';
import { processEventSettlementCore } from '../../functions/src/eventSettlementProcessor';
import { processSettlementReversalCore } from '../../functions/src/settlementReversal';

const ALICE = 'alice';
const BOB = 'bob';
const EVENT_ID = 'trip1';
const PAIR_ID = 'alice_bob';
const EVENT_PAIR_ID = 'trip1_alice_bob';

async function getDoc(col: string, id: string) {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? snap.data()! : null;
}

function bill(price: number, eventId?: string) {
  return makeBill({
    ownerId: ALICE,
    ...(eventId && { eventId }),
    people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
    items: [{ name: 'Meal', price }],
    itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
  });
}

async function seedThreeBills() {
  await db.collection('events').doc(EVENT_ID).set(makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }));
  await writeBill('b1', bill(24));            // bob owes 12
  await writeBill('b2', bill(16));            // bob owes 8
  await writeBill('b3', bill(20, EVENT_ID));  // bob owes 10
}

describe('settlement flows', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedThreeBills();
    // sanity: seed state
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(30, 2);
    expect((await getDoc('event_balances', EVENT_PAIR_ID))!.balance).toBeCloseTo(10, 2);
  });

  it('global settlement zeros the balance, records it, and flows through to event pairs', async () => {
    const result = await withBillTriggers(() =>
      processSettlementCore(ALICE, { friendUserId: BOB })
    );

    expect(result.amountSettled).toBeCloseTo(30, 2);
    expect(result.billsSettled).toBe(3);

    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(0, 2);
    expect(bal!.unsettledBillIds ?? []).toEqual([]);

    // Flow-through: pipeline re-fired from settledPersonIds → event pair zeroed
    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(0, 2);

    const settlement = await getDoc('settlements', result.settlementId);
    expect(settlement!.fromUserId).toBe(BOB);            // debtor
    expect(settlement!.toUserId).toBe(ALICE);            // creditor
    expect(settlement!.amount).toBeCloseTo(30, 2);
    expect(settlement!.settledBillIds).toEqual(expect.arrayContaining(['b1', 'b2', 'b3']));

    for (const id of ['b1', 'b2', 'b3']) {
      const b = (await db.collection('bills').doc(id).get()).data()!;
      expect(b.settledPersonIds).toContain('user-bob');
    }
  });

  it('event settlement settles only event bills and flows through to the global balance', async () => {
    const result = await withBillTriggers(() =>
      processEventSettlementCore(ALICE, { eventId: EVENT_ID, friendUserId: BOB })
    );

    expect(result.amountSettled).toBeCloseTo(10, 2);
    expect(result.billsSettled).toBe(1);

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(0, 2);

    // Flow-through reduced global by exactly the event amount: 30 - 10 = 20
    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(20, 2);
    expect(bal!.unsettledBillIds).toEqual(expect.arrayContaining(['b1', 'b2']));
    expect(bal!.unsettledBillIds).not.toContain('b3');

    // Non-event bills untouched
    const b1 = (await db.collection('bills').doc('b1').get()).data()!;
    expect(b1.settledPersonIds ?? []).not.toContain('user-bob');

    const settlement = await getDoc('settlements', result.settlementId);
    expect(settlement!.eventId).toBe(EVENT_ID);
  });

  it('reversing a global settlement restores both ledgers', async () => {
    const settled = await withBillTriggers(() =>
      processSettlementCore(ALICE, { friendUserId: BOB })
    );
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(0, 2);

    const reversed = await withBillTriggers(() =>
      processSettlementReversalCore(ALICE, { settlementId: settled.settlementId })
    );
    expect(reversed.reversed).toBe(true);
    expect(reversed.billsReversed).toBe(3);

    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(30, 2);
    expect(bal!.unsettledBillIds).toEqual(expect.arrayContaining(['b1', 'b2', 'b3']));

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(10, 2);

    for (const id of ['b1', 'b2', 'b3']) {
      const b = (await db.collection('bills').doc(id).get()).data()!;
      expect(b.settledPersonIds ?? []).not.toContain('user-bob');
    }
  });
});
