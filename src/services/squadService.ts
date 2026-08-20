import { doc, getDoc, Timestamp, collection, query, where, getDocs, documentId, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { Squad, HydratedSquad, CreateSquadInput, UpdateSquadInput, SquadMember } from '@/types/squad.types';
import { UserProfile } from '@/types/person.types';
import { generateSquadId } from '@/utils/squadUtils';
import { userService } from './userService';

const USERS_COLLECTION = 'users';
const BATCH_SIZE = 30; // Firestore 'in' operator limit

/**
 * All squad writes are server-side. A client that could name a squad's members
 * could force a stranger into a squad it controls and thereby read their bills,
 * so `squads/*` is `allow write: if false` and these callables are the only
 * writer. They also write the squad document and every member's `squadIds` in
 * one batch, so the two can never drift apart.
 */
function callSquadFn<Req, Res>(name: string) {
  return async (payload: Req): Promise<Res> => {
    const fn = httpsCallable<Req, Res>(functions, name);
    const result = await fn(payload);
    return result.data;
  };
}

interface SquadMemberPayload { id: string; contact?: string; }

const createSquadFn = callSquadFn<
  { name: string; description?: string; members: SquadMemberPayload[] },
  { squadId: string }
>('createSquad');

const updateSquadFn = callSquadFn<
  { squadId: string; name?: string; description?: string; members?: SquadMemberPayload[] },
  { squadId: string }
>('updateSquad');

const deleteSquadFn = callSquadFn<{ squadId: string }, { squadId: string }>('deleteSquad');

/**
 * Surfaces the real reason a callable refused. Without this every failure
 * collapses into "Please try again", which is wrong advice for
 * permission-denied and invites an infinite retry on a permanent error.
 */
function squadError(error: unknown, fallback: string): Error {
  const e = error as { code?: string; message?: string };
  if (e?.message && typeof e.code === 'string' && e.code.startsWith('functions/')) {
    return new Error(e.message);
  }
  return new Error(e?.message || fallback);
}

/** The contact the user typed, used server-side as proof they know this person. */
function contactOf(member: SquadMember): string | undefined {
  return member.email || member.phoneNumber || undefined;
}

interface FirestoreSquad {
  id: string;
  name: string;
  description?: string;
  memberIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Converts a Firestore squad document to a Squad object (without hydration)
 */
function convertFromFirestore(data: FirestoreSquad): Squad {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    memberIds: data.memberIds || [],
    createdAt: data.createdAt?.toDate() ?? new Date(),
    updatedAt: data.updatedAt?.toDate() ?? new Date(),
  };
}

/**
 * Converts a Squad object to Firestore format
 */
function convertToFirestore(squad: Omit<Squad, 'createdAt' | 'updatedAt'> & { createdAt?: Date; updatedAt?: Date }): Omit<FirestoreSquad, 'id'> {
  return {
    name: squad.name,
    description: squad.description,
    memberIds: squad.memberIds,
    createdAt: squad.createdAt ? Timestamp.fromDate(squad.createdAt) : Timestamp.now(),
    updatedAt: squad.updatedAt ? Timestamp.fromDate(squad.updatedAt) : Timestamp.now(),
  };
}

/**
 * Batch-fetches user profiles by ID using documentId() in queries.
 * Returns a map of userId -> UserProfile.
 */
async function batchFetchProfiles(userIds: string[]): Promise<Record<string, UserProfile>> {
  const profileMap: Record<string, UserProfile> = {};
  if (userIds.length === 0) return profileMap;

  const usersRef = collection(db, USERS_COLLECTION);
  const uniqueIds = [...new Set(userIds)];

  for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + BATCH_SIZE);
    const q = query(usersRef, where(documentId(), 'in', batch), limit(BATCH_SIZE));
    const snap = await getDocs(q);
    snap.docs.forEach(d => {
      profileMap[d.id] = d.data() as UserProfile;
    });
  }

  return profileMap;
}

/**
 * Helper to hydrate a squad with member details.
 * Accepts an optional pre-fetched profile map to avoid redundant reads.
 */
async function hydrateSquad(squad: Squad, profileMap?: Record<string, UserProfile>): Promise<HydratedSquad> {
  // Fetch profiles if not provided
  const profiles = profileMap ?? await batchFetchProfiles(squad.memberIds);

  const members: SquadMember[] = squad.memberIds.map(memberId => {
    const profile = profiles[memberId];
    if (profile) {
      return {
        id: profile.uid,
        name: profile.displayName,
        venmoId: profile.venmoId,
        email: profile.email,
        phoneNumber: profile.phoneNumber,
      } as SquadMember;
    }
    return { name: 'Unknown User', id: memberId } as SquadMember;
  });

  return { ...squad, members };
}

