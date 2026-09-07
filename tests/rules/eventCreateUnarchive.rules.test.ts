/**
 * Security-rules tests for the two paths the free-tier GROUP CAP depends on.
 *
 * The cap is "at most N *active* events you own". Enforcing it means COUNTING
 * documents, and a Firestore rule cannot run an aggregation query — it only
 * ever sees the document at hand. So the cap lives in the `createEvent` /
 * `unarchiveEvent` callables, and these rules exist to make those callables the
 * ONLY way in. Without them the cap is decorative: `addDoc` straight to
 * `events`, or `updateDoc({archived:false})`, walks around it.
 *
 * THE ASYMMETRY THAT MUST HOLD (spec §4.2.1, §4.3.1):
 *
 *   ARCHIVING   — always allowed, still a direct client write.
 *                 It FREES a slot, and it is the free escape hatch the paywall
 *                 must offer before payment. The person most likely to be at
 *                 the cap with unsettled balances is exactly the person who
 *                 must be able to archive, so blocking it can never be correct.
 *   UNARCHIVING — gated, because archive → create → unarchive would otherwise
 *                 bypass the cap in three taps.
 *
 * Written to FAIL against the pre-chunk-3 rules, which allowed the owner
 * unrestricted updates and allowed any authenticated user to create an event.
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
import { doc, setDoc, updateDoc, deleteField, addDoc, collection } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const OWNER = 'uid_owner';
const MEMBER = 'uid_member';
const INVITEE_EMAIL = 'invitee@example.com';
const EVENT = 'event_capped';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules-event-cap',
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
    await setDoc(doc(ctx.firestore(), 'events', EVENT), {
      name: 'Vegas Weekend',
      description: '',
      ownerId: OWNER,
      memberIds: [OWNER, MEMBER],
      pendingInvites: [INVITEE_EMAIL],
      archived: true,
    });
  });
});

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asMember = () => testEnv.authenticatedContext(MEMBER).firestore();

describe('events — direct client CREATE is closed', () => {
  it('BLOCKS creating an event with addDoc', async () => {
    await assertFails(
      addDoc(collection(asOwner(), 'events'), {
        name: 'Sneaky Trip',
        ownerId: OWNER,
        memberIds: [OWNER],
      }),
    );
  });

  it('BLOCKS creating an event at a chosen id with setDoc', async () => {
    await assertFails(
      setDoc(doc(asOwner(), 'events', 'event_new'), {
        name: 'Sneaky Trip',
        ownerId: OWNER,
        memberIds: [OWNER],
        archived: false,
      }),
    );
  });
});

describe('events — UNARCHIVING is closed, ARCHIVING stays open', () => {
  it('BLOCKS the owner unarchiving directly', async () => {
    await assertFails(updateDoc(doc(asOwner(), 'events', EVENT), { archived: false }));
  });

  // Deleting the field is unarchiving by another name: `isEventArchived` treats
  // a missing field as ACTIVE, so this would free a slot just as effectively.
  it('BLOCKS the owner unarchiving by DELETING the field', async () => {
    await assertFails(updateDoc(doc(asOwner(), 'events', EVENT), { archived: deleteField() }));
  });

  it('BLOCKS smuggling the unarchive alongside a legitimate edit', async () => {
    await assertFails(
      updateDoc(doc(asOwner(), 'events', EVENT), { name: 'Renamed', archived: false }),
    );
  });

  it('ALLOWS the owner archiving — never gated, it frees a slot', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'events', EVENT), { archived: false });
    });
    await assertSucceeds(
      updateDoc(doc(asOwner(), 'events', EVENT), { archived: true, updatedAt: new Date() }),
    );
  });
});

describe('events — everything else the owner and members could do still works', () => {
  it('ALLOWS the owner renaming an event', async () => {
    await assertSucceeds(updateDoc(doc(asOwner(), 'events', EVENT), { name: 'Renamed' }));
  });

  it('ALLOWS the owner editing the description', async () => {
    await assertSucceeds(updateDoc(doc(asOwner(), 'events', EVENT), { description: 'notes' }));
  });

  it('ALLOWS the owner changing memberIds', async () => {
    await assertSucceeds(
      updateDoc(doc(asOwner(), 'events', EVENT), { memberIds: [OWNER, MEMBER, 'uid_new'] }),
    );
  });

  it('ALLOWS a member updating memberIds/pendingInvites (auto-accept)', async () => {
    await assertSucceeds(
      updateDoc(doc(asMember(), 'events', EVENT), {
        memberIds: [OWNER, MEMBER, 'uid_new'],
        pendingInvites: [],
        updatedAt: new Date(),
      }),
    );
  });

  it('still BLOCKS a member archiving an event they do not own', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'events', EVENT), { archived: false });
    });
    await assertFails(updateDoc(doc(asMember(), 'events', EVENT), { archived: true }));
  });

  it('ALLOWS the owner deleting an event', async () => {
    const { deleteDoc } = await import('firebase/firestore');
    await assertSucceeds(deleteDoc(doc(asOwner(), 'events', EVENT)));
  });
});
