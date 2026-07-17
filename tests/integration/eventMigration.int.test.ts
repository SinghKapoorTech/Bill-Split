import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { reconcileOrphanedEventFootprints } from '../../functions/src/migrations/reconcileOrphanedEventFootprints';

const ALICE = 'alice';
const BOB = 'bob';
const EVENT_ID = 'trip1';
const EVENT_PAIR_ID = 'trip1_alice_bob';

async function getDoc(col: string, id: string) {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? snap.data()! : null;
}

/**
 * Seeds the legacy-orphan state: a bill that left its event BEFORE
 * processedEventId existed. It has no eventId and no processedEventId, but
 * still carries a processedEventBalances footprint, and the event pair doc
 * still lists it — a contribution the live pipeline can never reverse.
 */
async function seedOrphan() {
  const now = Timestamp.now();
  await db.collection('event_balances').doc(EVENT_PAIR_ID).set({
    id: EVENT_PAIR_ID,
    eventId: EVENT_ID,
    participants: [ALICE, BOB],
    balance: 10,                          // Bob owes Alice 10, stranded
    unsettledBillIds: ['bill-1'],
    lastUpdatedAt: now,
    lastBillId: 'bill-1',
  });
  await db.collection('bills').doc('bill-1').set({
    ownerId: ALICE,
    paidById: ALICE,
    billType: 'private',                  // eventId was removed pre-deploy
    people: [{ id: `user-${ALICE}`, name: 'Alice' }, { id: `user-${BOB}`, name: 'Bob' }],
    processedEventBalances: { [BOB]: 10 },  // no processedEventId, no eventId
    createdAt: now,
    updatedAt: now,
  });
}

describe('reconcileOrphanedEventFootprints', () => {
  beforeEach(clearFirestore);

  it('reverses a stranded event footprint and clears the stale fields', async () => {
    await seedOrphan();

    const result = await reconcileOrphanedEventFootprints(db);

    expect(result.scanned).toBe(1);
    expect(result.reconciled).toBe(1);

    // The event pair contribution is reversed to zero and the bill removed.
    const pair = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(pair!.balance).toBeCloseTo(0, 2);
    expect(pair!.unsettledBillIds ?? []).not.toContain('bill-1');

    // The bill's stale event footprint is cleared.
    const bill = await getDoc('bills', 'bill-1');
    expect(bill!.processedEventBalances ?? {}).toEqual({});
    expect(bill!.processedEventId).toBeUndefined();
  });

  it('is idempotent — a second pass reverses nothing further', async () => {
    await seedOrphan();
    await reconcileOrphanedEventFootprints(db);

    const second = await reconcileOrphanedEventFootprints(db);
    expect(second.scanned).toBe(0);            // already cleared
    expect((await getDoc('event_balances', EVENT_PAIR_ID))!.balance).toBeCloseTo(0, 2);
  });

  it('reverses against the real pair doc even when the bill anchor drifted (no wrong-anchor strand)', async () => {
    const now = Timestamp.now();
    // The footprint was applied under anchor Alice, but the bill's paidById
    // later drifted to a third party (Carol) and it carries no anchor field.
    // Re-deriving the pair-doc id from paidById would miss the real doc.
    await db.collection('event_balances').doc(EVENT_PAIR_ID).set({
      id: EVENT_PAIR_ID, eventId: EVENT_ID, participants: [ALICE, BOB],
      balance: 10, unsettledBillIds: ['bill-1'], lastUpdatedAt: now, lastBillId: 'bill-1',
    });
    await db.collection('bills').doc('bill-1').set({
      ownerId: ALICE, paidById: 'carol', billType: 'private',   // drifted anchor
      people: [{ id: `user-${ALICE}`, name: 'Alice' }, { id: `user-${BOB}`, name: 'Bob' }],
      processedEventBalances: { [BOB]: 10 },                     // no anchor field / eventId
      createdAt: now, updatedAt: now,
    });

    const result = await reconcileOrphanedEventFootprints(db);
    expect(result.reconciled).toBe(1);

    // Reversed against the REAL doc the query found, not a doc re-derived from
    // the drifted anchor — so the contribution is not stranded.
    const pair = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(pair!.balance).toBeCloseTo(0, 2);
    expect(pair!.unsettledBillIds ?? []).not.toContain('bill-1');
  });

  it('leaves bills that still belong to an event untouched', async () => {
    const now = Timestamp.now();
    await db.collection('bills').doc('live').set({
      ownerId: ALICE, paidById: ALICE, eventId: EVENT_ID, billType: 'event',
      people: [{ id: `user-${ALICE}`, name: 'Alice' }, { id: `user-${BOB}`, name: 'Bob' }],
      processedEventBalances: { [BOB]: 10 },
      processedEventId: EVENT_ID,
      createdAt: now, updatedAt: now,
    });

    const result = await reconcileOrphanedEventFootprints(db);
    expect(result.scanned).toBe(0);
    const bill = await getDoc('bills', 'live');
    expect(bill!.processedEventBalances).toEqual({ [BOB]: 10 });   // untouched
  });
});
