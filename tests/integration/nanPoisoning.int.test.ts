/**
 * C-01 + D-03 — non-finite money must never reach a balance doc.
 *
 * These land together on purpose. `calculateFriendFootprint`'s old
 * `amountOwed >= 0` predicate was, by accident, the only thing filtering NaN
 * out of the ledger path — and it never filtered Infinity at all
 * (`Infinity >= 0` is true). D-03 replaces it with a finiteness check so
 * negative totals are recorded instead of silently dropped, which means C-01's
 * validation has to be the real gate.
 *
 * Why a poisoned balance doc is unrecoverable without an admin: every later
 * threshold check fails (`Math.abs(NaN) < BALANCE_THRESHOLD` is false), so
 * processSettlement never treats the pair as settled, and every subsequent
 * delta is `NaN - NaN = NaN`.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeUser } from './helpers/builders';
import { writeBill, updateBill } from './helpers/triggerLoop';
import { createBillCore } from '../../functions/src/billFunctions';
import { processLedgerWrite } from '../../functions/src/ledgerProcessor';
import { reconcileLedgerCore } from '../../functions/src/reconciliation/reconcileLedger';
import { getFriendBalanceId } from '../../shared/ledgerCalculations';

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = getFriendBalanceId(ALICE, BOB);

async function getBalance() {
  const snap = await db.collection('balances').doc(PAIR_ID).get();
  return snap.exists ? snap.data()! : null;
}

async function seedUsers() {
  await db.collection('users').doc(ALICE).set(makeUser());
  await db.collection('users').doc(BOB).set(makeUser());
}

/** A healthy $30 bill split evenly → Bob owes Alice 15. */
function healthyBill() {
  return makeBill({
    ownerId: ALICE,
    people: [
      { uid: ALICE, name: 'Alice' },
      { uid: BOB, name: 'Bob' },
    ],
    items: [{ name: 'Dinner', price: 30 }],
    itemAssignments: { 'item-1': [`user-${ALICE}`, `user-${BOB}`] },
  });
}

describe('C-01 — ledger refuses non-finite money', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedUsers();
  });

  // NOTE ON VECTORS: `tax`/`tip`/`otherFees` cannot actually carry NaN into the
  // math — calculatePersonTotals reads them as `billData.tax || 0`, and NaN is
  // falsy, so `NaN || 0` is 0. `total` is only consulted behind an isFinite
  // check in the discount branch. The live vector is **item.price**, which flows
  // straight into `personSubtotals[id] += item.price / n`. The non-price cases
  // are kept here to lock that reasoning in: if someone later "cleans up" the
  // `|| 0` idiom into `?? 0`, these start failing.
  it.each([
    ['NaN item price', { items: [{ id: 'item-1', name: 'Poison', price: NaN }] }],
    ['Infinity item price', { items: [{ id: 'item-1', name: 'Poison', price: Infinity }] }],
    ['negative item price', { items: [{ id: 'item-1', name: 'Refund', price: -50 }] }],
    ['NaN tax', { tax: NaN }],
    ['Infinity tip', { tip: Infinity }],
    ['NaN total', { total: NaN }],
  ])('never writes a poisoned balance doc: %s', async (_label, corruption) => {
    const bill = healthyBill();
    bill.billData = { ...bill.billData, ...corruption };

    await writeBill('bill-poison', bill);

    const bal = await getBalance();
    // Either no doc at all, or a finite one — never NaN/Infinity.
    if (bal) {
      expect(Number.isFinite(bal.balance)).toBe(true);
    }
    expect(bal?.balance ?? 0).not.toBeNaN();
  });

  it('preserves the last good balance when a later edit corrupts the bill', async () => {
    // A healthy bill first — Bob owes Alice 15.
    await writeBill('bill-1', healthyBill());
    const before = await getBalance();
    expect(before).not.toBeNull();
    expect(Math.abs(before!.balance)).toBeCloseTo(15, 2);

    // Now corrupt it. The pipeline must BAIL, not tear down: zeroing here would
    // destroy real debt because someone wrote a bad number.
    await updateBill('bill-1', {
      billData: {
        ...healthyBill().billData,
        items: [{ id: 'item-1', name: 'Dinner', price: NaN }],
      },
    });

    const after = await getBalance();
    expect(Number.isFinite(after!.balance)).toBe(true);
    expect(after!.balance).toBeCloseTo(before!.balance, 10);
  });

  it('recovers on the next valid edit — the bail is not sticky', async () => {
    await writeBill('bill-1', healthyBill());
    await updateBill('bill-1', {
      billData: {
        ...healthyBill().billData,
        items: [{ id: 'item-1', name: 'Dinner', price: NaN }],
      },
    });

    // A valid edit: raise the item to $50 → Bob now owes 25.
    const fixed = healthyBill();
    fixed.billData = {
      ...fixed.billData,
      items: [{ id: 'item-1', name: 'Dinner', price: 50 }],
      subtotal: 50,
      total: 50,
    };
    await updateBill('bill-1', { billData: fixed.billData });

    const bal = await getBalance();
    expect(Number.isFinite(bal!.balance)).toBe(true);
    expect(Math.abs(bal!.balance)).toBeCloseTo(25, 2);
  });

  it('createBillCore rejects the write outright rather than persisting it', async () => {
    await expect(
      createBillCore(db, {
        billType: 'private',
        billData: {
          items: [{ id: 'item-1', name: 'Dinner', price: NaN }],
          subtotal: NaN,
          tax: 0,
          tip: 0,
          total: NaN,
        },
        people: [
          { id: `user-${ALICE}`, name: 'Alice' },
          { id: `user-${BOB}`, name: 'Bob' },
        ],
        ownerId: ALICE,
        ownerName: 'Alice',
        paidById: ALICE,
        splitEvenly: true,
      }),
    ).rejects.toThrow(/Invalid bill amounts/);

    // Nothing persisted — not the bill, not a balance doc.
    expect(await getBalance()).toBeNull();
    const bills = await db.collection('bills').get();
    expect(bills.size).toBe(0);
  });
});

