import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, updateBill } from './helpers/triggerLoop';
import { getFriendBalanceId, getEventBalanceId } from '../../shared/ledgerCalculations';

/**
 * A-08 — a `user-`-prefixed `paidById` silently erases the debt.
 *
 * Why the existing suite misses this: `ledgerPipeline.int.test.ts:85` flips
 * `paidById` to a RAW uid, and `:423` covers prefixed ids only through
 * `createBillCore`, which normalizes via `toUid()`. Neither exercises a
 * prefixed anchor arriving on the UPDATE path — which is the path the app
 * actually uses.
 *
 * How a prefixed value gets there in production:
 *  - `PaidByBanner.tsx` emits `person.id` when you tap anyone other than
 *    yourself, and linked people are minted as `user-{uid}`.
 *  - `BillWizard.tsx:350` / `AirbnbWizard.tsx:271` persist that straight to
 *    Firestore via `billService.updateBill()` — a direct client write that
 *    never passes through the `createBill` callable's normalization.
 *  - `billFunctions.ts:722` re-prefixes on guest claim.
 *
 * The failure mode is silent. `isWritableBalancePair()` rejects any id with a
 * `user-` prefix, so the pipeline reverses the OLD footprint and then declines
 * to write the new one. The balance lands on zero and no error is raised.
 */

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = getFriendBalanceId(ALICE, BOB);

function standardBill(overrides: Partial<Parameters<typeof makeBill>[0]> = {}) {
  return makeBill({
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
}

async function getBalance(id: string) {
  const snap = await db.collection('balances').doc(id).get();
  return snap.exists ? snap.data()! : null;
}

async function getBill(id: string) {
  return (await db.collection('bills').doc(id).get()).data()!;
}

describe('A-08 — prefixed paidById on the UPDATE path', () => {
  beforeEach(clearFirestore);

  it('treats a "user-"-prefixed anchor exactly like the raw uid', async () => {
    await writeBill('bill-1', standardBill()); // Alice paid → Bob owes 12

    // Exactly what PaidByBanner emits when you tap "Bob" as the payer.
    await updateBill('bill-1', { paidById: `user-${BOB}` });

    const bal = await getBalance(PAIR_ID);
    // Bob is now the creditor, so Alice owes 12 → toSingleBalance = -12.
    // Before the fix this is 0: the old footprint was reversed and the new one
    // was never written, permanently erasing a real debt.
    expect(bal!.balance).toBeCloseTo(-12, 2);
    expect(bal!.unsettledBillIds).toContain('bill-1');
  });

  it('records the footprint against the normalized uid', async () => {
    await writeBill('bill-1', standardBill());
    await updateBill('bill-1', { paidById: `user-${BOB}` });

    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [ALICE]: expect.closeTo(12, 2) });
    // The anchor must be stored normalized, or the next reversal misses.
    expect(bill.processedBalancesAnchorId).toBe(BOB);
  });

  it('never mints a balance doc keyed by a prefixed id', async () => {
    await writeBill('bill-1', standardBill());
    await updateBill('bill-1', { paidById: `user-${BOB}` });

    const all = await db.collection('balances').get();
    const ids = all.docs.map((d) => d.id);
    expect(ids).toContain(PAIR_ID);
    expect(ids.every((id) => !id.includes('user-'))).toBe(true);
  });

  it('is equivalent to flipping with a raw uid', async () => {
    await writeBill('bill-prefixed', standardBill());
    await updateBill('bill-prefixed', { paidById: `user-${BOB}` });
    const prefixed = await getBalance(PAIR_ID);

    await clearFirestore();

    await writeBill('bill-raw', standardBill());
    await updateBill('bill-raw', { paidById: BOB });
    const raw = await getBalance(PAIR_ID);

    expect(prefixed!.balance).toBeCloseTo(raw!.balance, 2);
  });

  it('flipping prefixed → back to owner restores the original balance', async () => {
    await writeBill('bill-1', standardBill());
    await updateBill('bill-1', { paidById: `user-${BOB}` });
    await updateBill('bill-1', { paidById: ALICE });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(12, 2); // Bob owes Alice 12 again
  });

  it('applies the same normalization to the event pair ledger', async () => {
    await db
      .collection('events')
      .doc('event-1')
      .set(makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }));

    await writeBill('bill-1', standardBill({ eventId: 'event-1' }));
    await updateBill('bill-1', { paidById: `user-${BOB}` });

    const eventPairId = getEventBalanceId('event-1', ALICE, BOB);
    const snap = await db.collection('event_balances').doc(eventPairId).get();

    expect(snap.exists).toBe(true);
    expect(snap.data()!.balance).toBeCloseTo(-12, 2);

    const bill = await getBill('bill-1');
    expect(bill.processedEventBalancesAnchorId).toBe(BOB);
  });
});
