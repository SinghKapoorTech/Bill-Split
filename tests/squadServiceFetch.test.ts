/**
 * `fetchUserSquads` must survive a stale `users/{uid}.squadIds` entry.
 *
 * The bug (seen on beta, 2026-10-13): squads were fetched with ONE
 * documentId() `in` query. Under the rules a list query is all-or-nothing, so a
 * single id naming a deleted squad, or a squad the user has left, denied the
 * whole batch — the Squads screen and the "Add from Squad" picker showed
 * "Error loading squads" for an account with perfectly good squads. The rules
 * side is pinned in tests/rules/users.rules.test.ts; this pins the client.
 *
 * Firestore is fully mocked (no importOriginal — that drags
 * src/config/firebase.ts in and fails in CI without .env).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Snap = { id: string; exists: () => boolean; data: () => Record<string, unknown> };
/** Per squad id: a document, `null` for missing, or an Error to reject with. */
let squadDocs: Record<string, Record<string, unknown> | null | Error>;

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));
vi.mock('firebase/firestore', () => ({
  Timestamp: {
    now: () => ({ toDate: () => new Date() }),
    fromDate: (d: Date) => ({ toDate: () => d }),
  },
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  limit: vi.fn(() => ({})),
  documentId: vi.fn(() => '__name__'),
  // Profiles for hydration: return nothing; members become "Unknown User".
  getDocs: vi.fn(async () => ({ docs: [] })),
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ coll, id })),
  getDoc: vi.fn(async (ref: { coll: string; id: string }): Promise<Snap> => {
    const entry = squadDocs[ref.id];
    if (entry instanceof Error) throw entry;
    return { id: ref.id, exists: () => entry != null, data: () => entry ?? {} };
  }),
}));
vi.mock('@/services/userService', () => ({
  userService: {
    getUserProfile: vi.fn(async () => ({ uid: 'me', squadIds: ['good', 'deleted', 'left'] })),
  },
}));

import { fetchUserSquads } from '@/services/squadService';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  squadDocs = {
    good: { id: 'good', name: 'Roommates', memberIds: ['me', 'pat'] },
    deleted: null,
    left: Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    }),
  };
});

describe('fetchUserSquads — stale squadIds', () => {
  it('returns the readable squads instead of failing on a deleted or left squad', async () => {
    const squads = await fetchUserSquads('me');
    expect(squads.map((s) => s.name)).toEqual(['Roommates']);
  });

  it('still loads when every squad is readable', async () => {
    squadDocs.deleted = { id: 'deleted', name: 'Trip', memberIds: ['me'] };
    squadDocs.left = { id: 'left', name: 'Work', memberIds: ['me'] };
    const squads = await fetchUserSquads('me');
    expect(squads.map((s) => s.name).sort()).toEqual(['Roommates', 'Trip', 'Work']);
  });
});

describe('fetchUserSquads — real failures still surface', () => {
  it('throws (-> "Error loading squads") when a read fails for a non-stale reason', async () => {
    // Offline / deadline-exceeded must NOT be swallowed into an empty list,
    // or the user sees "no squads" and has no reason to retry.
    squadDocs.left = Object.assign(new Error('Failed to get document because the client is offline.'), {
      code: 'unavailable',
    });
    await expect(fetchUserSquads('me')).rejects.toThrow('Failed to load squads');
  });
});
