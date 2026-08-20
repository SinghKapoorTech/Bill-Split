/**
 * Squad writes — server-owned.
 *
 * Squad membership lives in two places that must agree: `squads/{id}.memberIds`
 * and each member's `users/{uid}.squadIds`. Letting the client write either one
 * was the vulnerability: any signed-in account could mint a squad naming
 * arbitrary members and thereby write `squadIds` onto strangers, which grants
 * access to bills carrying that squadId.
 *
 * So the client writes NEITHER. `squads/*` is `allow write: if false` in the
 * rules and every mutation goes through the callables here, which:
 *   1. verify the caller may act on the squad, and
 *   2. verify the caller may add each TARGET — checking only the caller was the
 *      flaw in the first attempt, because squad membership was itself
 *      client-declared, so an attacker could mint a squad and self-authorize.
 * Both documents are written in one Admin batch, so they cannot drift apart.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';

/** Guest placeholders live only inside a bill and have no user document. */
const isGuestId = (id: string) => id.startsWith('guest_');

/** Firestore caps a batch at 500 writes; squad doc + members must fit. */
const MAX_MEMBERS = 400;

export interface SquadMemberInput {
  /** Resolved user id (real account, or a shadow the caller created). */
  id: string;
  /** Email / phone / username the caller used, if added by contact. */
  contact?: string;
}

export interface CreateSquadRequest {
  name: string;
  description?: string;
  members: SquadMemberInput[];
}
export interface UpdateSquadRequest {
  squadId: string;
  name?: string;
  description?: string;
  members?: SquadMemberInput[];
}
export interface DeleteSquadRequest {
  squadId: string;
}

function cleanName(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) {
    throw new HttpsError('invalid-argument', `${field} is required`);
  }
  return v.trim().slice(0, 200);
}

/**
 * May `callerId` place `targetId` into a squad?
 *
 * Yes when the target is the caller, an existing friend, a shadow user the
 * caller created, or someone whose own contact details the caller supplied
 * (proof they know the person — that is how add-by-email is meant to work).
 * Anything else is a stranger being force-joined, which is the hole.
 */
async function assertCanAddMembers(
  db: Firestore,
  callerId: string,
  members: SquadMemberInput[],
): Promise<void> {
  const targets = members.filter((m) => m.id !== callerId && !isGuestId(m.id));
  if (targets.length === 0) return;

  const callerSnap = await db.collection('users').doc(callerId).get();
  const friends: string[] = callerSnap.data()?.friends ?? [];

  const snaps = await db.getAll(...targets.map((m) => db.collection('users').doc(m.id)));
  const byId = new Map(snaps.map((s) => [s.id, s]));

  for (const member of targets) {
    if (friends.includes(member.id)) continue;

    const snap = byId.get(member.id);
    if (!snap || !snap.exists) {
      throw new HttpsError('not-found', `User ${member.id} does not exist`);
    }
    const data = snap.data() || {};

    // A shadow the caller created is theirs to manage.
    if (data.isShadow === true && data.createdById === callerId) continue;

    // Proof of contact: the caller supplied this person's own email, phone or
    // username, so the target was not discovered by guessing a uid.
    const contact = typeof member.contact === 'string' ? member.contact.trim().toLowerCase() : '';
    if (contact) {
      const known = [data.email, data.phoneNumber, data.username]
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.toLowerCase());
      if (known.includes(contact)) continue;
    }

    throw new HttpsError(
      'permission-denied',
      'You can only add friends, people you created, or someone whose email, phone or username you provided.',
    );
  }
}

async function loadSquadForMember(db: Firestore, squadId: string, callerId: string) {
  if (!squadId || typeof squadId !== 'string') {
    throw new HttpsError('invalid-argument', 'squadId is required');
  }
  const snap = await db.collection('squads').doc(squadId).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Squad not found');
  const memberIds: string[] = snap.data()?.memberIds ?? [];
  if (!memberIds.includes(callerId)) {
    throw new HttpsError('permission-denied', 'Only a squad member can change this squad');
  }
  return { ref: snap.ref, memberIds };
}

/** Members that own a user document get a squadIds entry; guests do not. */
async function existingUserIds(db: Firestore, ids: string[]): Promise<Set<string>> {
  const real = [...new Set(ids)].filter((id) => !isGuestId(id));
  if (real.length === 0) return new Set<string>();
  const snaps = await db.getAll(...real.map((id) => db.collection('users').doc(id)));
  return new Set(snaps.filter((s) => s.exists).map((s) => s.id));
}

