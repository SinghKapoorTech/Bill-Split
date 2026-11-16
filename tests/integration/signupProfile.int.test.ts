// @vitest-environment jsdom
/**
 * Email/password signup → exactly one users/{uid} profile, written by
 * userService.syncUserProfile, with the typed name, a username, the onboarding
 * flag and NO unverified email.
 *
 * Runs the REAL useUserProfile hook, the REAL userService/profileSync and the
 * REAL firestore.rules (through the client SDK, so rules are enforced — the
 * Admin SDK used elsewhere in this suite bypasses them). Only the Firebase
 * Auth layer is modelled: the session is an emulator token carrying the typed
 * address with email_verified:false, which is exactly what
 * createUserWithEmailAndPassword produces.
 *
 * What a signup does (src/contexts/AuthContext.tsx):
 *   1. onAuthStateChanged fires → Dashboard mounts useUserProfile, and a
 *      background syncUserProfile(currentUser) starts with displayName null.
 *   2. signUpWithPassword: updateProfile(name) mutates that live user, sends
 *      the verification email, then calls syncUserProfile({... name}).
 * Before the fix the hook created the doc first with the typed (unverified)
 * email and no username, and both syncs were then permission-denied.
 *
 * Run: npm run test:integration
 */
import { readFileSync } from 'fs';
import path from 'path';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import {
  initializeTestEnvironment,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, onSnapshot, setDoc, Timestamp, type Firestore } from 'firebase/firestore';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthUserLike } from '@/utils/profileSync';

const st = vi.hoisted(() => ({
  db: null as unknown,
  user: null as unknown,
}));

// Full factories only: a partial mock with importOriginal would load
// src/config/firebase.ts and initialise a real app from .env.
vi.mock('@/config/firebase', () => ({
  get db() {
    return st.db;
  },
  auth: { currentUser: null },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: st.user }),
}));
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: () => undefined }),
}));

import { useUserProfile } from '@/hooks/useUserProfile';
import { userService } from '@/services/userService';

const ROOT = path.resolve(__dirname, '../..');
const N = Number(process.env.SIGNUP_RACE_N ?? 20);
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8081').split(':');

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-signup',
    firestore: {
      rules: readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'),
      host: EMU_HOST,
      port: Number(EMU_PORT),
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** "Typed Name 3 ab12cd" → "typed-name-3-ab12cd" (names here are unique, so no -N suffix). */
const slug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
const rand = () => Math.random().toString(36).slice(2, 8);

/** The session createUserWithEmailAndPassword hands the app: typed email, unverified. */
const passwordSession = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: false, firebase: { sign_in_provider: 'password' } })
    .firestore() as unknown as Firestore;

/** Firebase's live User after createUserWithEmailAndPassword — displayName not set yet. */
const liveUser = (uid: string, email: string): AuthUserLike => ({
  uid,
  email,
  emailVerified: false,
  providerData: [{ providerId: 'password', email }],
  displayName: null,
  photoURL: null,
});

/** Collects anything the app logs that mentions a permission failure. */
function watchConsole() {
  const seen: string[] = [];
  const record = (...args: unknown[]) => {
    const text = args.map((a) => (a instanceof Error ? `${a.message} ${(a as { code?: string }).code}` : String(a))).join(' ');
    if (/permission|PERMISSION_DENIED|insufficient/i.test(text)) seen.push(text);
  };
  vi.spyOn(console, 'error').mockImplementation(record);
  vi.spyOn(console, 'warn').mockImplementation(record);
  return seen;
}

type Mode = 'natural' | 'sameTick' | 'handlerFirst';

