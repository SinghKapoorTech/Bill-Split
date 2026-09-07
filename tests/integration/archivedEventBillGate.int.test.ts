import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeEvent } from './helpers/builders';
import { createBillCore } from '../../functions/src/billFunctions';

/**
 * The server-side half of the archive soft-lock — the debt chunk 2 left open.
 *
 * Chunk 2 stops new bills reaching an archived event from the CLIENT
 * (`eventCreateTarget.ts` + `CreateOptionsDialog.tsx`) and from the recurring
 * processor. Nothing stopped the SERVER writing one, so the lock was advisory:
 * anyone with devtools could still file bills into an archived event, and since
 * the archive is what frees a slot against the free-tier group cap (spec
 * §4.2.1), an unenforced archive makes that cap decorative — archive both
 * events, keep using them exactly as before, create two more.
 *
 * These tests were written to FAIL against the pre-chunk-3 code, which accepted
 * an archived `eventId` without complaint.
 *
 * `isEventArchived` is the single arbiter across client and server: ONLY a
 * literal `true` archives. A missing field means ACTIVE — the normal state of
 * every event nobody has ever archived — and must never be treated as a lock.
 */

const ALICE = 'alice';
const BOB = 'bob';

function billParams(eventId: string) {
  return {
    billType: 'event' as const,
    billData: {
      items: [{ id: 'item-1', name: 'Dinner', price: 40 }],
      subtotal: 40,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: 40,
    },
    people: [
      { id: `user-${ALICE}`, name: 'Alice' },
      { id: `user-${BOB}`, name: 'Bob' },
    ],
    ownerId: ALICE,
    ownerName: 'Alice',
    eventId,
    splitEvenly: true,
  };
}

async function seedEvent(id: string, archived?: boolean): Promise<void> {
  await db.doc(`events/${id}`).set({
    ...makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }),
    ...(archived === undefined ? {} : { archived }),
  });
}

describe('createBillCore — archived event gate', () => {
  beforeEach(clearFirestore);

  it('REJECTS a bill filed into an archived event', async () => {
    await seedEvent('ev-archived', true);

    await expect(createBillCore(db, billParams('ev-archived'))).rejects.toThrow(/archived/i);

    // The rejection must happen BEFORE anything is persisted. A bill that is
    // rejected but still written is worse than no gate at all: it lands in the
    // event, drives the ledger, and reports failure to the user.
    const bills = await db.collection('bills').get();
    expect(bills.empty).toBe(true);
  });

  it('writes no balance documents when it rejects', async () => {
    await seedEvent('ev-archived', true);
    await expect(createBillCore(db, billParams('ev-archived'))).rejects.toThrow();

    const balances = await db.collection('balances').get();
    const eventBalances = await db.collection('event_balances').get();
    expect(balances.empty).toBe(true);
    expect(eventBalances.empty).toBe(true);
  });

  it('ALLOWS a bill in an event explicitly marked active', async () => {
    await seedEvent('ev-active', false);
    const billId = await createBillCore(db, billParams('ev-active'));
    expect(billId).toBeTruthy();
    expect((await db.doc(`bills/${billId}`).get()).data()?.eventId).toBe('ev-active');
  });

  // The trap `shared/eventArchive.ts` exists to document: absence is ACTIVE.
  // Every event written before the archive feature has no `archived` field, and
  // treating that as archived would lock every historical event out of new bills.
  it('ALLOWS a bill in an event with NO archived field at all', async () => {
    await seedEvent('ev-legacy');
    const billId = await createBillCore(db, billParams('ev-legacy'));
    expect(billId).toBeTruthy();
  });

  // Only a literal `true` archives. A non-boolean truthy value can only come
  // from a bad write, and must not silently lock an event its owner never archived.
  it('ALLOWS a bill when archived is truthy-but-not-true', async () => {
    await db.doc('events/ev-weird').set({
      ...makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }),
      archived: 'true',
    });
    await expect(createBillCore(db, billParams('ev-weird'))).resolves.toBeTruthy();
  });

  it('leaves private bills entirely unaffected', async () => {
    const { eventId: _drop, ...priv } = billParams('unused');
    const billId = await createBillCore(db, { ...priv, billType: 'private' });
    expect(billId).toBeTruthy();
  });

  // Archiving must never block PAYING SOMEONE BACK (spec §4.2.1) — the hard
  // rule of the whole feature. The gate is scoped to creation only; nothing
  // here may touch an existing bill or its balances.
  it('does not disturb bills that already exist in the event', async () => {
    await seedEvent('ev-mixed', false);
    const existing = await createBillCore(db, billParams('ev-mixed'));

    await db.doc('events/ev-mixed').update({ archived: true });
    await expect(createBillCore(db, billParams('ev-mixed'))).rejects.toThrow(/archived/i);

    const snap = await db.doc(`bills/${existing}`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.eventId).toBe('ev-mixed');
  });

  // A dangling eventId is a different failure with a different cause; conflating
  // the two would report "archived" for an event that was deleted.
  it('reports a missing event as not-found, not as archived', async () => {
    await expect(createBillCore(db, billParams('ev-does-not-exist'))).rejects.toThrow(/not found/i);
  });
});
