/**
 * Security-rules tests for /entitlements, /usage and /webhook_events.
 *
 * These collections hold plan state, consumption counters, and the RevenueCat
 * webhook replay ledger that keeps one payment from granting twice. They are written
 * EXCLUSIVELY by the Admin SDK (the RevenueCat webhook and analyzeBill). A
 * client that could write them could grant itself Pro for free, so every client
 * write must be denied — including the owner's own.
 *
 * Why entitlement state does NOT live on users/{userId}:
 * `firestore.rules` grants `allow update: if request.auth.uid == userId` on
 * user profile documents, which is a whole-document self-update rule with no
 * field allowlist (firestore.rules:40). If a `plan` field were ever added to
 * the user profile instead of a dedicated collection, that same rule would let
 * any authenticated user write `{ plan: 'pro' }` to their own profile document
 * and grant themselves Pro for free — no bypass required, just a normal
 * client-side `updateDoc`. That's why entitlements and usage are split into
 * their own collections with `allow write: if false`, rather than folded into
 * the profile doc that clients are already allowed to update.
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
    projectId: 'demo-bill-split-rules-entitlements',
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
    await setDoc(doc(db, 'webhook_events', 'evt_seen'), {
      type: 'NON_RENEWING_PURCHASE',
      uid: OWNER,
      mutation: 'extend-trip-pass',
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

  it('BLOCKS the owner creating a usage doc from scratch', async () => {
    // The hole this closes: create usage/{uid} with scansThisPeriod: 0 to
    // defeat the monthly scan cap before a doc exists for this user.
    await assertFails(
      setDoc(doc(asOwner(), 'usage', 'uid_fresh'), { scansThisPeriod: 0, rateCount: 0 }),
    );
  });

  it('BLOCKS the owner deleting their usage doc', async () => {
    // The hole this closes: delete then recreate usage/{uid} to reset the quota.
    await assertFails(deleteDoc(doc(asOwner(), 'usage', OWNER)));
  });
});

describe('webhook_events — the replay ledger is Admin-SDK-only', () => {
  // The hole this closes: `webhook_events/{eventId}` is the ONLY thing standing
  // between a RevenueCat retry (or a replayed payload) and a second grant. A
  // client that could delete a row here could replay one NON_RENEWING_PURCHASE
  // and stack a second 14-day Trip Pass onto one payment; a client that could
  // write one could poison the ledger so a real purchase is dropped as a
  // "duplicate". Unlike entitlements/usage, there is no owner-read case either
  // — nothing in the app renders this, and its contents leak purchase history.
  it('BLOCKS the owner reading a webhook event row', async () => {
    await assertFails(getDoc(doc(asOwner(), 'webhook_events', 'evt_seen')));
  });

  it('BLOCKS an anonymous read', async () => {
    await assertFails(getDoc(doc(asAnon(), 'webhook_events', 'evt_seen')));
  });

  it('BLOCKS deleting a row (the replay guard)', async () => {
    await assertFails(deleteDoc(doc(asOwner(), 'webhook_events', 'evt_seen')));
  });

  it('BLOCKS creating a row (poisoning the guard so a real purchase is dropped)', async () => {
    await assertFails(
      setDoc(doc(asOwner(), 'webhook_events', 'evt_future'), { uid: OWNER, mutation: 'ignore' }),
    );
  });

  it('BLOCKS updating an existing row', async () => {
    await assertFails(updateDoc(doc(asOwner(), 'webhook_events', 'evt_seen'), { uid: ATTACKER }));
  });

  it("BLOCKS an attacker touching someone else's row", async () => {
    await assertFails(deleteDoc(doc(asAttacker(), 'webhook_events', 'evt_seen')));
  });
});
