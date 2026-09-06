/**
 * Security-rules tests for /entitlements and /usage.
 *
 * These collections hold plan state and consumption counters. They are written
 * EXCLUSIVELY by the Admin SDK (the RevenueCat webhook and analyzeBill). A
 * client that could write them could grant itself Pro for free, so every client
 * write must be denied — including the owner's own.
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
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const OWNER = 'uid_owner';
const ATTACKER = 'uid_attacker';

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

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'entitlements', OWNER), {
      plan: 'free',
      source: 'revenuecat',
      productId: '',
      inGracePeriod: false,
    });
    await setDoc(doc(db, 'usage', OWNER), {
      scansThisPeriod: 0,
      rateCount: 0,
    });
  });
});

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asAttacker = () => testEnv.authenticatedContext(ATTACKER).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe('entitlements — plan state is Admin-SDK-only', () => {
  it('BLOCKS the owner granting themselves Pro', async () => {
    // The hole this closes: if this succeeded, Pro is free for anyone with devtools.
    await assertFails(updateDoc(doc(asOwner(), 'entitlements', OWNER), { plan: 'pro' }));
  });

  it('BLOCKS the owner creating an entitlement doc from scratch', async () => {
    await assertFails(setDoc(doc(asOwner(), 'entitlements', 'uid_fresh'), { plan: 'pro' }));
  });

  it('BLOCKS the owner deleting their entitlement doc', async () => {
    await assertFails(deleteDoc(doc(asOwner(), 'entitlements', OWNER)));
  });

  it("BLOCKS an attacker writing someone else's entitlement", async () => {
    await assertFails(updateDoc(doc(asAttacker(), 'entitlements', OWNER), { plan: 'pro' }));
  });

  it("BLOCKS an attacker reading someone else's entitlement", async () => {
    await assertFails(getDoc(doc(asAttacker(), 'entitlements', OWNER)));
  });

  it('BLOCKS an anonymous read', async () => {
    await assertFails(getDoc(doc(asAnon(), 'entitlements', OWNER)));
  });

  it('ALLOWS the owner to READ their own entitlement (paywall UI needs this)', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'entitlements', OWNER)));
  });
});

describe('usage — consumption counters are Admin-SDK-only', () => {
  it('BLOCKS the owner resetting their own scan counter', async () => {
    // The hole this closes: reset scansThisPeriod to 0 and the monthly cap never fires.
    await assertFails(updateDoc(doc(asOwner(), 'usage', OWNER), { scansThisPeriod: 0 }));
  });

  it('BLOCKS the owner resetting their rate-limit counter', async () => {
    await assertFails(updateDoc(doc(asOwner(), 'usage', OWNER), { rateCount: 0 }));
  });

  it("BLOCKS an attacker reading someone else's usage", async () => {
    await assertFails(getDoc(doc(asAttacker(), 'usage', OWNER)));
  });

  it('ALLOWS the owner to READ their own usage (quota indicator needs this)', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'usage', OWNER)));
  });
});

describe('users — documents why entitlements do NOT live on the profile', () => {
  it('CONFIRMS a user can still write arbitrary fields to their own profile', async () => {
    // Not a bug to fix here — `allow update: if request.auth.uid == userId`
    // (firestore.rules:40) is whole-document by design for profile fields.
    // This test exists so that if anyone ever moves `plan` onto users/{userId},
    // this passing assertion shows exactly why that grants free Pro.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER), { uid: OWNER, friends: [], squadIds: [] });
    });
    await assertSucceeds(updateDoc(doc(asOwner(), 'users', OWNER), { plan: 'pro' }));
  });
});
