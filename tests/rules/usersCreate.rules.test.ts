/**
 * Security-rules tests for CREATING a users/{uid} document.
 *
 * `email` on a profile is not free text: `userService.getUserByContact`
 * queries it to decide WHO a friend means when they add someone by email, so
 * an address written here routes real debts to whoever owns the document. The
 * update rule already required a verified claim (emailSelfClaimIsHonest), but
 * the create rule had no email constraint at all — an email/password session
 * could create its own profile carrying any address it merely typed. On every
 * signup the old useUserProfile hook did exactly that with the unverified
 * address, and both profile syncs that followed were then denied.
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
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const NEWBIE = 'uid_newbie';
const CREATOR = 'uid_creator';
const REAL_USER = 'uid_real_user';
const TYPED_EMAIL = 'newbie@example.com';
const VICTIM_EMAIL = 'victim@example.com';

let testEnv: RulesTestEnvironment;

/** An email/password session: the token carries the typed address, unverified. */
const unverified = (uid: string, email: string) =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: false, firebase: { sign_in_provider: 'password' } })
    .firestore();

/** A Google / Apple session, or a password user who clicked the link. */
const verified = (uid: string, email: string, provider = 'google.com') =>
  testEnv
    .authenticatedContext(uid, { email, email_verified: true, firebase: { sign_in_provider: provider } })
    .firestore();

/** The shape userService.syncUserProfile writes for a first sign-in. */
const newProfile = (uid: string, email: string, extra: Record<string, unknown> = {}) => ({
  uid,
  email,
  displayName: 'Typed Name',
  username: 'typed-name',
  friends: [],
  squadIds: [],
  hasSeenOnboarding: false,
  ...extra,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules-userscreate',
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
    // A real (non-shadow) profile that predates every shadow field: no
    // isShadow, no createdById. The shadow branches must DENY on it cleanly.
    await setDoc(doc(ctx.firestore(), 'users', REAL_USER), {
      uid: REAL_USER,
      email: 'real@example.com',
      displayName: 'Real User',
      username: 'real-user',
      friends: [],
      squadIds: [],
    });
  });
});

describe('own profile create — email must be withheld or verified', () => {
  it('DENIES an unverified session publishing the address it typed', async () => {
    // The exact write the old useUserProfile hook made on every signup.
    await assertFails(setDoc(doc(unverified(NEWBIE, TYPED_EMAIL), 'users', NEWBIE), newProfile(NEWBIE, TYPED_EMAIL)));
  });

  it('DENIES an unverified session publishing someone else\'s address', async () => {
    await assertFails(setDoc(doc(unverified(NEWBIE, VICTIM_EMAIL), 'users', NEWBIE), newProfile(NEWBIE, VICTIM_EMAIL)));
  });

  it('DENIES a verified session publishing an address that is not its own', async () => {
    await assertFails(setDoc(doc(verified(NEWBIE, TYPED_EMAIL), 'users', NEWBIE), newProfile(NEWBIE, VICTIM_EMAIL)));
  });

  it('ALLOWS an unverified session to create its profile with email withheld (\'\')', async () => {
    const db = unverified(NEWBIE, TYPED_EMAIL);
    await assertSucceeds(setDoc(doc(db, 'users', NEWBIE), newProfile(NEWBIE, '')));
    const stored = (await getDoc(doc(db, 'users', NEWBIE))).data();
    expect(stored?.email).toBe('');
    expect(stored?.username).toBe('typed-name');
  });

  it('ALLOWS a create that carries no email field at all', async () => {
    await assertSucceeds(
      setDoc(doc(unverified(NEWBIE, TYPED_EMAIL), 'users', NEWBIE), { uid: NEWBIE, friends: [] }, { merge: true }),
    );
  });

  it('DENIES an own create whose uid FIELD names someone else', async () => {
    // getUserByContact returns data().uid, so this would route debts to REAL_USER.
    await assertFails(
      setDoc(doc(unverified(NEWBIE, TYPED_EMAIL), 'users', NEWBIE), newProfile(NEWBIE, '', { uid: REAL_USER })),
    );
  });

  it('DENIES an own create with no uid field', async () => {
    await assertFails(
      setDoc(doc(unverified(NEWBIE, TYPED_EMAIL), 'users', NEWBIE), { email: '', friends: [] }, { merge: true }),
    );
  });

  it('ALLOWS a Google first sign-in to publish its verified address', async () => {
    const db = verified(NEWBIE, TYPED_EMAIL, 'google.com');
    await assertSucceeds(setDoc(doc(db, 'users', NEWBIE), newProfile(NEWBIE, TYPED_EMAIL)));
    expect((await getDoc(doc(db, 'users', NEWBIE))).data()?.email).toBe(TYPED_EMAIL);
  });

  it('ALLOWS an Apple first sign-in to publish its verified relay address', async () => {
    const relay = 'abc123@privaterelay.appleid.com';
    const db = verified(NEWBIE, relay, 'apple.com');
    await assertSucceeds(setDoc(doc(db, 'users', NEWBIE), newProfile(NEWBIE, relay)));
    expect((await getDoc(doc(db, 'users', NEWBIE))).data()?.email).toBe(relay);
  });

  it('DENIES the self-shadow detour: own uid marked isShadow with an unverified address', async () => {
    // Without a uid check the shadow branch would accept this, and the shadow
    // UPDATE branch would then let the same session rewrite email at will.
    await assertFails(
      setDoc(
        doc(unverified(NEWBIE, VICTIM_EMAIL), 'users', NEWBIE),
        newProfile(NEWBIE, VICTIM_EMAIL, { isShadow: true, createdById: NEWBIE }),
      ),
    );
  });
  it('DENIES creating your own doc as a "shadow" credited to a second account', async () => {
    // Two-account detour: A's own doc marked isShadow with createdById B would
    // let B rewrite A's email through the shadow UPDATE branch (B != A).
    await assertFails(
      setDoc(
        doc(unverified(NEWBIE, TYPED_EMAIL), 'users', NEWBIE),
        newProfile(NEWBIE, '', { isShadow: true, createdById: CREATOR }),
      ),
    );
  });
});

