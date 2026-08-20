/**
 * Squad writes are the authorization boundary that replaced the old cross-user
 * `squadIds` rule.
 *
 * The FIRST attempt at this fix only checked "is the caller a member of this
 * squad" — which was useless, because squads were client-created with
 * client-chosen memberIds, so an attacker just minted a squad naming themselves
 * and then wrote squadIds onto anyone. These tests exist mainly to keep that
 * mistake dead: the check must be on the TARGET, not just the caller.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import {
  createSquadCore,
  updateSquadCore,
  deleteSquadCore,
} from '../../functions/src/squadFunctions';

const OWNER = 'uid_owner';
const FRIEND = 'uid_friend';
const STRANGER = 'uid_stranger';
const ATTACKER = 'uid_attacker';
const SHADOW = 'uid_shadow_of_owner';

const squadIdsOf = async (uid: string) =>
  ((await db.collection('users').doc(uid).get()).data()?.squadIds ?? []) as string[];

beforeEach(async () => {
  await clearFirestore();
  await db.collection('users').doc(OWNER).set({ uid: OWNER, squadIds: [], friends: [FRIEND] });
  await db.collection('users').doc(FRIEND).set({ uid: FRIEND, squadIds: [], friends: [OWNER] });
  await db.collection('users').doc(STRANGER).set({
    uid: STRANGER, squadIds: [], friends: [], email: 'stranger@example.com', username: 'stranger',
  });
  await db.collection('users').doc(ATTACKER).set({ uid: ATTACKER, squadIds: [], friends: [] });
  await db.collection('users').doc(SHADOW).set({
    uid: SHADOW, squadIds: [], isShadow: true, createdById: OWNER,
  });
});

describe('squad creation — who may be added', () => {
  it('adds a friend', async () => {
    const { squadId } = await createSquadCore(db, OWNER, {
      name: 'Trip', members: [{ id: FRIEND }],
    });
    expect(await squadIdsOf(FRIEND)).toEqual([squadId]);
    expect(await squadIdsOf(OWNER)).toEqual([squadId]);
  });

  it('adds a shadow user the caller created', async () => {
    const { squadId } = await createSquadCore(db, OWNER, {
      name: 'Trip', members: [{ id: SHADOW }],
    });
    expect(await squadIdsOf(SHADOW)).toEqual([squadId]);
  });

  it('adds a non-friend when the caller supplies their email (proof of contact)', async () => {
    const { squadId } = await createSquadCore(db, OWNER, {
      name: 'Trip', members: [{ id: STRANGER, contact: 'stranger@example.com' }],
    });
    expect(await squadIdsOf(STRANGER)).toEqual([squadId]);
  });

  it('REJECTS a stranger with no contact supplied', async () => {
    await expect(
      createSquadCore(db, ATTACKER, { name: 'Evil', members: [{ id: STRANGER }] }),
    ).rejects.toThrow(/only add friends/i);
    expect(await squadIdsOf(STRANGER)).toEqual([]);
  });

  it('REJECTS a stranger with a wrong contact', async () => {
    await expect(
      createSquadCore(db, ATTACKER, {
        name: 'Evil', members: [{ id: STRANGER, contact: 'guessed@example.com' }],
      }),
    ).rejects.toThrow(/only add friends/i);
    expect(await squadIdsOf(STRANGER)).toEqual([]);
  });

  it("REJECTS someone else's shadow user", async () => {
    await expect(
      createSquadCore(db, ATTACKER, { name: 'Evil', members: [{ id: SHADOW }] }),
    ).rejects.toThrow(/only add friends/i);
    expect(await squadIdsOf(SHADOW)).toEqual([]);
  });

  it('writes nothing at all when one member is rejected', async () => {
    await expect(
      createSquadCore(db, ATTACKER, { name: 'Evil', members: [{ id: STRANGER }] }),
    ).rejects.toThrow();
    const squads = await db.collection('squads').get();
    expect(squads.empty).toBe(true);
    expect(await squadIdsOf(ATTACKER)).toEqual([]);
  });
});

describe('THE ORIGINAL ATTACK — minting a squad to reach a stranger', () => {
  it('an attacker cannot force a stranger in via their own squad', async () => {
    const { squadId } = await createSquadCore(db, ATTACKER, { name: 'Solo', members: [] });
    await expect(
      updateSquadCore(db, ATTACKER, { squadId, members: [{ id: STRANGER }] }),
    ).rejects.toThrow(/only add friends/i);
    expect(await squadIdsOf(STRANGER)).toEqual([]);
  });

  it('an attacker cannot add themselves to a squad they are not in', async () => {
    const { squadId } = await createSquadCore(db, OWNER, { name: 'Trip', members: [{ id: FRIEND }] });
    await expect(
      updateSquadCore(db, ATTACKER, { squadId, members: [{ id: ATTACKER }] }),
    ).rejects.toThrow(/Only a squad member/);
    expect(await squadIdsOf(ATTACKER)).toEqual([]);
  });
});

describe('update and delete', () => {
  it('removes a member and clears their squadIds', async () => {
    const { squadId } = await createSquadCore(db, OWNER, { name: 'Trip', members: [{ id: FRIEND }] });
    await updateSquadCore(db, OWNER, { squadId, members: [] });
    expect(await squadIdsOf(FRIEND)).toEqual([]);
    expect(await squadIdsOf(OWNER)).toEqual([squadId]);
  });

  it('renames without touching membership', async () => {
    const { squadId } = await createSquadCore(db, OWNER, { name: 'Trip', members: [{ id: FRIEND }] });
    await updateSquadCore(db, OWNER, { squadId, name: 'Renamed' });
    const snap = await db.collection('squads').doc(squadId).get();
    expect(snap.data()?.name).toBe('Renamed');
    expect(await squadIdsOf(FRIEND)).toEqual([squadId]);
  });

  it('deletes the squad and detaches every member in one batch', async () => {
    const { squadId } = await createSquadCore(db, OWNER, { name: 'Trip', members: [{ id: FRIEND }] });
    await deleteSquadCore(db, OWNER, { squadId });
    expect((await db.collection('squads').doc(squadId).get()).exists).toBe(false);
    expect(await squadIdsOf(OWNER)).toEqual([]);
    expect(await squadIdsOf(FRIEND)).toEqual([]);
  });

  it('REJECTS delete by a non-member', async () => {
    const { squadId } = await createSquadCore(db, OWNER, { name: 'Trip', members: [{ id: FRIEND }] });
    await expect(deleteSquadCore(db, ATTACKER, { squadId })).rejects.toThrow(/Only a squad member/);
    expect((await db.collection('squads').doc(squadId).get()).exists).toBe(true);
  });

  it('rejects an unknown squad', async () => {
    await expect(updateSquadCore(db, OWNER, { squadId: 'nope', name: 'x' }))
      .rejects.toThrow(/Squad not found/);
  });

  it('skips guest ids, which have no user document', async () => {
    const { squadId } = await createSquadCore(db, OWNER, {
      name: 'Trip', members: [{ id: 'guest_abc' }, { id: FRIEND }],
    });
    const snap = await db.collection('squads').doc(squadId).get();
    expect(snap.data()?.memberIds).toContain('guest_abc');
    expect(await squadIdsOf(FRIEND)).toEqual([squadId]);
  });
});
