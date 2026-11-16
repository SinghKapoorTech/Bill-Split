/**
 * userService.syncUserProfile is the ONLY creator of users/{uid}, and is
 * single-flight per uid.
 *
 * A signup calls it twice at once (AuthContext's background sync on
 * onAuthStateChanged, then signUpWithPassword's own call with the typed name).
 * Unsynchronised, both read "missing" and both create — the second create
 * overwrites the first wholesale, including a hasSeenOnboarding:true the user
 * set in between. Single-flight makes the second call wait, then take the
 * UPDATE path so the typed name still lands.
 *
 * Firestore is mocked at the module boundary with a tiny in-memory store so
 * the exact call order is observable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const store = new Map<string, Record<string, unknown>>();
  const log: string[] = [];
  /** Optional per-op hold: lets a test keep a write in flight. */
  const holds: { setDoc?: Promise<void>; setDocError?: Error } = {};
  return { store, log, holds };
});

// Full factory: nothing real from firebase is loaded.
vi.mock('firebase/firestore', () => {
  const ref = (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}`, id });
  return {
    doc: ref,
    collection: (_db: unknown, col: string) => ({ col }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    limit: (n: number) => ({ limit: n }),
    query: (c: unknown, ...parts: unknown[]) => ({ c, parts }),
    documentId: () => '__name__',
    arrayUnion: (...v: unknown[]) => ({ arrayUnion: v }),
    arrayRemove: (...v: unknown[]) => ({ arrayRemove: v }),
    serverTimestamp: () => 'SERVER_TS',
    Timestamp: { now: () => ({ ms: Date.now() }) },
    getDoc: async (r: { path: string; id: string }) => {
      h.log.push(`getDoc ${r.id}`);
      await Promise.resolve();
      const data = h.store.get(r.path);
      return { exists: () => data !== undefined, data: () => (data ? { ...data } : undefined) };
    },
    // Username probe: no username is ever taken in these tests.
    getDocs: async () => ({ empty: true, docs: [] }),
    setDoc: async (r: { path: string; id: string }, data: Record<string, unknown>) => {
      h.log.push(`setDoc ${r.id}`);
      if (h.holds.setDoc) await h.holds.setDoc;
      if (h.holds.setDocError) {
        // One-shot: only the first write fails.
        const error = h.holds.setDocError;
        delete h.holds.setDocError;
        throw error;
      }
      h.store.set(r.path, { ...data });
      h.log.push(`setDoc ${r.id} done`);
    },
    updateDoc: async (r: { path: string; id: string }, data: Record<string, unknown>) => {
      h.log.push(`updateDoc ${r.id} ${String(data.displayName)}`);
      const prev = h.store.get(r.path);
      if (!prev) throw Object.assign(new Error('no doc'), { code: 'not-found' });
      h.store.set(r.path, { ...prev, ...data });
    },
  };
});
vi.mock('@/config/firebase', () => ({ db: {}, auth: { currentUser: null } }));

import { userService } from '@/services/userService';

const user = (uid: string, displayName: string | null) => ({
  uid,
  email: `${uid}@divit.test`,
  emailVerified: false,
  providerData: [{ providerId: 'password', email: `${uid}@divit.test` }],
  displayName,
  photoURL: null,
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

beforeEach(() => {
  h.store.clear();
  h.log.length = 0;
  delete h.holds.setDoc;
  delete h.holds.setDocError;
});

describe('syncUserProfile — single creator, single-flight per uid', () => {
  it('two concurrent calls for one uid: ONE create, then the second applies the typed name via update', async () => {
    await Promise.all([
      userService.syncUserProfile(user('u1', null)),
      userService.syncUserProfile(user('u1', 'Typed Name')),
    ]);

    expect(h.log).toEqual([
      'getDoc u1',
      'setDoc u1',
      'setDoc u1 done',
      // The second call only reads after the create has committed.
      'getDoc u1',
      'updateDoc u1 Typed Name',
    ]);
    const stored = h.store.get('users/u1');
    expect(stored?.displayName).toBe('Typed Name');
    expect(stored?.email).toBe('');
    expect(stored?.hasSeenOnboarding).toBe(false);
    // The first (nameless) call created the doc WITHOUT a username, so the
    // second call's update generated it from the typed name — never from the
    // email's local part.
    expect(stored?.username).toBe('typed-name');
  });

  it('a call during the in-flight create cannot clobber a flag set after the create (no second setDoc)', async () => {
    const hold = deferred();
    h.holds.setDoc = hold.promise;
    const first = userService.syncUserProfile(user('u1', null));
    await flush();
    const second = userService.syncUserProfile(user('u1', 'Typed Name'));
    await flush();
    // Second caller is parked behind the in-flight one — it has not even read.
    expect(h.log).toEqual(['getDoc u1', 'setDoc u1']);
    delete h.holds.setDoc;
    hold.resolve();
    await first;
    // The user taps Skip on onboarding before the second call resumes.
    h.store.set('users/u1', { ...h.store.get('users/u1'), hasSeenOnboarding: true });
    await second;
    expect(h.log.filter((l) => l === 'setDoc u1')).toHaveLength(1);
    expect(h.store.get('users/u1')?.hasSeenOnboarding).toBe(true);
    expect(h.store.get('users/u1')?.displayName).toBe('Typed Name');
  });

  it('clears on success: a later sequential call runs its own update', async () => {
    await userService.syncUserProfile(user('u1', 'First'));
    h.log.length = 0;
    await userService.syncUserProfile(user('u1', 'Second'));
    expect(h.log).toEqual(['getDoc u1', 'updateDoc u1 Second']);
    expect(h.store.get('users/u1')?.displayName).toBe('Second');
  });

  it('clears on failure: the waiting call still runs (and creates), and so does the next one', async () => {
    const hold = deferred();
    h.holds.setDoc = hold.promise;
    h.holds.setDocError = Object.assign(new Error('denied'), { code: 'permission-denied' });
    const first = userService.syncUserProfile(user('u1', null));
    await flush();
    const second = userService.syncUserProfile(user('u1', 'Typed Name'));
    await flush();
    delete h.holds.setDoc;
    hold.resolve();
    await expect(first).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(second).resolves.toBeUndefined();
    expect(h.store.get('users/u1')?.displayName).toBe('Typed Name');

    h.log.length = 0;
    await userService.syncUserProfile(user('u1', 'Later'));
    expect(h.log).toEqual(['getDoc u1', 'updateDoc u1 Later']);
  });

  it('does not leak across uids: another user is never parked behind an in-flight create', async () => {
    const hold = deferred();
    h.holds.setDoc = hold.promise;
    const a = userService.syncUserProfile(user('uA', 'Alice'));
    await flush();
    // Release the hold for every LATER setDoc, but uA's stays parked.
    delete h.holds.setDoc;
    await userService.syncUserProfile(user('uB', 'Bob'));
    expect(h.store.get('users/uB')?.displayName).toBe('Bob');
    expect(h.store.has('users/uA')).toBe(false);
    hold.resolve();
    await a;
    expect(h.store.get('users/uA')?.displayName).toBe('Alice');
  });
});
