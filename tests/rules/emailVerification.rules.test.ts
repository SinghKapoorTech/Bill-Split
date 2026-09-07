/**
 * Security-rules tests for email-based authorization.
 *
 * Three rules authorize access on `request.auth.token.email` alone:
 *   - events read           (event is visible to anyone invited by email)
 *   - events update         (an invited user may add themselves to memberIds)
 *   - eventInvitations      (read + update your own invitation)
 *
 * That was safe while every account came from Google or Apple, who verify the
 * address before Firebase ever sees it. It stops being safe the moment
 * `createUserWithEmailAndPassword` exists: an attacker registers
 * victim@example.com, receives a genuine ID token carrying that email with
 * `email_verified: false`, and joins every event the victim was invited to —
 * gaining read access to that event's bills, receipt images and balances.
 *
 * The client-side gate in `acceptPendingInvitations` does not help here. It is
 * skipped entirely by calling updateDoc directly against Firestore.
 *
 * The same class of hole exists on /users: the self-update branch let a user
 * write ANY value to their own `email` field, and `userService.getUserByContact`
 * queries that field to decide who a friend means when adding someone by email.
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
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const VICTIM_EMAIL = 'victim@example.com';
const OWNER = 'uid_owner';
const MEMBER = 'uid_member';
const ATTACKER = 'uid_attacker';

let testEnv: RulesTestEnvironment;

/** A session whose token carries an email the provider never verified. */
const unverified = (uid: string, email: string) =>
  testEnv.authenticatedContext(uid, { email, email_verified: false }).firestore();

/** A session whose email the provider (or a confirmation link) verified. */
const verified = (uid: string, email: string) =>
  testEnv.authenticatedContext(uid, { email, email_verified: true }).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules-emailverif',
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

    await setDoc(doc(db, 'events', 'event_1'), {
      name: 'Vegas Weekend',
      ownerId: OWNER,
      memberIds: [OWNER, MEMBER],
      pendingInvites: [VICTIM_EMAIL],
    });

    await setDoc(doc(db, 'eventInvitations', 'invite_1'), {
      email: VICTIM_EMAIL,
      eventId: 'event_1',
      invitedBy: OWNER,
      status: 'pending',
    });

    // A profile created back when every address came from a verifying
    // provider. Nothing about it may break.
    await setDoc(doc(db, 'users', OWNER), {
      uid: OWNER,
      email: 'owner@gmail.com',
      displayName: 'Owner',
      username: 'owner',
      friends: [],
      squadIds: [],
    });

    await setDoc(doc(db, 'users', ATTACKER), {
      uid: ATTACKER,
      email: '',
      displayName: 'Attacker',
      username: 'attacker',
      friends: [],
      squadIds: [],
    });
  });
});

describe('events invited by email', () => {
  it('are NOT readable by an unverified claim on the invited address', async () => {
    const db = unverified(ATTACKER, VICTIM_EMAIL);
    await assertFails(getDoc(doc(db, 'events', 'event_1')));
  });

  it('cannot be joined by an unverified claim on the invited address', async () => {
    const db = unverified(ATTACKER, VICTIM_EMAIL);
    await assertFails(
      updateDoc(doc(db, 'events', 'event_1'), {
        memberIds: [OWNER, MEMBER, ATTACKER],
        pendingInvites: [],
      })
    );
  });

  it('ARE readable once the invited user verifies that address', async () => {
    const db = verified('uid_victim', VICTIM_EMAIL);
    await assertSucceeds(getDoc(doc(db, 'events', 'event_1')));
  });

  it('CAN be joined once the invited user verifies that address', async () => {
    const db = verified('uid_victim', VICTIM_EMAIL);
    await assertSucceeds(
      updateDoc(doc(db, 'events', 'event_1'), {
        memberIds: [OWNER, MEMBER, 'uid_victim'],
        pendingInvites: [],
      })
    );
  });

  // Regression guards: these paths authorize on uid, not on email, and must be
  // completely unaffected by the verification requirement.
  it('remain updatable by an existing member regardless of verification', async () => {
    const db = unverified(MEMBER, 'member@anything.com');
    await assertSucceeds(
      updateDoc(doc(db, 'events', 'event_1'), { pendingInvites: [VICTIM_EMAIL, 'x@y.com'] })
    );
  });

  it('remain fully updatable by their owner', async () => {
    const db = unverified(OWNER, 'owner@gmail.com');
    await assertSucceeds(updateDoc(doc(db, 'events', 'event_1'), { name: 'Renamed' }));
  });
});