describe('shadow-user create — friend\'s email kept, non-shadow docs denied cleanly', () => {
  it('ALLOWS a creator (even unverified) to create a shadow carrying a friend\'s email', async () => {
    const db = unverified(CREATOR, 'creator@example.com');
    await assertSucceeds(
      setDoc(doc(db, 'users', 'shadow_new'), {
        uid: 'shadow_new',
        displayName: 'Friend',
        email: 'friend@example.com',
        friends: [],
        squadIds: [],
        isShadow: true,
        createdById: CREATOR,
      }),
    );
    expect((await getDoc(doc(db, 'users', 'shadow_new'))).data()?.email).toBe('friend@example.com');
  });

  it('DENIES a doc at a foreign id that only claims createdById (no isShadow field)', async () => {
    await assertFails(
      setDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', 'foreign_id'), {
        uid: 'foreign_id',
        email: 'friend@example.com',
        displayName: 'Friend',
        createdById: CREATOR,
      }),
    );
  });

  it('DENIES a shadow whose uid FIELD names a real user (impostor routing)', async () => {
    await assertFails(
      setDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', 'shadow_new'), {
        uid: REAL_USER,
        displayName: 'Friend',
        email: 'friend@example.com',
        isShadow: true,
        createdById: CREATOR,
      }),
    );
  });

  it('DENIES a shadow create that names no creator (createdById missing)', async () => {
    await assertFails(
      setDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', 'foreign_id'), {
        uid: 'foreign_id',
        email: 'friend@example.com',
        isShadow: true,
      }),
    );
  });

  it('DENIES a doc at a foreign id with isShadow:false', async () => {
    await assertFails(
      setDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', 'foreign_id'), {
        uid: 'foreign_id',
        email: 'friend@example.com',
        isShadow: false,
        createdById: CREATOR,
      }),
    );
  });
});

