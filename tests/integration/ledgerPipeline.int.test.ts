import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, updateBill, deleteBill } from './helpers/triggerLoop';
import { processLedgerWrite } from '../../functions/src/ledgerProcessor';

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

  it('redelivering the same paidById-flip event does not double-count (at-least-once semantics)', async () => {
    await writeBill('bill-1', standardBill());               // Alice creditor: +12
    const eventBefore = await getBill('bill-1');             // state the flip event's `before` snapshot carries
    await updateBill('bill-1', { paidById: BOB });           // first delivery (+ pipeline refires)

    const bal1 = await getBalance(PAIR_ID);
    expect(bal1!.balance).toBeCloseTo(-12, 2);               // Alice owes Bob 12

    // Cloud Functions triggers are at-least-once: the SAME event payload can
    // be delivered again after the first run committed. Must be a no-op.
    const eventAfter = { ...eventBefore, paidById: BOB };
    await processLedgerWrite('bill-1', eventBefore, eventAfter);

    const bal2 = await getBalance(PAIR_ID);
    expect(bal2!.balance).toBeCloseTo(-12, 2);               // NOT -36
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [ALICE]: expect.closeTo(12, 2) });
  });

  it('redelivering the same paidById-flip event does not double-count the event pair ledger', async () => {
    await db.collection('events').doc('trip').set(makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }));
    await writeBill('bill-1', standardBill({ eventId: 'trip' }));
    const eventBefore = await getBill('bill-1');
    await updateBill('bill-1', { paidById: BOB });

    const pairId = 'trip_alice_bob';
    const pair1 = (await db.collection('event_balances').doc(pairId).get()).data()!;
    expect(pair1.balance).toBeCloseTo(-12, 2);

    await processLedgerWrite('bill-1', eventBefore, { ...eventBefore, paidById: BOB });

    const pair2 = (await db.collection('event_balances').doc(pairId).get()).data()!;
    expect(pair2.balance).toBeCloseTo(-12, 2);               // NOT -36
    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(-12, 2);
  });

  it('redelivering a SUPERSEDED write does not apply stale amounts (footprint recomputed from fresh state)', async () => {
    await writeBill('bill-1', standardBill());                  // Pizza 20 → Bob owes 12
    const supersededCreate = await getBill('bill-1');           // the $20 CREATE payload

    // Edit DOWN to Pizza 10 (subtotal 10, total 14 → each 5 + 1 tax + 1 tip = 7)
    await updateBill('bill-1', {
      billData: {
        items: [{ id: 'item-1', name: 'Pizza', price: 10 }],
        subtotal: 10, tax: 2, tip: 2, total: 14, restaurantName: 'Test Diner',
      },
    });
    expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(7, 2);

    // A late / duplicate delivery of the ORIGINAL $20 CREATE arrives after the
    // $10 edit already committed. Its payload still describes the $20 state
    // (Bob owes 12). The pipeline must recompute from FRESH state ($10) and
    // no-op — NOT re-apply the stale $12 on top of the $7.
    await processLedgerWrite('bill-1', undefined, supersededCreate);

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(7, 2);                     // NOT 12
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [BOB]: expect.closeTo(7, 2) });
  });

  it('redelivering a superseded write does not apply stale amounts to the event pair ledger', async () => {
    await db.collection('events').doc('trip').set(makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }));
    await writeBill('bill-1', standardBill({ eventId: 'trip' }));   // Bob owes 12
    const supersededCreate = await getBill('bill-1');

    await updateBill('bill-1', {
      billData: {
        items: [{ id: 'item-1', name: 'Pizza', price: 10 }],
        subtotal: 10, tax: 2, tip: 2, total: 14, restaurantName: 'Test Diner',
      },
    });
    const pairId = 'trip_alice_bob';
    expect((await db.collection('event_balances').doc(pairId).get()).data()!.balance).toBeCloseTo(7, 2);

    await processLedgerWrite('bill-1', undefined, supersededCreate);

    expect((await db.collection('event_balances').doc(pairId).get()).data()!.balance).toBeCloseTo(7, 2); // NOT 12
    expect((await getBalance(PAIR_ID))!.balance).toBeCloseTo(7, 2);
  });

  it('a LEGACY bill without processedBalancesAnchorId flips anchor correctly via the payload fallback', async () => {
    // Every bill that predates the processedBalancesAnchorId field takes the
    // `?? payloadPreviousAnchorId` fallback on its FIRST post-deploy write.
    // Seed exactly that state: a committed +12 balance and a bill carrying
    // processedBalances but NO anchor field.
    await db.collection('bills').doc('legacy-1').set({
      ...standardBill(),
      processedBalances: { [BOB]: 12 },   // NO processedBalancesAnchorId
      _ledgerVersion: 1,
    });
    await db.collection('balances').doc(PAIR_ID).set({
      id: PAIR_ID,
      participants: [ALICE, BOB],
      balance: 12,
      unsettledBillIds: ['legacy-1'],
      lastUpdatedAt: Timestamp.now(),
      lastBillId: 'legacy-1',
    });

    // Flip who paid. The reversal MUST anchor to the payload's before-anchor
    // (alice), not default to the new anchor (bob) — else the old +12 is never
    // reversed and the balance ends wrong.
    await updateBill('legacy-1', { paidById: BOB });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(-12, 2);        // Alice now owes Bob 12
    const bill = await getBill('legacy-1');
    expect(bill.processedBalances).toEqual({ [ALICE]: expect.closeTo(12, 2) });
    expect(bill.processedBalancesAnchorId).toBe(BOB);
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
