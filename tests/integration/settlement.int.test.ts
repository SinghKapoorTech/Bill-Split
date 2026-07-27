import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, updateBill, withBillTriggers } from './helpers/triggerLoop';
import { processSettlementCore } from '../../functions/src/settlementProcessor';
import { processEventSettlementCore } from '../../functions/src/eventSettlementProcessor';
import { processSettlementReversalCore } from '../../functions/src/settlementReversal';
import { isBalanceSettledConsistent } from '../../shared/ledgerCalculations';

const ALICE = 'alice';
const BOB = 'bob';
const EVENT_ID = 'trip1';
const PAIR_ID = 'alice_bob';
const EVENT_PAIR_ID = 'trip1_alice_bob';

async function getDoc(col: string, id: string) {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? snap.data()! : null;
}

function bill(price: number, eventId?: string, paidById?: string) {
  return makeBill({
    ownerId: ALICE,
    ...(eventId && { eventId }),
    ...(paidById && { paidById }),
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

  it('event settlement with offsetting bills settles each bill\'s own debtor (not an arbitrary one)', async () => {
    // b3: alice paid, bob owes 10. b4: bob paid, alice owes 10 → event pair balance 0.
    await writeBill('b4', bill(20, EVENT_ID, BOB));
    expect((await getDoc('event_balances', EVENT_PAIR_ID))!.balance).toBeCloseTo(0, 2);

    await withBillTriggers(() =>
      processEventSettlementCore(ALICE, { eventId: EVENT_ID, friendUserId: BOB })
    );

    // Each bill settles ITS debtor: bob on b3 (alice paid), alice on b4 (bob paid).
    const b3 = (await db.collection('bills').doc('b3').get()).data()!;
    const b4 = (await db.collection('bills').doc('b4').get()).data()!;
    expect(b3.settledPersonIds).toContain('user-bob');
    expect(b3.settledPersonIds).not.toContain('user-alice');
    expect(b4.settledPersonIds).toContain('user-alice');
    expect(b4.settledPersonIds).not.toContain('user-bob');

    // Event pair fully cleared; flow-through removes BOTH bills from the
    // global ledger: 30 (b1+b2+b3) - 10 (b3) + (-10 → 0) (b4) = 20.
    expect((await getDoc('event_balances', EVENT_PAIR_ID))!.balance).toBeCloseTo(0, 2);
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(20, 2);
  });

  it('global settlement with mixed-direction bills does not erase the reverse debt', async () => {
    // b5: bob paid, alice owes 5 → global balance 30 - 5 = 25.
    await writeBill('b5', bill(10, undefined, BOB));
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(25, 2);

    const result = await withBillTriggers(() =>
      processSettlementCore(ALICE, { friendUserId: BOB })
    );
    expect(result.amountSettled).toBeCloseTo(25, 2);       // net amount

    // b5's debtor is ALICE (bob paid) — not the aggregate debtor bob.
    const b5 = (await db.collection('bills').doc('b5').get()).data()!;
    expect(b5.settledPersonIds).toContain('user-alice');
    expect(b5.settledPersonIds).not.toContain('user-bob');

    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(0, 2);

    // A later edit to b5 must not resurrect the (settled) debt.
    await updateBill('b5', {
      billData: {
        items: [{ id: 'item-1', name: 'Meal', price: 20 }],
        subtotal: 20, tax: 0, tip: 0, total: 20, restaurantName: 'Test Diner',
      },
    });
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(0, 2);
  });

  it('global settlement skips a bill anchored by a third party and keeps its debt (no skip-then-wipe)', async () => {
    // Simulate an in-flight anchor change the pipeline hasn't processed yet:
    // b3 is now anchored to a third party (carol), but alice_bob still lists it.
    await db.collection('bills').doc('b3').update({ paidById: 'carol' });

    const result = await processSettlementCore(ALICE, { friendUserId: BOB });

    // b1 + b2 settle (20). b3 is skipped (third-party anchor) — its $10 debt
    // must remain, the settlement amount must not be overstated, and b3 must
    // stay in unsettledBillIds so the pipeline can still reverse it.
    expect(result.billsSettled).toBe(2);
    expect(result.billsSkipped).toBe(1);
    expect(result.amountSettled).toBeCloseTo(20, 2);     // NOT 30

    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(10, 2);             // b3's +10 remains, NOT 0
    expect(bal!.unsettledBillIds).toEqual(['b3']);        // b1,b2 removed; b3 kept

    const settlement = await getDoc('settlements', result.settlementId);
    expect(settlement!.amount).toBeCloseTo(20, 2);        // not overstated
    expect(settlement!.skippedBillIds).toEqual(['b3']);
  });

  it('event settlement skips a bill anchored by a third party and keeps its debt', async () => {
    await writeBill('b4', bill(40, EVENT_ID));            // event: bob owes 20 → pair +30
    expect((await getDoc('event_balances', EVENT_PAIR_ID))!.balance).toBeCloseTo(30, 2);

    await db.collection('bills').doc('b4').update({ paidById: 'carol' });

    const result = await processEventSettlementCore(ALICE, { eventId: EVENT_ID, friendUserId: BOB });

    expect(result.billsSettled).toBe(1);                 // b3
    expect(result.billsSkipped).toBe(1);                 // b4
    expect(result.amountSettled).toBeCloseTo(10, 2);     // NOT 30

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(20, 2);        // b4's +20 remains, NOT 0
    expect(eventBal!.unsettledBillIds).toEqual(['b4']);
  });

  it('settlement record names the SETTLED direction, not the aggregate, when a bill is skipped', async () => {
    // b5: bob paid, alice owes 15 → aggregate balance 30 - 15 = +15 (bob is
    // owed on net). Then skip every forward bill (b1,b2,b3) by drifting their
    // anchor to a third party, so ONLY b5 (the reverse-direction debt) settles.
    await writeBill('b5', bill(30, undefined, BOB));
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(15, 2);
    for (const id of ['b1', 'b2', 'b3']) {
      await db.collection('bills').doc(id).update({ paidById: 'carol' });
    }

    const result = await processSettlementCore(ALICE, { friendUserId: BOB });
    expect(result.billsSettled).toBe(1);                 // only b5
    expect(result.amountSettled).toBeCloseTo(15, 2);

    // The settled money moved alice → bob (bob paid b5). The immutable record
    // must reflect THAT, not the aggregate sign (which points bob → alice).
    const settlement = await getDoc('settlements', result.settlementId);
    expect(settlement!.fromUserId).toBe(ALICE);          // debtor of the settled bill
    expect(settlement!.toUserId).toBe(BOB);              // creditor of the settled bill
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(30, 2); // b1..b3 remain
  });

  it('post-settlement pair balance satisfies the ledger invariant (near-zero balance and empty unsettledBillIds)', async () => {
    // Single-bill scenario: only b1 (bob owes 12 to alice). Settle globally.
    await clearFirestore();
    const singleBill = makeBill({
      ownerId: ALICE,
      people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
      items: [{ name: 'Meal', price: 24 }],
      itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
    });
    await writeBill('b1', singleBill);

    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(12, 2);

    await withBillTriggers(() =>
      processSettlementCore(ALICE, { friendUserId: BOB })
    );

    const settledBal = await getDoc('balances', PAIR_ID);
    const resultingBalance: number = settledBal!.balance;
    const unsettledBillIds: string[] = settledBal!.unsettledBillIds ?? [];

    expect(isBalanceSettledConsistent(resultingBalance, unsettledBillIds)).toBe(true);
    expect(resultingBalance).toBeCloseTo(0, 2);
    expect(unsettledBillIds).toEqual([]);
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