/**
 * Fetches all squads for a user, fully hydrated with member details
 * @param userId - The user's unique identifier
 * @returns Array of HydratedSquad objects
 * @throws Error if fetch fails
 */
export async function fetchUserSquads(userId: string): Promise<HydratedSquad[]> {
  try {
    const userProfile = await userService.getUserProfile(userId);

    if (!userProfile || !userProfile.squadIds || userProfile.squadIds.length === 0) {
      return [];
    }

    // Batch-fetch all squad docs using documentId() in queries
    const squadsRef = collection(db, 'squads');
    const squads: Squad[] = [];

    for (let i = 0; i < userProfile.squadIds.length; i += BATCH_SIZE) {
      const batch = userProfile.squadIds.slice(i, i + BATCH_SIZE);
      const q = query(squadsRef, where(documentId(), 'in', batch), limit(BATCH_SIZE));
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        squads.push(convertFromFirestore({ id: d.id, ...d.data() } as FirestoreSquad));
      });
    }

    if (squads.length === 0) return [];

    // Collect all unique member IDs across all squads, then batch-fetch profiles once
    const allMemberIds = [...new Set(squads.flatMap(s => s.memberIds))];
    const profileMap = await batchFetchProfiles(allMemberIds);

    // Hydrate all squads using the pre-fetched profiles
    return Promise.all(squads.map(squad => hydrateSquad(squad, profileMap)));
  } catch (error) {
    console.error('Error fetching squads:', error);
    throw new Error('Failed to load squads');
  }
}

/**
 * Saves a new squad for a user
 * @param userId - The user's unique identifier
 * @param input - Squad creation data
 * @returns The ID of the newly created squad
 * @throws Error if save fails
 */
export async function saveSquad(userId: string, input: CreateSquadInput): Promise<string> {
  try {
    // Members are resolved client-side (this may create shadow users, which the
    // caller owns). The squad document itself is written by the server.
    const members = await Promise.all(input.members.map(async (member) => {
      const contact = contactOf(member);
      if (member.id) return { id: member.id, contact };
      const identifier = member.email || member.phoneNumber || member.venmoId;
      const id = identifier
        ? await userService.resolveUser(identifier, member.name)
        : await userService.createShadowUser(member.name, member.name);
      return { id, contact };
    }));

    const { squadId } = await createSquadFn({
      name: input.name,
      description: input.description,
      members,
    });
    return squadId;
  } catch (error) {
    console.error('Error saving squad:', error);
    throw squadError(error, 'Failed to save squad');
  }
}
/**
 * Updates an existing squad
 * @param userId - The user's unique identifier
 * @param squadId - The squad ID to update
 * @param updates - Partial squad data to update
 * @throws Error if update fails or squad not found
 */
export async function updateSquad(userId: string, squadId: string, updates: UpdateSquadInput): Promise<void> {
  try {
    let members: { id: string; contact?: string }[] | undefined;

    if (updates.members) {
      members = await Promise.all(updates.members.map(async (member) => {
        const contact = contactOf(member);
        if (member.id) return { id: member.id, contact };
        const identifier = member.email || member.phoneNumber;
        const id = identifier
          ? await userService.resolveUser(identifier, member.name)
          : await userService.createShadowUser(member.name, member.name);
        return { id, contact };
      }));
    }

    // The server updates the squad document and every member's squadIds in one
    // batch, so membership cannot desync if the call fails partway.
    await updateSquadFn({
      squadId,
      ...(updates.name !== undefined ? { name: updates.name } : {}),
      ...(updates.description !== undefined ? { description: updates.description } : {}),
      ...(members ? { members } : {}),
    });
  } catch (error) {
    console.error('Error updating squad:', error);
    throw squadError(error, 'Failed to update squad');
  }
}
/**
 * Deletes a squad
 * @param userId - The user's unique identifier
 * @param squadId - The squad ID to delete
 * @throws Error if delete fails
 */
export async function deleteSquad(userId: string, squadId: string): Promise<void> {
  try {
    await deleteSquadFn({ squadId });
  } catch (error) {
    console.error('Error deleting squad:', error);
    throw squadError(error, 'Failed to delete squad');
  }
}
/**
 * Gets a single squad by ID
 * @param userId - The user's unique identifier
 * @param squadId - The squad ID to retrieve
 * @returns The HydratedSquad object or null if not found
 * @throws Error if fetch fails
 */
export async function getSquadById(userId: string, squadId: string): Promise<HydratedSquad | null> {
  try {
    const squadRef = doc(db, 'squads', squadId);
    const squadDoc = await getDoc(squadRef);

    if (!squadDoc.exists()) {
      return null;
    }

    const squad = convertFromFirestore({ id: squadDoc.id, ...squadDoc.data() } as FirestoreSquad);
    return hydrateSquad(squad);
  } catch (error) {
    console.error('Error fetching squad:', error);
    throw new Error('Failed to load squad');
  }
}