export async function createSquadCore(
  db: Firestore,
  callerId: string,
  data: CreateSquadRequest,
): Promise<{ squadId: string }> {
  const name = cleanName(data?.name, 'name');
  const members = Array.isArray(data?.members) ? data.members : [];
  if (members.some((m) => !m || typeof m.id !== 'string' || !m.id)) {
    throw new HttpsError('invalid-argument', 'Every member needs an id');
  }

  const memberIds = [...new Set([...members.map((m) => m.id), callerId])];
  if (memberIds.length > MAX_MEMBERS) {
    throw new HttpsError('invalid-argument', `A squad can hold at most ${MAX_MEMBERS} members`);
  }
  await assertCanAddMembers(db, callerId, members);

  const squadRef = db.collection('squads').doc();
  const now = Timestamp.now();
  const existing = await existingUserIds(db, memberIds);

  const batch = db.batch();
  batch.set(squadRef, {
    id: squadRef.id,
    name,
    ...(data.description ? { description: String(data.description).trim().slice(0, 500) } : {}),
    memberIds,
    createdAt: now,
    updatedAt: now,
  });
  for (const id of memberIds) {
    if (!existing.has(id)) continue;
    batch.update(db.collection('users').doc(id), { squadIds: FieldValue.arrayUnion(squadRef.id) });
  }
  await batch.commit();
  return { squadId: squadRef.id };
}

export async function updateSquadCore(
  db: Firestore,
  callerId: string,
  data: UpdateSquadRequest,
): Promise<{ squadId: string }> {
  const { ref, memberIds: currentIds } = await loadSquadForMember(db, data?.squadId, callerId);

  const update: Record<string, unknown> = { updatedAt: Timestamp.now() };
  if (data.name !== undefined) update.name = cleanName(data.name, 'name');
  if (data.description !== undefined) {
    update.description = String(data.description ?? '').trim().slice(0, 500);
  }

  let added: string[] = [];
  let removed: string[] = [];

  if (data.members) {
    const members = data.members;
    if (members.some((m) => !m || typeof m.id !== 'string' || !m.id)) {
      throw new HttpsError('invalid-argument', 'Every member needs an id');
    }
    const nextIds = [...new Set([...members.map((m) => m.id), callerId])];
    if (nextIds.length > MAX_MEMBERS) {
      throw new HttpsError('invalid-argument', `A squad can hold at most ${MAX_MEMBERS} members`);
    }
    added = nextIds.filter((id) => !currentIds.includes(id));
    removed = currentIds.filter((id) => !nextIds.includes(id));

    // Only newly added people need the relationship check.
    await assertCanAddMembers(db, callerId, members.filter((m) => added.includes(m.id)));
    update.memberIds = nextIds;
  }

  const existing = await existingUserIds(db, [...added, ...removed]);
  const batch = db.batch();
  batch.update(ref, update);
  for (const id of added) {
    if (existing.has(id)) {
      batch.update(db.collection('users').doc(id), { squadIds: FieldValue.arrayUnion(ref.id) });
    }
  }
  for (const id of removed) {
    if (existing.has(id)) {
      batch.update(db.collection('users').doc(id), { squadIds: FieldValue.arrayRemove(ref.id) });
    }
  }
  await batch.commit();
  return { squadId: ref.id };
}

export async function deleteSquadCore(
  db: Firestore,
  callerId: string,
  data: DeleteSquadRequest,
): Promise<{ squadId: string }> {
  const { ref, memberIds } = await loadSquadForMember(db, data?.squadId, callerId);
  const existing = await existingUserIds(db, memberIds);

  // Squad doc and every membership entry go in ONE batch, so a failure leaves
  // the squad fully intact rather than half-detached and unreachable.
  const batch = db.batch();
  for (const id of memberIds) {
    if (existing.has(id)) {
      batch.update(db.collection('users').doc(id), { squadIds: FieldValue.arrayRemove(ref.id) });
    }
  }
  batch.delete(ref);
  await batch.commit();
  return { squadId: ref.id };
}

const opts = { timeoutSeconds: 60, memory: '256MiB' as const };

function callerUid(request: { auth?: { uid: string } }): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'User must be authenticated');
  return request.auth.uid;
}

export const createSquad = onCall<CreateSquadRequest>(opts, (r) =>
  createSquadCore(getFirestore(), callerUid(r), r.data),
);

export const updateSquad = onCall<UpdateSquadRequest>(opts, (r) =>
  updateSquadCore(getFirestore(), callerUid(r), r.data),
);

export const deleteSquad = onCall<DeleteSquadRequest>(opts, (r) =>
  deleteSquadCore(getFirestore(), callerUid(r), r.data),
);