/**
 * Both engines that recompute a footprint must refuse the SAME documents.
 *
 * Validating only the trigger payload in Stage 1 is not enough, because neither
 * recompute engine reads the payload:
 *
 *  - `applyFriendLedger` / `applyEventPairLedger` deliberately re-read the bill
 *    inside their transaction and recompute from FRESH committed state
 *    (ledgerProcessor.ts:243, :539) to defeat superseded-write redelivery. A
 *    write that lands between the trigger firing and the transaction opening is
 *    therefore applied without ever having been validated.
 *  - The reconciler rebuilds from source and is explicitly documented as
 *    mirroring the pipeline's skip (`reconcileLedger.ts:329`). A skip added to
 *    the pipeline but not to the mirror means the repair tool re-applies exactly
 *    what the pipeline refused — and it has the widest blast radius in the system.
 *
 * D-03 makes this sharp: negatives used to be dropped by `amountOwed >= 0`.
 * They are now recorded, so an unvalidated negative reaches a balance doc.
 */
describe('C-01 — every recompute engine refuses the same documents', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedUsers();
  });

  /** Writes a bill straight to Firestore, bypassing every validation path. */
  async function seedRawBill(id: string, price: number) {
    const bill = healthyBill();
    bill.billData = {
      ...bill.billData,
      items: [{ id: 'item-1', name: 'Exploit', price }],
      subtotal: price,
      total: price,
    };
    await db.collection('bills').doc(id).set(bill);
    return bill;
  }

  it('pipeline: does not apply a negative that only exists in committed state', async () => {
    // Simulates the race: the trigger payload is VALID, but by the time the
    // transaction opens, committed state holds a negative price.
    const validPayload = healthyBill();
    await seedRawBill('bill-toctou', -1_000_000);

    // `after` is the valid payload; the committed doc is the poisoned one.
    await processLedgerWrite('bill-toctou', undefined, validPayload);

    const bal = await getBalance();
    if (bal) {
      expect(Number.isFinite(bal.balance)).toBe(true);
      expect(Math.abs(bal.balance)).toBeLessThan(1000);
    }
  });

  it('reconciler: does not patch a balance from an invalid bill', async () => {
    await seedRawBill('bill-reconcile', -1_000_000);

    // The repair tool must refuse the same document the pipeline refused.
    await reconcileLedgerCore(db, { dryRun: false });

    const bal = await getBalance();
    if (bal) {
      expect(Number.isFinite(bal.balance)).toBe(true);
      expect(Math.abs(bal.balance)).toBeLessThan(1000);
    }
  });

  it('reconciler: does not stamp an invalid footprint onto the bill', async () => {
    await seedRawBill('bill-stamp', -1_000_000);

    await reconcileLedgerCore(db, { dryRun: false });

    const bill = (await db.collection('bills').doc('bill-stamp').get()).data()!;
    for (const amount of Object.values(bill.processedBalances || {})) {
      expect(Number.isFinite(amount)).toBe(true);
      expect(Math.abs(amount as number)).toBeLessThan(1000);
    }
  });
});
