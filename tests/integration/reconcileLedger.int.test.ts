import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeUser } from './helpers/builders';
import { reconcileLedgerCore } from '../../functions/src/reconciliation/reconcileLedger';
import { createBillCore } from '../../functions/src/billFunctions';
import { withBillTriggers } from './helpers/triggerLoop';
import { getFriendBalanceId } from '../../shared/ledgerCalculations';

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = getFriendBalanceId(ALICE, BOB); // 'alice_bob'

async function getBalance(id: string) {
  const snap = await db.collection('balances').doc(id).get();
  return snap.exists ? snap.data()! : null;
}

describe('reconcileLedgerCore (integration)', () => {
  beforeEach(clearFirestore);

  it('corrects a drifted balance doc and deletes a junk self-pair doc', async () => {
    // Users so both UIDs are "known" (else the pipeline treats them as junk).
    await db.collection('users').doc(ALICE).set(makeUser());
    await db.collection('users').doc(BOB).set(makeUser());

    // Correct source-of-truth bill: Pizza 20 + 2 tax + 2 tip = 24, split evenly.
    // Bob owes Alice 12. Alice sorts first → balance should be +12.
    await db
      .collection('bills')
      .doc('bill-1')
      .set(
        makeBill({
          ownerId: ALICE,
          people: [
            { uid: ALICE, name: 'Alice' },
            { uid: BOB, name: 'Bob' },
          ],
          items: [{ name: 'Pizza', price: 20 }],
          itemAssignments: { 'item-1': [`user-${ALICE}`, `user-${BOB}`] },
          tax: 2,
          tip: 2,
        }),
      );

    // Seed a DRIFTED friend balance doc (wrong balance + stale bill).
    await db
      .collection('balances')
      .doc(PAIR_ID)
      .set({
        id: PAIR_ID,
        participants: [ALICE, BOB],
        balance: 99.99, // wrong — should be 12
        unsettledBillIds: ['bill-1', 'ghost-bill'],
        lastUpdatedAt: Timestamp.now(),
      });

    // Seed a JUNK self-pair doc (alice_alice) that must be deleted.
    const junkId = getFriendBalanceId(ALICE, ALICE); // 'alice_alice'
    await db
      .collection('balances')
      .doc(junkId)
      .set({
        id: junkId,
        participants: [ALICE, ALICE],
        balance: 5,
        unsettledBillIds: ['whatever'],
        lastUpdatedAt: Timestamp.now(),
      });

    const report = await reconcileLedgerCore(db, { dryRun: false });

    // Drifted doc corrected.
    const bal = await getBalance(PAIR_ID);
    expect(bal).not.toBeNull();
    expect(bal!.balance).toBeCloseTo(12, 2);
    expect(bal!.unsettledBillIds).toEqual(['bill-1']);

    // Junk self-pair doc deleted.
    expect(await getBalance(junkId)).toBeNull();

    expect(report.patched).toBeGreaterThanOrEqual(1);
    expect(report.deleted).toBeGreaterThanOrEqual(1);

    // Idempotent: a second dry run should report no balance changes.
    const second = await reconcileLedgerCore(db, { dryRun: true });
    expect(second.patched).toBe(0);
    expect(second.zeroed).toBe(0);
    expect(second.deleted).toBe(0);
  });
});

/**
 * Regression: `createBillCore` seeds `processedBalances` + `_ledgerVersion: 1`
 * but omitted `processedBalancesAnchorId`. The pipeline then recomputes an
 * identical footprint, so `applyFriendLedger` early-returns on empty deltas
 * (ledgerProcessor.ts:314) BEFORE the stamp at :403-407, and the `!stage2Wrote`
 * branch (:1023) bumps the version without writing the anchor. The bill is left
 * with a footprint and no anchor forever — `friendAnchorDiffers` in the
 * reconciler, re-reported every day, and a missing reversal locator if the
 * payer is ever changed.
 *
 * Observed in prod: 3 recurring-generated bills, count growing one per cycle.
 */
describe('createBillCore — footprint anchor is seeded', () => {
  beforeEach(clearFirestore);

  it('leaves no reconciler drift for a freshly created, never-edited bill', async () => {
    await db.collection('users').doc(ALICE).set(makeUser());
    await db.collection('users').doc(BOB).set(makeUser());

    // withBillTriggers fires a real CREATE event for the new bill, exactly as
    // production Firestore would.
    const billId = await withBillTriggers(() =>
      createBillCore(db, {
        billType: 'private',
        billData: {
          items: [{ id: 'item-1', name: 'Pizza', price: 20 }],
          subtotal: 20,
          tax: 0,
          tip: 0,
          total: 20,
        },
        people: [
          { id: `user-${ALICE}`, name: 'Alice' },
          { id: `user-${BOB}`, name: 'Bob' },
        ],
        ownerId: ALICE,
        ownerName: 'Alice',
        paidById: ALICE,
        splitEvenly: true,
        itemAssignments: { 'item-1': [`user-${ALICE}`, `user-${BOB}`] },
      }),
    );

    const bill = (await db.collection('bills').doc(billId).get()).data()!;
    expect(Object.keys(bill.processedBalances || {}).length).toBeGreaterThan(0);
    expect(bill.processedBalancesAnchorId).toBe(ALICE);

    // The reconciler must see nothing to do — no drift, no stamp.
    const report = await reconcileLedgerCore(db, { dryRun: true });
    expect(report.patched).toBe(0);
    expect(report.zeroed).toBe(0);
    expect(report.deleted).toBe(0);
    expect(report.billsStamped).toBe(0);
  });
});
