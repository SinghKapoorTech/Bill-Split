/**
 * Account deletion — App Store Review Guideline 5.1.1(v).
 *
 * The property that matters most here is NEGATIVE: deleting one person must not
 * disturb anyone else's money. Divit's data is jointly owned — a bill names
 * several people and `balances/{uid1_uid2}` is a shared document the
 * counterparty reads — so a naive purge would retroactively rewrite other
 * users' financial history.
 *
 * See docs/superpowers/specs/2026-09-05-account-deletion-design.md.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { deleteAccountCore } from '../../functions/src/accountDeletion';

const LEAVER = 'uid_leaver';
const FRIEND = 'uid_friend';
const THIRD = 'uid_third';

/** Auth + Storage are not emulated in this suite; record calls instead. */
function stubs() {
  const authDeletes: string[] = [];
  const receiptDeletes: string[] = [];
  return {
    authDeletes,
    receiptDeletes,
    deps: {
      deleteAuthUser: async (uid: string) => { authDeletes.push(uid); },
      deleteReceipts: async (uid: string) => { receiptDeletes.push(uid); },
    },
  };
}

const balanceId = (a: string, b: string) => [a, b].sort().join('_');

beforeEach(async () => {
  await clearFirestore();

  await db.collection('users').doc(LEAVER).set({
    uid: LEAVER,
    displayName: 'Sarah Chen',
    email: 'sarah@example.com',
    username: 'sarah-chen',
    photoURL: 'https://example.com/sarah.jpg',
    phoneNumber: '+15550001111',
    venmoId: 'sarah-venmo',
    friends: [FRIEND],
    squadIds: [],
  });
  await db.collection('users').doc(FRIEND).set({
    uid: FRIEND, displayName: 'Alex', friends: [LEAVER], squadIds: [],
  });
  await db.collection('users').doc(THIRD).set({
    uid: THIRD, displayName: 'Jo', friends: [], squadIds: [],
  });
});