describe('update — shadow branch denies cleanly on a real profile', () => {
  it('DENIES a stranger updating a real profile that has no isShadow/createdById', async () => {
    await assertFails(updateDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', REAL_USER), { displayName: 'x' }));
  });

  it('DENIES a stranger turning a real profile into "their" shadow', async () => {
    await assertFails(
      updateDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', REAL_USER), {
        isShadow: true,
        createdById: CREATOR,
      }),
    );
  });

  it('DENIES the old creator re-shadowing a doc that kept createdById but has no isShadow', async () => {
    // e.g. a tombstone or a claimed profile: createdById left behind, isShadow
    // gone. Its former creator must not be able to take it back over.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'former_shadow'), {
        uid: 'former_shadow',
        email: 'claimed@example.com',
        displayName: 'Claimed',
        createdById: CREATOR,
      });
    });
    await assertFails(
      updateDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', 'former_shadow'), {
        isShadow: true,
        email: 'redirected@example.com',
      }),
    );
  });

  it('DENIES an existing self-uid "shadow" rewriting its own email to an unverified address', async () => {
    // A doc that names its own owner as shadow creator (written before the
    // create rule checked the uid). The owner branch alone must decide email.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', NEWBIE), newProfile(NEWBIE, '', { isShadow: true, createdById: NEWBIE }));
    });
    const db = unverified(NEWBIE, VICTIM_EMAIL);
    await assertFails(updateDoc(doc(db, 'users', NEWBIE), { email: VICTIM_EMAIL }));
    // The owner may still edit fields that do not touch email.
    await assertSucceeds(updateDoc(doc(db, 'users', NEWBIE), { displayName: 'Still Editable' }));
  });

  it('DENIES the owner turning their existing profile into a shadow credited to a second account', async () => {
    const owner = unverified(REAL_USER, 'real@example.com');
    await assertFails(updateDoc(doc(owner, 'users', REAL_USER), { isShadow: true, createdById: CREATOR }));
    // …so the second account can never reach it through the shadow branch.
    await assertFails(
      updateDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', REAL_USER), { email: VICTIM_EMAIL }),
    );
    expect((await getDoc(doc(owner, 'users', REAL_USER))).data()?.email).toBe('real@example.com');
  });

  it('DENIES delete-then-reshadow: the owner cannot delete, so a second account cannot re-create the id as its shadow', async () => {
    const owner = unverified(REAL_USER, 'real@example.com');
    await assertFails(deleteDoc(doc(owner, 'users', REAL_USER)));
    // The doc still exists, so this is an UPDATE on a non-shadow: denied.
    await assertFails(
      setDoc(doc(verified(CREATOR, 'creator@example.com'), 'users', REAL_USER), {
        uid: REAL_USER,
        email: VICTIM_EMAIL,
        isShadow: true,
        createdById: CREATOR,
      }),
    );
    const stored = (await getDoc(doc(owner, 'users', REAL_USER))).data();
    expect(stored?.email).toBe('real@example.com');
    expect(stored?.isShadow).toBeUndefined();
  });

  it('DENIES the owner rewriting the uid field of their profile', async () => {
    await assertFails(updateDoc(doc(unverified(REAL_USER, 'real@example.com'), 'users', REAL_USER), { uid: NEWBIE }));
  });

  it('DENIES a shadow creator rewriting the shadow\'s uid field', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'shadow_x'), {
        uid: 'shadow_x', displayName: 'Guest', isShadow: true, createdById: CREATOR,
      });
    });
    const db = verified(CREATOR, 'creator@example.com');
    await assertFails(updateDoc(doc(db, 'users', 'shadow_x'), { uid: REAL_USER }));
    await assertSucceeds(updateDoc(doc(db, 'users', 'shadow_x'), { email: 'friend@example.com' }));
  });

  it('ALLOWS updating a legacy profile that has no uid field, as long as none is added', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'legacy_no_uid'), { displayName: 'Legacy', email: '' });
    });
    const db = unverified('legacy_no_uid', 'legacy@example.com');
    await assertSucceeds(updateDoc(doc(db, 'users', 'legacy_no_uid'), { displayName: 'Legacy Renamed', lastLoginAt: new Date() }));
    expect((await getDoc(doc(db, 'users', 'legacy_no_uid'))).data()?.displayName).toBe('Legacy Renamed');
    await assertFails(updateDoc(doc(db, 'users', 'legacy_no_uid'), { uid: REAL_USER }));
  });

  it('ALLOWS the owner of an existing profile to sync lastLoginAt + name with the stored email', async () => {
    const db = unverified(REAL_USER, 'real@example.com');
    await assertSucceeds(
      updateDoc(doc(db, 'users', REAL_USER), {
        displayName: 'Renamed',
        email: 'real@example.com',
        lastLoginAt: new Date(),
      }),
    );
    expect((await getDoc(doc(db, 'users', REAL_USER))).data()?.displayName).toBe('Renamed');
  });
});
