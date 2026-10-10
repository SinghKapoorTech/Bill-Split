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
import { processSettlementCore } from '../../functions/src/settlementProcessor';
import { makeBill } from './helpers/builders';
import { writeBill, withBillTriggers } from './helpers/triggerLoop';
import { checkBillInvariants, type BillInvariantSubject } from '../../shared/billInvariants';
import { personIdToFirebaseUid } from '../../shared/ledgerCalculations';

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

/**
 * Money correctness of the claim. A guest who already PAID must stay paid after
 * signing up, and the claim must never leave the same human in `people` twice.
 *
 * Every test pins a SPECIFIC surviving balance (CLAUDE.md rule 2a): REAL already
 * owes CREDITOR $7 on an unrelated bill, so the pair doc exists before the claim
 * and must read exactly the expected figure afterwards. A resurrected or dropped
 * share moves that number; "no doc exists" would certify nothing.
 */
describe('claimShadowUser — settled debt and duplicate participants', () => {
  const REAL = 'uid_real_signup';
  const PAIR = [CREDITOR, REAL].sort().join('_');

  async function balance(): Promise<number> {
    const snap = await db.collection('balances').doc(PAIR).get();
    expect(snap.exists).toBe(true);
    return snap.data()!.balance as number;
  }

  /** Signed balance → what REAL owes CREDITOR (positive = REAL owes). */
  async function realOwes(): Promise<number> {
    const b = await balance();
    const [first] = [CREDITOR, REAL].sort();
    return first === CREDITOR ? b : -b;
  }

  async function claimAndQuiesce() {
    await withBillTriggers(() => claimShadowUserCore(db, REAL, GUEST));
  }

  async function bill(id: string) {
    return (await db.collection('bills').doc(id).get()).data()!;
  }

  function moneyViolations(b: Record<string, unknown>) {
    return checkBillInvariants(b as BillInvariantSubject).filter((v) =>
      ['I1', 'I2', 'I3', 'I4'].includes(v.code),
    );
  }

  beforeEach(async () => {
    await db.collection('users').doc(REAL).set({ uid: REAL, friends: [], squadIds: [] });
    // REAL's own, pre-existing debt: $7. This is the value that must survive.
    await writeBill('b_prior', makeBill({
      ownerId: CREDITOR,
      people: [{ uid: CREDITOR, name: 'Creditor' }, { uid: REAL, name: 'Real' }],
      items: [{ name: 'Coffee', price: 7 }],
      itemAssignments: { 'item-1': [`user-${REAL}`] },
    }));
    expect(await realOwes()).toBeCloseTo(7, 2);
  });

  it('a guest who settled before signing up stays settled (settled via the settle flow)', async () => {
    await writeBill('b_guest', makeBill({
      ownerId: CREDITOR,
      people: [{ uid: CREDITOR, name: 'Creditor' }, { uid: GUEST, name: 'Guest' }],
      items: [{ name: 'Dinner', price: 20 }],
      itemAssignments: { 'item-1': [`user-${CREDITOR}`, `user-${GUEST}`] },
    }));
    await withBillTriggers(() => processSettlementCore(CREDITOR, { friendUserId: GUEST }));
    expect((await bill('b_guest')).settledPersonIds).toEqual([`user-${GUEST}`]);

    await claimAndQuiesce();

    // Guest's $10 was paid. REAL still owes only their own $7 — not $17.
    expect(await realOwes()).toBeCloseTo(7, 2);
    const b = await bill('b_guest');
    expect(b.settledPersonIds).toEqual([`user-${REAL}`]);
    expect(moneyViolations(b)).toEqual([]);
  });

  it('a guest stored with a BARE id who settled stays settled', async () => {
    await writeBill('b_guest', {
      ...makeBill({
        ownerId: CREDITOR,
        people: [{ uid: CREDITOR, name: 'Creditor' }, { name: 'Guest', localId: GUEST }],
        items: [{ name: 'Dinner', price: 20 }],
        itemAssignments: { 'item-1': [`user-${CREDITOR}`, GUEST] },
        settledPersonIds: [GUEST],
      }),
      participantIds: [CREDITOR, GUEST],
    });

    await claimAndQuiesce();

    expect(await realOwes()).toBeCloseTo(7, 2);
    const b = await bill('b_guest');
    const realEntries = b.people.filter((p: { id: string }) => personIdToFirebaseUid(p.id) === REAL);
    expect(realEntries).toHaveLength(1);
    expect(b.settledPersonIds).toEqual([realEntries[0].id]);
    expect(moneyViolations(b)).toEqual([]);
  });

  it('merges the guest into the real user already on the bill — one person, one share', async () => {
    // REAL is on the bill under a BARE id (59% of prod bills), alongside the
    // guest placeholder for the same human.
    //   item-1 $30 shared by CREDITOR, REAL, GUEST → $10 each
    //   item-2  $6 GUEST only
    // After the merge item-1 is shared by two people: REAL owes 15 + 6 = 21.
    const dup = makeBill({
        ownerId: CREDITOR,
        people: [
          { uid: CREDITOR, name: 'Creditor' },
          { name: 'Real', localId: REAL },
          { uid: GUEST, name: 'Guest' },
        ],
        items: [{ name: 'Pizza', price: 30 }, { name: 'Soda', price: 6 }],
        itemAssignments: {
          'item-1': [`user-${CREDITOR}`, REAL, `user-${GUEST}`],
          'item-2': [`user-${GUEST}`],
        },
      });
    dup.people[2].venmoId = 'guest-venmo';
    await writeBill('b_dup', { ...dup, participantIds: [CREDITOR, REAL, GUEST] });

    await claimAndQuiesce();

    const b = await bill('b_dup');
    const realEntries = b.people.filter((p: { id: string }) => personIdToFirebaseUid(p.id) === REAL);
    // One entry, in the form the client converges to; the real user's name wins,
    // the guest's venmoId fills the gap.
    expect(realEntries).toEqual([{ id: `user-${REAL}`, name: 'Real', venmoId: 'guest-venmo' }]);
    expect(b.itemAssignments).toEqual({
      'item-1': [`user-${CREDITOR}`, `user-${REAL}`],
      'item-2': [`user-${REAL}`],
    });
    expect(moneyViolations(b)).toEqual([]);
    expect(await realOwes()).toBeCloseTo(7 + 21, 2);
  });

  /** REAL as `user-<uid>`, guest BARE — the reverse id forms of the merge test. */
  async function seedMergeBill(settledPersonIds: string[]) {
    // item-1 $30 shared by CREDITOR, REAL, GUEST → $10 each. Merged: $15.
    await writeBill('b_mix', {
      ...makeBill({
        ownerId: CREDITOR,
        people: [
          { uid: CREDITOR, name: 'Creditor' },
          { name: 'Guest', localId: GUEST },
          { uid: REAL, name: 'Real' },
        ],
        items: [{ name: 'Pizza', price: 30 }],
        itemAssignments: { 'item-1': [`user-${CREDITOR}`, GUEST, `user-${REAL}`] },
        settledPersonIds,
      }),
      participantIds: [CREDITOR, GUEST, REAL],
    });
  }

  it('both halves settled → the merged person stays settled', async () => {
    await seedMergeBill([GUEST, `user-${REAL}`]);
    expect(await realOwes()).toBeCloseTo(7, 2);

    await claimAndQuiesce();

    const b = await bill('b_mix');
    expect(b.people.map((p: { id: string }) => p.id)).toEqual([`user-${CREDITOR}`, `user-${REAL}`]);
    expect(b.settledPersonIds).toEqual([`user-${REAL}`]);
    expect(moneyViolations(b)).toEqual([]);
    expect(await realOwes()).toBeCloseTo(7, 2);
  });

  it('only one half settled → the merged debt stays OPEN (never silently forgiven)', async () => {
    await seedMergeBill([`user-${REAL}`]); // REAL paid their $10; guest's $10 is open
    expect(await realOwes()).toBeCloseTo(7, 2); // b_mix contributes 0 under REAL's uid (guest unlinked to REAL)

    await claimAndQuiesce();

    const b = await bill('b_mix');
    expect(b.settledPersonIds).toEqual([]);
    expect(moneyViolations(b)).toEqual([]);
    expect(await realOwes()).toBeCloseTo(7 + 15, 2);
  });

  it('a zero-share real-user entry does not block the paid guest from staying settled', async () => {
    // REAL was added to the bill but assigned nothing ($0); the guest owed $10
    // and paid. The settle flow never marks a $0 person, so requiring EVERY
    // merged entry to be settled would re-open the guest's paid $10.
    await writeBill('b_zero', {
      ...makeBill({
        ownerId: CREDITOR,
        people: [
          { uid: CREDITOR, name: 'Creditor' },
          { uid: REAL, name: 'Real' },
          { uid: GUEST, name: 'Guest' },
        ],
        items: [{ name: 'Dinner', price: 20 }],
        itemAssignments: { 'item-1': [`user-${CREDITOR}`, `user-${GUEST}`] },
        settledPersonIds: [`user-${GUEST}`],
      }),
      participantIds: [CREDITOR, REAL, GUEST],
    });
    expect(await realOwes()).toBeCloseTo(7, 2);

    await claimAndQuiesce();

    const b = await bill('b_zero');
    expect(b.settledPersonIds).toEqual([`user-${REAL}`]);
    expect(moneyViolations(b)).toEqual([]);
    expect(await realOwes()).toBeCloseTo(7, 2);
  });

  it('a real user stored BARE survives as user-<uid>, so the client cannot strip their settled mark', async () => {
    // Both halves paid. If the survivor kept the bare id, ensureUserInPeople
    // would rename it to user-<uid> on next open without touching
    // settledPersonIds, and the ledger (exact match) would re-charge it.
    await writeBill('b_bare', {
      ...makeBill({
        ownerId: CREDITOR,
        people: [
          { uid: CREDITOR, name: 'Creditor' },
          { name: 'Real', localId: REAL },
          { uid: GUEST, name: 'Guest' },
        ],
        items: [{ name: 'Pizza', price: 30 }],
        itemAssignments: { 'item-1': [`user-${CREDITOR}`, REAL, `user-${GUEST}`] },
        settledPersonIds: [REAL, `user-${GUEST}`],
      }),
      participantIds: [CREDITOR, REAL, GUEST],
    });

    await claimAndQuiesce();

    const b = await bill('b_bare');
    expect(b.people.map((p: { id: string }) => p.id)).toEqual([`user-${CREDITOR}`, `user-${REAL}`]);
    expect(b.settledPersonIds).toEqual([`user-${REAL}`]);
    expect(moneyViolations(b)).toEqual([]);
    expect(await realOwes()).toBeCloseTo(7, 2);
  });
});
