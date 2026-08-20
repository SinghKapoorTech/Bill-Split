/**
 * Security-rules tests for /users and /squads.
 *
 * These exercise the REAL firestore.rules through the client SDK, so rules are
 * enforced. (tests/integration/* uses the Admin SDK, which bypasses rules —
 * nothing there can catch a rules regression.)
 *
 * Run: npm run test:rules
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, collection, getDocs, query, limit, where, documentId,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const OWNER = 'uid_owner';
const ATTACKER = 'uid_attacker';
const VICTIM = 'uid_victim';
const SHADOW_OF_OWNER = 'shadow_owned_by_owner';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules',
    firestore: {
      rules: readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8081,
    },
  });
});

afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const profile = (uid: string, extra: Record<string, unknown> = {}) => ({
      uid,
      email: `${uid}@example.com`,
      displayName: uid,
      username: uid,
      phoneNumber: '+15550000000',
      venmoId: `venmo-${uid}`,
      friends: [],
      squadIds: [],
      ...extra,
    });
    await setDoc(doc(db, 'users', OWNER), profile(OWNER));
    await setDoc(doc(db, 'users', VICTIM), profile(VICTIM, { squadIds: ['squad_legit'] }));
    await setDoc(doc(db, 'users', ATTACKER), profile(ATTACKER));
    await setDoc(doc(db, 'users', SHADOW_OF_OWNER), profile(SHADOW_OF_OWNER, {
      isShadow: true,
      createdById: OWNER,
    }));
    await setDoc(doc(db, 'squads', 'squad_legit'), {
      id: 'squad_legit', name: 'Legit', memberIds: [OWNER, VICTIM],
    });
  });
});

const asAttacker = () => testEnv.authenticatedContext(ATTACKER).firestore();
const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();

describe('B2 — profile reads must not be dumpable', () => {
  it('BLOCKS an unbounded dump of the whole users collection', async () => {
    // The hole: one query exfiltrates every email, phone, venmoId and friend graph.
    await assertFails(getDocs(collection(asAttacker(), 'users')));
  });

  it('BLOCKS a query whose limit exceeds the cap', async () => {
    await assertFails(getDocs(query(collection(asAttacker(), 'users'), limit(500))));
  });

  it('ALLOWS reading a single profile by id (settlements, events, squads need this)', async () => {
    await assertSucceeds(getDoc(doc(asAttacker(), 'users', VICTIM)));
  });

  it('ALLOWS a bounded query — username search', async () => {
    await assertSucceeds(getDocs(query(
      collection(asOwner(), 'users'),
      where('username', '>=', 'uid'), where('username', '<=', 'uid\uf8ff'),
      limit(5),
    )));
  });

  it('ALLOWS a bounded documentId() batch fetch — friends / squad hydration', async () => {
    await assertSucceeds(getDocs(query(
      collection(asOwner(), 'users'),
      where(documentId(), 'in', [VICTIM, ATTACKER]),
      limit(30),
    )));
  });
});

describe('squads — member-scoped reads, server-only writes', () => {
  it('ALLOWS a member to read their squad', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'squads', 'squad_legit')));
  });

  it('BLOCKS a non-member from reading a squad by id', async () => {
    await assertFails(getDoc(doc(asAttacker(), 'squads', 'squad_legit')));
  });

  it('treats a missing squad as not-found, not permission-denied', async () => {
    // Regression: dereferencing resource.data on a missing document raises an
    // evaluation error, so a deleted squad or stale link surfaced as
    // permission-denied in SquadDetailView instead of a clean empty state.
    await assertSucceeds(getDoc(doc(asOwner(), 'squads', 'no_such_squad')));
  });

  it('BLOCKS all client writes to squads — the callables are the only writer', async () => {
    await assertFails(setDoc(doc(asOwner(), 'squads', 'squad_new'), {
      id: 'squad_new', name: 'Mine', memberIds: [OWNER],
    }));
    await assertFails(updateDoc(doc(asOwner(), 'squads', 'squad_legit'), { name: 'Renamed' }));
  });
});


describe('B3 — nobody may write another user\'s document', () => {
  it('BLOCKS writing squadIds onto a stranger\'s profile', async () => {
    // The hole: forces a victim into an attacker-controlled squad, which grants
    // read/write on that squad's bills.
    await assertFails(updateDoc(doc(asAttacker(), 'users', VICTIM), {
      squadIds: ['squad_attacker'],
    }));
  });

  it('BLOCKS rewriting a shadow user created by someone else', async () => {
    await assertFails(updateDoc(doc(asAttacker(), 'users', SHADOW_OF_OWNER), {
      displayName: 'pwned', email: 'attacker@example.com',
    }));
  });

  it('BLOCKS creating a shadow user attributed to someone else', async () => {
    await assertFails(setDoc(doc(asAttacker(), 'users', 'shadow_forged'), {
      uid: 'shadow_forged', displayName: 'forged',
      isShadow: true, createdById: OWNER, friends: [], squadIds: [],
    }));
  });

  it('BLOCKS editing a real user\'s venmoId', async () => {
    await assertFails(updateDoc(doc(asAttacker(), 'users', VICTIM), { venmoId: 'attacker' }));
  });

  it('ALLOWS a user to update their own profile', async () => {
    await assertSucceeds(updateDoc(doc(asAttacker(), 'users', ATTACKER), { venmoId: 'mine' }));
  });

  it('ALLOWS creating a shadow user you attribute to yourself', async () => {
    await assertSucceeds(setDoc(doc(asOwner(), 'users', 'shadow_new'), {
      uid: 'shadow_new', displayName: 'Guest', username: 'guest1',
      isShadow: true, createdById: OWNER, friends: [], squadIds: [],
    }));
  });

  it('ALLOWS the creator to update their own shadow user', async () => {
    await assertSucceeds(updateDoc(doc(asOwner(), 'users', SHADOW_OF_OWNER), {
      displayName: 'Renamed Guest',
    }));
  });
});