/** One signup, as AuthContext + Dashboard perform it. Returns what landed. */
async function signUp(mode: Mode, i: number) {
  const uid = `signup_${mode}_${i}_${rand()}`;
  const email = `${uid}@divit.test`;
  const name = `Typed Name ${i} ${rand()}`;
  const db = passwordSession(uid, email);
  st.db = db;
  const live = liveUser(uid, email);
  st.user = live;

  const failures: string[] = [];
  const syncOf = (who: string, u: AuthUserLike) =>
    userService.syncUserProfile(u).catch((e: { code?: string }) => {
      failures.push(`${who}:${e?.code ?? e}`);
    });
  // The handler builds its argument field by field with the typed name.
  const handlerUser = (): AuthUserLike => ({ ...live, displayName: name });

  // onAuthStateChanged → Dashboard mounts (useUserProfile) + background sync.
  const hook = renderHook(() => useUserProfile());
  let bg: Promise<void>;
  let handler: Promise<void>;

  if (mode === 'natural') {
    bg = syncOf('bg', live);
    await sleep(Math.floor(Math.random() * 15)); // updateProfile round trip
    live.displayName = name;
    await sleep(Math.floor(Math.random() * 15)); // sendEmailVerification
    handler = syncOf('h', handlerUser());
  } else if (mode === 'sameTick') {
    // Both calls start before either has read the doc, and the background
    // one never sees the name (updateProfile lands only after both settle):
    // the worst case for the typed name AND for the username seed.
    bg = syncOf('bg', live);
    handler = syncOf('h', handlerUser());
  } else {
    handler = syncOf('h', handlerUser());
    bg = syncOf('bg', live);
    live.displayName = name;
  }
  await Promise.all([bg, handler]);
  live.displayName = name;

  // The listener must deliver the profile — the app is not stuck loading.
  await waitFor(() => expect(hook.result.current.loading).toBe(false), { timeout: 5000 });
  await waitFor(() => expect(hook.result.current.profile?.displayName).toBe(name), { timeout: 5000 });
  const seenByHook = hook.result.current.profile;
  hook.unmount();

  const stored = (await getDoc(doc(db, 'users', uid))).data() ?? {};
  return { uid, name, stored, seenByHook, failures };
}

describe('C1 — email/password signup ends with one valid profile (real hook + service + rules)', () => {
  for (const mode of ['natural', 'sameTick', 'handlerFirst'] as const) {
    it(`mode=${mode} ×${N}: typed name, username, onboarding flag, email withheld, no denials`, async () => {
      const denied = watchConsole();
      for (let i = 0; i < N; i++) {
        const { uid, name, stored, seenByHook, failures } = await signUp(mode, i);
        expect(failures, `iteration ${i}`).toEqual([]);
        expect(stored.uid).toBe(uid);
        // The unverified typed address must never be published.
        expect(stored.email).toBe('');
        expect(stored.displayName).toBe(name);
        // Seeded from the TYPED name, never from the email's local part —
        // the address is unverified, and the handle is public and searchable.
        expect(stored.username).toBe(slug(name));
        expect(stored.hasSeenOnboarding).toBe(false);
        expect(stored.friends).toEqual([]);
        expect(seenByHook?.username).toBe(stored.username);
      }
      expect(denied).toEqual([]);
    }, 180_000);
  }

  it('Skip persists: markOnboardingSeen after signup lands and is not undone by a late sync', async () => {
    const { uid, name } = await signUp('natural', 0);
    await userService.markOnboardingSeen(uid);
    // A later login re-syncs the profile; the flag must survive it.
    await userService.syncUserProfile({ ...liveUser(uid, `${uid}@divit.test`), displayName: name });
    const stored = (await getDoc(doc(st.db as Firestore, 'users', uid))).data();
    expect(stored?.hasSeenOnboarding).toBe(true);
    expect(stored?.displayName).toBe(name);
  }, 30_000);
});

