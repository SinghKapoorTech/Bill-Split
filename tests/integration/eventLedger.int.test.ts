import { describe, it, expect, beforeEach } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, updateBill, deleteEvent } from './helpers/triggerLoop';
import { processLedgerWrite } from '../../functions/src/ledgerProcessor';

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

  it('moving a bill to another event reverses the old event pair doc', async () => {
    await db.collection('events').doc('trip2').set(
      makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] })
    );
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // trip1 pair +10
    await updateBill('bill-1', { eventId: 'trip2' });

    const oldPair = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(oldPair!.balance).toBeCloseTo(0, 2);
    expect(oldPair!.unsettledBillIds ?? []).not.toContain('bill-1');

    const newPair = await getDoc('event_balances', 'trip2_alice_bob');
    expect(newPair).not.toBeNull();
    expect(newPair!.balance).toBeCloseTo(10, 2);
    expect(newPair!.unsettledBillIds).toContain('bill-1');

    // The move must not disturb the global friend balance.
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(10, 2);
  });

  it('removing a bill from its event reverses the event pair contribution', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // trip1 pair +10
    await updateBill('bill-1', { eventId: FieldValue.delete(), billType: 'private' });

    const pair = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(pair!.balance).toBeCloseTo(0, 2);
    expect(pair!.unsettledBillIds ?? []).not.toContain('bill-1');

    // Global friend balance keeps the debt — the bill still exists.
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(10, 2);

    const bill = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(bill.processedEventBalances ?? {}).toEqual({});
  });

  it('a stale/redelivered "removed from event" trigger does not wipe a footprint already re-applied to another event', async () => {
    await db.collection('events').doc('trip2').set(
      makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] })
    );
    // Bill lives in trip1, then is moved to trip2 (fresh committed state).
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // trip1 pair +10
    await updateBill('bill-1', { eventId: 'trip2' });                    // now trip2 pair +10

    const live = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(live.eventId).toBe('trip2');
    expect(live.processedEventId).toBe('trip2');
    expect((await getDoc('event_balances', 'trip2_alice_bob'))!.balance).toBeCloseTo(10, 2);

    // Simulate a LATE redelivery / out-of-order arrival of the earlier
    // "removed from trip1" write. Its payload snapshot still claims eventId is
    // absent and the footprint was in trip1 — but the committed bill is now in
    // trip2. The cleanup must decide from FRESH state and no-op.
    const stalePrev = { ...live, eventId: EVENT_ID };
    const staleAfter: Record<string, unknown> = { ...live };
    delete staleAfter.eventId;
    staleAfter.processedEventId = EVENT_ID;              // stale: says footprint in trip1
    staleAfter.processedEventBalances = { [BOB]: 10 };   // stale footprint

    await processLedgerWrite('bill-1', stalePrev, staleAfter);

    // The live footprint (in trip2) must be untouched.
    const after = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(after.processedEventId).toBe('trip2');
    expect(after.processedEventBalances).toEqual({ [BOB]: expect.closeTo(10, 2) });
    expect((await getDoc('event_balances', 'trip2_alice_bob'))!.balance).toBeCloseTo(10, 2);
    expect((await getDoc('event_balances', 'trip2_alice_bob'))!.unsettledBillIds).toContain('bill-1');
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