describe('eventInvitations', () => {
  it('are NOT readable by an unverified claim on the invited address', async () => {
    const db = unverified(ATTACKER, VICTIM_EMAIL);
    await assertFails(getDoc(doc(db, 'eventInvitations', 'invite_1')));
  });

  it('cannot be accepted by an unverified claim on the invited address', async () => {
    const db = unverified(ATTACKER, VICTIM_EMAIL);
    await assertFails(
      updateDoc(doc(db, 'eventInvitations', 'invite_1'), { status: 'accepted' })
    );
  });

  it('are readable and acceptable once that address is verified', async () => {
    const db = verified('uid_victim', VICTIM_EMAIL);
    await assertSucceeds(getDoc(doc(db, 'eventInvitations', 'invite_1')));
    await assertSucceeds(
      updateDoc(doc(db, 'eventInvitations', 'invite_1'), { status: 'accepted' })
    );
  });

  it('remain readable by the person who sent them', async () => {
    const db = unverified(OWNER, 'owner@gmail.com');
    await assertSucceeds(getDoc(doc(db, 'eventInvitations', 'invite_1')));
  });
});

describe('users/{uid}.email is a verified claim, not free text', () => {
  it('cannot be set to an address the caller has not verified', async () => {
    const db = unverified(ATTACKER, 'attacker@example.com');
    await assertFails(updateDoc(doc(db, 'users', ATTACKER), { email: VICTIM_EMAIL }));
  });

  it('cannot be set to a verified caller\'s OTHER address', async () => {
    // Token says attacker@example.com is verified; that does not license
    // writing somebody else's address into the field friends search by.
    const db = verified(ATTACKER, 'attacker@example.com');
    await assertFails(updateDoc(doc(db, 'users', ATTACKER), { email: VICTIM_EMAIL }));
  });

  it('CAN be set to the caller\'s own verified address', async () => {
    const db = verified(ATTACKER, 'attacker@example.com');
    await assertSucceeds(
      updateDoc(doc(db, 'users', ATTACKER), { email: 'attacker@example.com' })
    );
  });

  // BACKWARD COMPATIBILITY (CLAUDE.md rule 4). Every profile in production was
  // written before this rule existed. Ordinary edits that do not touch `email`
  // must keep working, including from sessions whose token email differs from
  // the stored one.
  it('does not block edits that leave email untouched', async () => {
    const db = verified(OWNER, 'owner@gmail.com');
    await assertSucceeds(updateDoc(doc(db, 'users', OWNER), { venmoId: 'owner-venmo' }));
  });

  it('does not block an unverified session from editing non-email fields', async () => {
    const db = unverified(OWNER, 'owner@gmail.com');
    await assertSucceeds(updateDoc(doc(db, 'users', OWNER), { displayName: 'Owner Renamed' }));
  });

  it('still lets a user rewrite the same stored email as part of a profile sync', async () => {
    const db = verified(OWNER, 'owner@gmail.com');
    await assertSucceeds(
      updateDoc(doc(db, 'users', OWNER), {
        displayName: 'Owner',
        email: 'owner@gmail.com',
      })
    );
  });
});

describe('shadow users keep working', () => {
  // Their creator writes an email on their behalf — that address is NOT the
  // creator's own token email, and it must stay allowed. Shadow users are
  // stand-ins for people who have not signed up, so nobody is self-claiming
  // an identity here.
  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'shadow_1'), {
        uid: 'shadow_1',
        displayName: 'Guest',
        isShadow: true,
        createdById: OWNER,
        friends: [],
        squadIds: [],
      });
    });
  });

  it('can be given a contact email by their creator', async () => {
    const db = verified(OWNER, 'owner@gmail.com');
    await assertSucceeds(
      updateDoc(doc(db, 'users', 'shadow_1'), {
        isShadow: true,
        createdById: OWNER,
        email: 'friend-who-hasnt-signed-up@example.com',
      })
    );
  });
});
