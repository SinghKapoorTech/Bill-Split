import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, updateBill, deleteEvent } from './helpers/triggerLoop';

const ALICE = 'alice';
const BOB = 'bob';
const EVENT_ID = 'trip1';
const PAIR_ID = 'alice_bob';
const EVENT_PAIR_ID = 'trip1_alice_bob'; // getEventBalanceId(trip1, alice, bob)

async function getDoc(col: string, id: string) {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? snap.data()! : null;
}

function eventBill(opts: { ownerId: string; price: number }) {
  return makeBill({
    ownerId: opts.ownerId,
    eventId: EVENT_ID,
    people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
    items: [{ name: 'Meal', price: opts.price }],
    itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
  });
}

describe('event pair ledger', () => {
  beforeEach(async () => {
    await clearFirestore();
    await db.collection('events').doc(EVENT_ID).set(
      makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] })
    );
  });

  it('an event bill writes both the event pair doc and the global balance', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // Bob owes 10

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal).not.toBeNull();
    expect(eventBal!.eventId).toBe(EVENT_ID);
    expect(eventBal!.participants).toEqual(['alice', 'bob']);
    expect(eventBal!.balance).toBeCloseTo(10, 2);
    expect(eventBal!.unsettledBillIds).toContain('bill-1');

    const globalBal = await getDoc('balances', PAIR_ID);
    expect(globalBal!.balance).toBeCloseTo(10, 2);

    const bill = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(bill.processedEventBalances).toEqual({ [BOB]: expect.closeTo(10, 2) });
  });

  it('multiple bills with different payers aggregate into one pair doc', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // +10 (bob owes)
    await writeBill('bill-2', eventBill({ ownerId: BOB, price: 30 }));   // -15 (alice owes)

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(-5, 2);        // net: Bob is owed 5
    expect(eventBal!.unsettledBillIds).toEqual(expect.arrayContaining(['bill-1', 'bill-2']));

    const globalBal = await getDoc('balances', PAIR_ID);
    expect(globalBal!.balance).toBeCloseTo(-5, 2);
  });

  it('deleting an event cascades: bills, pair docs, invitations gone; global balances reversed once', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 }));
    await writeBill('bill-2', eventBill({ ownerId: BOB, price: 30 }));
    await db.collection('eventInvitations').doc('inv-1').set({
      email: 'x@example.com', eventId: EVENT_ID, invitedBy: ALICE, status: 'pending',
    });

    await deleteEvent(EVENT_ID);

    expect((await db.collection('bills').doc('bill-1').get()).exists).toBe(false);
    expect((await db.collection('bills').doc('bill-2').get()).exists).toBe(false);
    expect(await getDoc('event_balances', EVENT_PAIR_ID)).toBeNull();
    expect((await db.collection('eventInvitations').doc('inv-1').get()).exists).toBe(false);

    // Reversed exactly once — the cascade's explicit reversal plus the
    // simulated bill-DELETE triggers must not double-reverse (idempotency).
    const globalBal = await getDoc('balances', PAIR_ID);
    expect(globalBal!.balance).toBeCloseTo(0, 2);
    expect(globalBal!.unsettledBillIds ?? []).toEqual([]);
  });

  it('changing paidById on an event bill recomposes the event pair doc (anchor flip)', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // event pair +10
    await updateBill('bill-1', { paidById: BOB });                       // now alice owes bob 10

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(-10, 2);
    expect(eventBal!.unsettledBillIds).toContain('bill-1');

    const globalBal = await getDoc('balances', PAIR_ID);
    expect(globalBal!.balance).toBeCloseTo(-10, 2);

    const bill = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(bill.processedEventBalances).toEqual({ [ALICE]: expect.closeTo(10, 2) });
    expect(bill.processedBalances).toEqual({ [ALICE]: expect.closeTo(10, 2) });
  });
});
