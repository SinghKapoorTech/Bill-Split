/**
 * `claimShadowUser` is an authorization boundary: it hands the caller every
 * bill, ledger position and balance belonging to another `users/{uid}` document.
 *
 * The only gate is `isShadow === true`, and `shadowUserId` comes straight from
 * client input. That is acceptable-ish for genuine shadow users, who are
 * placeholders nobody has ever authenticated as — but it becomes a privilege
 * escalation the moment any OTHER kind of document carries `isShadow`.
 *
 * Account deletion is about to create exactly such a document. The tombstone
 * left behind by a deleted account is, structurally, a placeholder user: no
 * auth account, no email, still referenced by counterparties' bills. The
 * obvious implementation marks it `isShadow: true` — and that would let any
 * authenticated Divit user who knows a deleted person's uid absorb their entire
 * financial history.
 *
 * These tests pin the boundary before the deletion work lands:
 *   - a tombstone is never claimable, however it is flagged;
 *   - genuine shadow users stay claimable, so the guard doesn't break the
 *     existing guest-claim flow.
 *
 * See docs/superpowers/specs/2026-09-05-account-deletion-design.md §3.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { claimShadowUserCore } from '../../functions/src/billFunctions';

const ATTACKER = 'uid_attacker';
const DELETED = 'uid_deleted_user';
const GUEST = 'uid_genuine_shadow';
const CREDITOR = 'uid_creditor';

/** A bill the deleted user still appears on, as a counterparty's record. */
async function seedBillFor(participant: string, billId: string) {
  await db.collection('bills').doc(billId).set({
    id: billId,
    billType: 'private',
    ownerId: CREDITOR,
    participantIds: [CREDITOR, participant],
    unsettledParticipantIds: [CREDITOR, participant],
    settledPersonIds: [],
    people: [
      { id: `user-${CREDITOR}`, name: 'Creditor' },
      { id: `user-${participant}`, name: 'Someone' },
    ],
    members: [{ userId: CREDITOR, name: 'Creditor', isAnonymous: false }],
    itemAssignments: {},
    billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
  });
}

beforeEach(async () => {
  await clearFirestore();

  await db.collection('users').doc(ATTACKER).set({
    uid: ATTACKER, friends: [], squadIds: [],
  });
  await db.collection('users').doc(CREDITOR).set({
    uid: CREDITOR, friends: [DELETED], squadIds: [],
  });

  // A genuine shadow user — an invited placeholder who never signed up.
  await db.collection('users').doc(GUEST).set({
    uid: GUEST, isShadow: true, createdById: CREDITOR, friends: [], squadIds: [],
  });
});

describe('claimShadowUser — deleted-account tombstones', () => {
  it('refuses to claim a tombstone that is also flagged isShadow', async () => {
    // This is the naive tombstone: the deletion cascade strips PII and marks the
    // doc as a placeholder. If `isShadow` is what marks it, the doc becomes
    // claimable by anyone — which is the escalation this test exists to forbid.
    await db.collection('users').doc(DELETED).set({
      uid: DELETED,
      displayName: 'Sarah',
      isDeleted: true,
      isShadow: true,
      friends: [],
      squadIds: [],
    });
    await seedBillFor(DELETED, 'bill_deleted_1');

    await expect(claimShadowUserCore(db, ATTACKER, DELETED)).rejects.toThrow();
  });

  it('leaves the tombstone and its bills untouched after a refused claim', async () => {
    await db.collection('users').doc(DELETED).set({
      uid: DELETED, displayName: 'Sarah', isDeleted: true, isShadow: true,
      friends: [], squadIds: [],
    });
    await seedBillFor(DELETED, 'bill_deleted_1');

    await expect(claimShadowUserCore(db, ATTACKER, DELETED)).rejects.toThrow();

    // The tombstone must survive — counterparties' friend rows hydrate from it.
    const tombstone = await db.collection('users').doc(DELETED).get();
    expect(tombstone.exists).toBe(true);

    // And the attacker must not have inherited the ledger position.
    const bill = await db.collection('bills').doc('bill_deleted_1').get();
    expect(bill.data()?.participantIds).toContain(DELETED);
    expect(bill.data()?.participantIds).not.toContain(ATTACKER);
  });

  it('refuses a tombstone marked only with isDeleted', async () => {
    // The shipped tombstone shape: isDeleted, no isShadow. Already rejected by
    // the isShadow gate, but pinned so the two flags can never be conflated.
    await db.collection('users').doc(DELETED).set({
      uid: DELETED, displayName: 'Sarah', isDeleted: true, friends: [], squadIds: [],
    });

    await expect(claimShadowUserCore(db, ATTACKER, DELETED)).rejects.toThrow();
  });
});

describe('claimShadowUser — the existing guest-claim flow still works', () => {
  it('claims a genuine shadow user and migrates their bills', async () => {
    await seedBillFor(GUEST, 'bill_guest_1');

    const result = await claimShadowUserCore(db, ATTACKER, GUEST);

    expect(result.success).toBe(true);
    expect(result.claimedBills).toBe(1);

    const bill = await db.collection('bills').doc('bill_guest_1').get();
    expect(bill.data()?.participantIds).toContain(ATTACKER);
    expect(bill.data()?.participantIds).not.toContain(GUEST);

    // The placeholder profile is consumed by the claim.
    expect((await db.collection('users').doc(GUEST).get()).exists).toBe(false);
  });

  it('still refuses to claim an ordinary, live user account', async () => {
    await expect(claimShadowUserCore(db, ATTACKER, CREDITOR)).rejects.toThrow();
    expect((await db.collection('users').doc(CREDITOR).get()).exists).toBe(true);
  });
});