describe('C6 — backward compatibility with clients and data already in the field', () => {
  it('an OLD store build (hook creates with the typed email, two uncoordinated syncs) still ends with a valid profile', async () => {
    for (let i = 0; i < 5; i++) {
      const uid = `oldclient_${i}_${rand()}`;
      const email = `${uid}@divit.test`;
      const name = `Old Client ${i} ${rand()}`;
      const db = passwordSession(uid, email);
      st.db = db;
      const ref = doc(db, 'users', uid);

      // The old Dashboard listener: it stayed `loading` until a snapshot with
      // the doc arrived, so the app recovers only if SOMEONE creates the doc.
      // Wait for a server-confirmed doc: the old hook's own create first shows
      // up as an optimistic local snapshot, which the denial then rolls back.
      const arrived = new Promise<Record<string, unknown>>((resolve) => {
        const off = onSnapshot(ref, { includeMetadataChanges: true }, (snap) => {
          if (snap.exists() && !snap.metadata.hasPendingWrites) {
            off();
            resolve(snap.data());
          }
        });
      });

      // useUserProfile.ts@469f065:34-46 — denied now (unverified email).
      const now = Timestamp.now();
      await assertFails(
        setDoc(ref, {
          uid, email, displayName: '', friends: [], squadIds: [], createdAt: now, lastLoginAt: now,
        }),
      );

      // The old userService had no single-flight: model it with two
      // independent module instances racing each other.
      vi.resetModules();
      const a = (await import('@/services/userService')).userService;
      vi.resetModules();
      const b = (await import('@/services/userService')).userService;
      expect(a).not.toBe(b);
      const live = liveUser(uid, email);
      await Promise.all([
        a.syncUserProfile(live),
        b.syncUserProfile({ ...live, displayName: name }),
      ]);

      const data = await Promise.race([
        arrived,
        sleep(5000).then(() => {
          throw new Error('old client would hang: profile doc never arrived');
        }),
      ]);
      expect(data.email).toBe('');
      expect(typeof data.username).toBe('string');
      expect(data.hasSeenOnboarding).toBe(false);

      // Either sync may win the create; a later login always lands the name.
      await a.syncUserProfile({ ...live, displayName: name });
      const stored = (await getDoc(ref)).data();
      expect(stored?.displayName).toBe(name);
      expect(stored?.email).toBe('');
      expect(stored?.username).toBe(data.username);
    }
  }, 60_000);

  it('an existing profile (verified email stored, no username) still updates on login', async () => {
    const uid = `existing_${rand()}`;
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', uid), {
        uid,
        email: 'kept@example.com',
        displayName: 'Old Name',
        friends: [],
        squadIds: [],
        hasSeenOnboarding: true,
        lastLoginAt: Timestamp.fromMillis(1_000),
      });
    });
    // A later password-linked session whose new address is not verified yet.
    st.db = passwordSession(uid, 'new-unverified@example.com');
    await userService.syncUserProfile({
      ...liveUser(uid, 'new-unverified@example.com'),
      displayName: 'New Name',
    });
    const stored = (await getDoc(doc(st.db as Firestore, 'users', uid))).data();
    expect(stored?.displayName).toBe('New Name');
    expect(stored?.email).toBe('kept@example.com');
    expect(stored?.username).toBe('new-name');
    expect(stored?.hasSeenOnboarding).toBe(true);
    expect((stored?.lastLoginAt as Timestamp).toMillis()).toBeGreaterThan(1_000);
  }, 30_000);

  for (const [provider, email] of [
    ['google.com', 'g-user@gmail.com'],
    ['apple.com', 'xyz987@privaterelay.appleid.com'],
  ] as const) {
    it(`a ${provider} first sign-in creates the profile WITH its verified email`, async () => {
      const uid = `${provider.split('.')[0]}_${rand()}`;
      st.db = testEnv
        .authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: provider } })
        .firestore();
      await userService.syncUserProfile({
        uid,
        email,
        emailVerified: true,
        providerData: [{ providerId: provider, email }],
        displayName: 'Provider Person',
        photoURL: null,
      });
      const stored = (await getDoc(doc(st.db as Firestore, 'users', uid))).data();
      expect(stored?.email).toBe(email);
      expect(stored?.displayName).toBe('Provider Person');
      expect(stored?.username).toBe('provider-person');
      expect(stored?.hasSeenOnboarding).toBe(false);
    }, 30_000);

    it(`a ${provider} first sign-in whose token is NOT email_verified still gets a profile (email withheld)`, async () => {
      // The provider entry matches the address, but the token does not vouch
      // for it — the create rule would deny publishing it, and syncUserProfile
      // is the only creator, so it must withhold rather than fail.
      const uid = `${provider.split('.')[0]}_unverified_${rand()}`;
      st.db = testEnv
        .authenticatedContext(uid, { email, email_verified: false, firebase: { sign_in_provider: provider } })
        .firestore();
      await userService.syncUserProfile({
        uid,
        email,
        emailVerified: false,
        providerData: [{ providerId: provider, email }],
        displayName: 'Provider Person',
        photoURL: null,
      });
      const stored = (await getDoc(doc(st.db as Firestore, 'users', uid))).data();
      expect(stored?.uid).toBe(uid);
      expect(stored?.email).toBe('');
      expect(stored?.displayName).toBe('Provider Person');
      expect(stored?.username).toBe('provider-person');
    }, 30_000);
  }
});