describe('the counterparty is left alone', () => {
  it('does not touch the shared balance document', async () => {
    const id = balanceId(LEAVER, FRIEND);
    await db.collection('balances').doc(id).set({
      id,
      participants: [LEAVER, FRIEND].sort(),
      balance: 23.5,
      unsettledBillIds: ['bill_1'],
      lastBillId: 'bill_1',
    });
    const before = (await db.collection('balances').doc(id).get()).data();

    await deleteAccountCore(db, LEAVER, stubs().deps);

    const after = (await db.collection('balances').doc(id).get()).data();
    expect(after).toEqual(before);
  });

  it('leaves bills the departing user merely participated in completely intact', async () => {
    await db.collection('bills').doc('bill_friends').set({
      id: 'bill_friends',
      billType: 'private',
      ownerId: FRIEND,
      participantIds: [FRIEND, LEAVER],
      unsettledParticipantIds: [FRIEND, LEAVER],
      people: [
        { id: `user-${FRIEND}`, name: 'Alex' },
        { id: `user-${LEAVER}`, name: 'Sarah' },
      ],
      billData: { items: [], subtotal: 40, tax: 0, tip: 0, total: 40 },
    });
    const before = (await db.collection('bills').doc('bill_friends').get()).data();

    await deleteAccountCore(db, LEAVER, stubs().deps);

    const after = (await db.collection('bills').doc('bill_friends').get()).data();
    expect(after).toEqual(before);
  });

  it('keeps immutable settlement records', async () => {
    await db.collection('settlements').doc('s1').set({
      id: 's1', fromUserId: LEAVER, toUserId: FRIEND, amount: 20, settledBillIds: ['bill_1'],
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    expect((await db.collection('settlements').doc('s1').get()).exists).toBe(true);
  });
});

describe('the tombstone', () => {
  it('strips every piece of personal data but keeps the first name', async () => {
    await deleteAccountCore(db, LEAVER, stubs().deps);

    const data = (await db.collection('users').doc(LEAVER).get()).data()!;

    // Kept: counterparty friend rows hydrate from this doc, and the name is
    // already denormalized onto their bills anyway.
    expect(data.displayName).toBe('Sarah');
    expect(data.isDeleted).toBe(true);
    expect(data.deletedAt).toBeDefined();

    for (const field of ['email', 'username', 'photoURL', 'phoneNumber', 'venmoId']) {
      expect(data[field], `${field} must be stripped`).toBeUndefined();
    }
    expect(data.friends).toEqual([]);
    expect(data.squadIds).toEqual([]);
  });

  it('never sets isShadow, which would make the ledger claimable by anyone', async () => {
    await deleteAccountCore(db, LEAVER, stubs().deps);

    const data = (await db.collection('users').doc(LEAVER).get()).data()!;
    expect(data.isShadow).toBeUndefined();
  });

  it('deletes the auth account, and does so last', async () => {
    const s = stubs();
    await deleteAccountCore(db, LEAVER, s.deps);

    expect(s.authDeletes).toEqual([LEAVER]);
    // The tombstone exists, proving Firestore work completed before auth removal.
    expect((await db.collection('users').doc(LEAVER).get()).data()?.isDeleted).toBe(true);
  });

  it('removes the user from their friends lists is NOT done — the link is kept deliberately', async () => {
    await deleteAccountCore(db, LEAVER, stubs().deps);

    // The friend keeps the link so they retain visibility of money owed.
    const friend = (await db.collection('users').doc(FRIEND).get()).data()!;
    expect(friend.friends).toContain(LEAVER);
  });
});

describe('owned bills', () => {
  it('transfers ownership to a live participant rather than orphaning the bill', async () => {
    await db.collection('bills').doc('bill_owned').set({
      id: 'bill_owned',
      billType: 'private',
      ownerId: LEAVER,
      participantIds: [LEAVER, FRIEND],
      people: [{ id: `user-${LEAVER}`, name: 'Sarah' }, { id: `user-${FRIEND}`, name: 'Alex' }],
      billData: { items: [], subtotal: 10, tax: 0, tip: 0, total: 10 },
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.billsTransferred).toBe(1);
    expect((await db.collection('bills').doc('bill_owned').get()).data()?.ownerId).toBe(FRIEND);
  });

  it('deletes a solo bill nobody else can see', async () => {
    await db.collection('bills').doc('bill_solo').set({
      id: 'bill_solo',
      billType: 'private',
      ownerId: LEAVER,
      participantIds: [LEAVER],
      people: [{ id: `user-${LEAVER}`, name: 'Sarah' }],
      billData: { items: [], subtotal: 10, tax: 0, tip: 0, total: 10 },
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.billsDeleted).toBe(1);
    expect((await db.collection('bills').doc('bill_solo').get()).exists).toBe(false);
  });

  it('never hands ownership to another deleted account', async () => {
    await db.collection('users').doc('uid_already_gone').set({
      uid: 'uid_already_gone', displayName: 'Ghost', isDeleted: true, friends: [], squadIds: [],
    });
    await db.collection('bills').doc('bill_ghost').set({
      id: 'bill_ghost',
      billType: 'private',
      ownerId: LEAVER,
      participantIds: [LEAVER, 'uid_already_gone'],
      people: [],
      billData: { items: [], subtotal: 10, tax: 0, tip: 0, total: 10 },
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    // No live heir, so the bill goes rather than becoming permanently uneditable.
    expect(result.billsTransferred).toBe(0);
    expect(result.billsDeleted).toBe(1);
  });

  // Regression: heir search used to read participantIds only. A pre-migration
  // bill has none, yet the ledger pipeline derives uids from people[] and so
  // the bill DOES carry a footprint against a live counterparty. Deleting it
  // wrote down their balance.
  it('transfers a legacy bill by reading people[] when participantIds is absent', async () => {
    await db.collection('bills').doc('bill_legacy').set({
      id: 'bill_legacy',
      billType: 'private',
      ownerId: LEAVER,
      people: [
        { id: `user-${LEAVER}`, name: 'Sarah' },
        { id: `user-${FRIEND}`, name: 'Alex' },
      ],
      billData: { items: [], subtotal: 10, tax: 0, tip: 0, total: 10 },
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.billsTransferred).toBe(1);
    expect(result.billsDeleted).toBe(0);
    expect((await db.collection('bills').doc('bill_legacy').get()).data()?.ownerId).toBe(FRIEND);
  });

  it('deletes a legacy bill only when nobody live is named on it', async () => {
    await db.collection('bills').doc('bill_legacy_solo').set({
      id: 'bill_legacy_solo',
      billType: 'private',
      ownerId: LEAVER,
      people: [{ id: 'person-unlinked', name: 'Someone' }],
      billData: { items: [], subtotal: 10, tax: 0, tip: 0, total: 10 },
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);
    expect(result.billsDeleted).toBe(1);
  });

  // Regression: the ledger anchors on `paidById || ownerId` and ownerId is a
  // RELEVANT_FIELD, so a bare ownership transfer moved the debt to the heir.
  it('pins the ledger anchor to the leaver when a transferred bill has no paidById', async () => {
    await db.collection('bills').doc('bill_no_payer').set({
      id: 'bill_no_payer',
      billType: 'private',
      ownerId: LEAVER,
      participantIds: [LEAVER, FRIEND],
      people: [{ id: `user-${LEAVER}`, name: 'Sarah' }, { id: `user-${FRIEND}`, name: 'Alex' }],
      billData: { items: [], subtotal: 30, tax: 0, tip: 0, total: 30 },
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    const bill = (await db.collection('bills').doc('bill_no_payer').get()).data()!;
    expect(bill.ownerId).toBe(FRIEND);
    expect(bill.paidById, 'the debt must stay anchored on the leaver').toBe(LEAVER);
  });

  it('leaves an explicit paidById alone', async () => {
    await db.collection('bills').doc('bill_payer').set({
      id: 'bill_payer',
      billType: 'private',
      ownerId: LEAVER,
      paidById: FRIEND,
      participantIds: [LEAVER, FRIEND],
      people: [],
      billData: { items: [], subtotal: 30, tax: 0, tip: 0, total: 30 },
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    expect((await db.collection('bills').doc('bill_payer').get()).data()?.paidById).toBe(FRIEND);
  });

  it('clears receipt fields on a transferred bill, since the images are deleted', async () => {
    await db.collection('bills').doc('bill_receipt').set({
      id: 'bill_receipt',
      billType: 'private',
      ownerId: LEAVER,
      participantIds: [LEAVER, FRIEND],
      people: [],
      receiptImageUrl: 'https://storage/receipts/uid_leaver/x.jpg',
      receiptFileName: 'x.jpg',
      billData: { items: [], subtotal: 10, tax: 0, tip: 0, total: 10 },
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    const bill = (await db.collection('bills').doc('bill_receipt').get()).data()!;
    expect(bill.receiptImageUrl).toBeUndefined();
    expect(bill.receiptFileName).toBeUndefined();
  });
});

describe('owned events', () => {
  it('transfers an event that still has members', async () => {
    await db.collection('events').doc('ev_shared').set({
      name: 'Vegas', ownerId: LEAVER, memberIds: [LEAVER, FRIEND, THIRD],
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.eventsTransferred).toBe(1);
    const ev = (await db.collection('events').doc('ev_shared').get()).data()!;
    expect(ev.ownerId).toBe(FRIEND);
    expect(ev.memberIds).not.toContain(LEAVER);
  });

  it('deletes an event the user was alone in', async () => {
    await db.collection('events').doc('ev_solo').set({
      name: 'Solo trip', ownerId: LEAVER, memberIds: [LEAVER],
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.eventsDeleted).toBe(1);
    expect((await db.collection('events').doc('ev_solo').get()).exists).toBe(false);
  });

  it('leaves events the user did not own', async () => {
    await db.collection('events').doc('ev_other').set({
      name: 'Alex trip', ownerId: FRIEND, memberIds: [FRIEND, LEAVER],
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    const ev = (await db.collection('events').doc('ev_other').get()).data()!;
    expect(ev.ownerId).toBe(FRIEND);
    expect(ev.memberIds).toEqual([FRIEND]);
  });
});

describe('squads', () => {
  it('leaves a shared squad standing for its remaining members', async () => {
    await db.collection('squads').doc('sq_shared').set({
      name: 'Roommates', memberIds: [LEAVER, FRIEND, THIRD],
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.squadsLeft).toBe(1);
    expect(result.squadsDeleted).toBe(0);
    const sq = (await db.collection('squads').doc('sq_shared').get()).data()!;
    expect(sq.memberIds).toEqual([FRIEND, THIRD]);
  });

  it('deletes a squad the user was the last member of', async () => {
    await db.collection('squads').doc('sq_solo').set({ name: 'Just me', memberIds: [LEAVER] });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.squadsDeleted).toBe(1);
    expect((await db.collection('squads').doc('sq_solo').get()).exists).toBe(false);
  });
});

describe('scheduled work and stale pointers', () => {
  it('deletes recurring bills so they stop generating for a dead account', async () => {
    await db.collection('recurring_bills').doc('rb1').set({ ownerId: LEAVER, name: 'Rent' });
    await db.collection('recurring_bills').doc('rb2').set({ ownerId: FRIEND, name: 'Netflix' });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.recurringBillsDeleted).toBe(1);
    expect((await db.collection('recurring_bills').doc('rb1').get()).exists).toBe(false);
    expect((await db.collection('recurring_bills').doc('rb2').get()).exists).toBe(true);
  });

  it('clears pending settlement requests but keeps resolved ones', async () => {
    await db.collection('settlement_requests').doc('sr_pending').set({
      fromUserId: LEAVER, toUserId: FRIEND, amount: 10, status: 'pending',
    });
    await db.collection('settlement_requests').doc('sr_done').set({
      fromUserId: LEAVER, toUserId: FRIEND, amount: 10, status: 'approved',
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    expect((await db.collection('settlement_requests').doc('sr_pending').get()).exists).toBe(false);
    expect((await db.collection('settlement_requests').doc('sr_done').get()).exists).toBe(true);
  });

  it('deletes invitations carrying the user email', async () => {
    await db.collection('eventInvitations').doc('inv1').set({
      email: 'sarah@example.com', eventId: 'ev1', invitedBy: FRIEND, status: 'pending',
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    expect((await db.collection('eventInvitations').doc('inv1').get()).exists).toBe(false);
  });

  it('anonymizes feedback rather than destroying it', async () => {
    await db.collection('feedback').doc('f1').set({ userId: LEAVER, text: 'Great app' });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    const f = (await db.collection('feedback').doc('f1').get()).data()!;
    expect(f.text).toBe('Great app');
    expect(f.userId).toBeUndefined();
  });

  it('deletes the user receipt images', async () => {
    const s = stubs();
    await deleteAccountCore(db, LEAVER, s.deps);
    expect(s.receiptDeletes).toEqual([LEAVER]);
  });
});

describe('idempotency and failure behaviour', () => {
  it('is a no-op once the account is fully gone', async () => {
    const first = await deleteAccountCore(db, LEAVER, stubs().deps);
    expect(first.deleted).toBe(true);

    const s = stubs();
    const second = await deleteAccountCore(db, LEAVER, s.deps);

    expect(second.deleted).toBe(false);
    expect(s.authDeletes).toEqual([]);
  });

  // Regression: the guard used to key on `isDeleted`, so a failed auth deletion
  // left a tombstoned profile the user could STILL sign in to — and every retry
  // short-circuited before reaching the one step that had failed.
  it('retries only the auth deletion when that is what failed', async () => {
    const failing = stubs();
    await expect(
      deleteAccountCore(db, LEAVER, {
        ...failing.deps,
        deleteAuthUser: async () => { throw new Error('Admin SDK is down'); },
      })
    ).rejects.toThrow('Admin SDK is down');

    // Tombstoned, but the auth account survived — this is the zombie state.
    const mid = (await db.collection('users').doc(LEAVER).get()).data()!;
    expect(mid.isDeleted).toBe(true);
    expect(mid.authDeleted).toBeUndefined();

    const retry = stubs();
    const result = await deleteAccountCore(db, LEAVER, retry.deps);

    expect(result.deleted).toBe(true);
    expect(retry.authDeletes).toEqual([LEAVER]);
    expect((await db.collection('users').doc(LEAVER).get()).data()?.authDeleted).toBe(true);
  });

  it('treats auth/user-not-found as success when resuming', async () => {
    await expect(
      deleteAccountCore(db, LEAVER, {
        ...stubs().deps,
        deleteAuthUser: async () => { throw new Error('boom'); },
      })
    ).rejects.toThrow();

    const result = await deleteAccountCore(db, LEAVER, {
      ...stubs().deps,
      deleteAuthUser: async () => {
        const e = new Error('no such user') as Error & { code?: string };
        e.code = 'auth/user-not-found';
        throw e;
      },
    });

    expect(result.deleted).toBe(true);
    expect((await db.collection('users').doc(LEAVER).get()).data()?.authDeleted).toBe(true);
  });

  it('is a no-op for a uid that never existed', async () => {
    const result = await deleteAccountCore(db, 'uid_nobody', stubs().deps);
    expect(result.deleted).toBe(false);
  });

  it('still deletes the account when Apple revocation fails', async () => {
    // Revocation is best-effort: a failure at Apple must never leave someone
    // with an account they cannot delete.
    const s = stubs();
    const result = await deleteAccountCore(db, LEAVER, {
      ...s.deps,
      appleAuthorizationCode: 'code_abc',
      revokeApple: async () => { throw new Error('Apple is down'); },
    });

    expect(result.deleted).toBe(true);
    expect(result.appleTokenRevoked).toBe(false);
    expect(s.authDeletes).toEqual([LEAVER]);
  });

  it('records a successful Apple revocation', async () => {
    const revoked: string[] = [];
    const result = await deleteAccountCore(db, LEAVER, {
      ...stubs().deps,
      appleAuthorizationCode: 'code_abc',
      revokeApple: async (code: string) => { revoked.push(code); },
    });

    expect(result.appleTokenRevoked).toBe(true);
    expect(revoked).toEqual(['code_abc']);
  });

  it('skips revocation entirely for a Google-only user', async () => {
    let called = false;
    await deleteAccountCore(db, LEAVER, {
      ...stubs().deps,
      revokeApple: async () => { called = true; },
    });
    expect(called).toBe(false);
  });
});

describe('event bills — the case participantIds alone gets wrong', () => {
  // Regression: firestore.rules grants event bills to any event member via
  // hasEventIdAndMember, independently of participantIds. A leaver-owned event
  // bill split among unlinked guest names has participantIds: [leaver], so a
  // participantIds-only heir search DELETED a bill the rest of the trip was using.
  it('transfers an event bill to an event member who is not on the bill', async () => {
    await db.collection('events').doc('ev_trip').set({
      name: 'Vegas', ownerId: FRIEND, memberIds: [FRIEND, LEAVER, THIRD],
    });
    await db.collection('bills').doc('bill_event').set({
      id: 'bill_event',
      billType: 'event',
      eventId: 'ev_trip',
      ownerId: LEAVER,
      participantIds: [LEAVER],
      people: [{ id: 'person-guest', name: 'Unlinked guest' }],
      billData: { items: [], subtotal: 60, tax: 0, tip: 0, total: 60 },
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.billsDeleted).toBe(0);
    expect(result.billsTransferred).toBe(1);
    const bill = (await db.collection('bills').doc('bill_event').get()).data()!;
    expect([FRIEND, THIRD]).toContain(bill.ownerId);
  });

  // Regression: bills were reassigned BEFORE events, so a bill could be handed
  // to an heir and then destroyed moments later by the event cascade.
  it('does not transfer a bill belonging to an event being deleted', async () => {
    await db.collection('events').doc('ev_solo').set({
      name: 'Solo', ownerId: LEAVER, memberIds: [LEAVER],
    });
    await db.collection('bills').doc('bill_in_solo_event').set({
      id: 'bill_in_solo_event',
      billType: 'event',
      eventId: 'ev_solo',
      ownerId: LEAVER,
      participantIds: [LEAVER, FRIEND],
      people: [],
      billData: { items: [], subtotal: 20, tax: 0, tip: 0, total: 20 },
    });

    const result = await deleteAccountCore(db, LEAVER, stubs().deps);

    expect(result.eventsDeleted).toBe(1);
    // Left for eventDeleteProcessor to cascade; never handed to an heir first.
    expect(result.billsTransferred).toBe(0);
    expect((await db.collection('bills').doc('bill_in_solo_event').get()).data()?.ownerId)
      .toBe(LEAVER);
  });
});

describe('the leaver stops being chargeable', () => {
  it('removes their Venmo handle from bills other people keep', async () => {
    await db.collection('bills').doc('bill_venmo').set({
      id: 'bill_venmo',
      billType: 'private',
      ownerId: FRIEND,
      participantIds: [FRIEND, LEAVER],
      people: [
        { id: `user-${FRIEND}`, name: 'Alex', venmoId: 'alex-venmo' },
        { id: `user-${LEAVER}`, name: 'Sarah', venmoId: 'sarah-venmo' },
      ],
      billData: { items: [], subtotal: 10, tax: 0, tip: 0, total: 10 },
    });

    await deleteAccountCore(db, LEAVER, stubs().deps);

    const people = (await db.collection('bills').doc('bill_venmo').get()).data()!.people;
    const leaverEntry = people.find((p: { id: string }) => p.id === `user-${LEAVER}`);
    const friendEntry = people.find((p: { id: string }) => p.id === `user-${FRIEND}`);

    // The name stays so the record is still intelligible; the payment handle goes.
    expect(leaverEntry.name).toBe('Sarah');
    expect(leaverEntry.venmoId).toBeUndefined();
    // Everyone else is untouched.
    expect(friendEntry.venmoId).toBe('alex-venmo');
  });
});
