/**
 * Security-rules tests for /events, focused on the ARCHIVE flag.
 *
 * Archiving is owner-only, and it is enforced entirely by rules that already
 * exist: the events `allow update` gives the owner unrestricted access, while
 * members and pending invitees are confined to
 * `onlyUpdating(['memberIds','pendingInvites','updatedAt'])`. A member writing
 * `archived` is denied by construction (firestore.rules:61-68).
 *
 * "By construction" is exactly the kind of claim that rots silently. Nothing
 * asserted it before this file, so widening that allowlist — or adding an
 * `archived` escape hatch for some future auto-archive feature — would hand
 * any member the power to hide an event out from under its owner, with no test
 * going red. Hence a test whose whole job is to fail if the allowlist grows.
 *
 * Own projectId: the tests/rules suites share one emulator and each calls
 * clearFirestore(), which is only safe while fileParallelism stays false.
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
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const OWNER = 'uid_owner';
const MEMBER = 'uid_member';
const INVITEE = 'uid_invitee';
const INVITEE_EMAIL = 'invitee@example.com';
const STRANGER = 'uid_stranger';
const EVENT = 'event_vegas';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules-events',
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
    // Seeded WITHOUT an `archived` field, exactly like every event document
    // that predates this feature.
    await setDoc(doc(ctx.firestore(), 'events', EVENT), {
      name: 'Vegas Weekend',
      description: '',
      ownerId: OWNER,
      memberIds: [OWNER, MEMBER],
      pendingInvites: [INVITEE_EMAIL],
    });
  });
});

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asMember = () => testEnv.authenticatedContext(MEMBER).firestore();
const asInvitee = () =>
  testEnv.authenticatedContext(INVITEE, { email: INVITEE_EMAIL }).firestore();
const asStranger = () => testEnv.authenticatedContext(STRANGER).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe('events — only the owner may archive', () => {
  it('BLOCKS a member archiving an event they do not own', async () => {
    // The hole this closes: any member could hide a shared event from its
    // owner's active list.
    await assertFails(updateDoc(doc(asMember(), 'events', EVENT), { archived: true }));
  });

  it('BLOCKS a member bundling `archived` with an allowed field', async () => {
    // onlyUpdating() is hasOnly() over the affected keys, so smuggling the
    // flag alongside a permitted write must fail too. If this ever passes,
    // the allowlist has been widened.
    await assertFails(
      updateDoc(doc(asMember(), 'events', EVENT), {
        memberIds: [OWNER, MEMBER, STRANGER],
        archived: true,
      }),
    );
  });

  it('BLOCKS a member un-archiving an owner-archived event', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'events', EVENT), { archived: true });
    });
    await assertFails(updateDoc(doc(asMember(), 'events', EVENT), { archived: false }));
  });

  it('BLOCKS a pending invitee archiving', async () => {
    await assertFails(updateDoc(doc(asInvitee(), 'events', EVENT), { archived: true }));
  });

  it('BLOCKS a non-member archiving', async () => {
    await assertFails(updateDoc(doc(asStranger(), 'events', EVENT), { archived: true }));
  });

  it('BLOCKS an unauthenticated client archiving', async () => {
    await assertFails(updateDoc(doc(asAnon(), 'events', EVENT), { archived: true }));
  });

  it('ALLOWS the owner archiving', async () => {
    await assertSucceeds(
      updateDoc(doc(asOwner(), 'events', EVENT), {
        archived: true,
        archivedAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  // CONTRACT CHANGED IN CHUNK 3 — this test formerly asserted the opposite.
  //
  // Chunk 2 let the owner unarchive with a direct write, which was correct while
  // nothing depended on the count of active events. Chunk 3 gates unarchiving by
  // the free-tier group cap, and a cap needs an aggregation query that rules
  // cannot run — so the write moved to the `unarchiveEvent` callable and the
  // direct path is closed. Leaving it open would make the cap bypassable in
  // three taps: archive A, create C, unarchive A.
  //
  // ARCHIVING is deliberately still allowed here (see the test above): it frees
  // a slot and is the free escape hatch the paywall must offer, so it must never
  // be gated. That asymmetry is the whole design, and is covered in detail by
  // tests/rules/eventCreateUnarchive.rules.test.ts.
  it('BLOCKS the owner un-archiving directly — it must go through the callable', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'events', EVENT), { archived: true });
    });
    await assertFails(
      updateDoc(doc(asOwner(), 'events', EVENT), { archived: false, updatedAt: new Date() }),
    );
  });
});

describe('events — the archive rule does not break existing member flows', () => {
  // Without these, every assertion above would still pass if the events rules
  // were replaced with `allow update: if false`.
  it('ALLOWS a member updating memberIds (auto-accept flow)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), 'events', EVENT), {
        memberIds: [OWNER, MEMBER, STRANGER],
        updatedAt: new Date(),
      }),
    );
  });

  it('ALLOWS a pending invitee accepting their own invitation', async () => {
    await assertSucceeds(
      updateDoc(doc(asInvitee(), 'events', EVENT), {
        memberIds: [OWNER, MEMBER, INVITEE],
        pendingInvites: [],
        updatedAt: new Date(),
      }),
    );
  });

  it('BLOCKS a non-member updating memberIds', async () => {
    await assertFails(
      updateDoc(doc(asStranger(), 'events', EVENT), { memberIds: [OWNER, MEMBER, STRANGER] }),
    );
  });
});
