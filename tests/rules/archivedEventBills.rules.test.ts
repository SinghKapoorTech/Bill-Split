/**
 * Security-rules tests for the ARCHIVE SOFT-LOCK on bill creation.
 *
 * The callable (`createBillCore`) gained a server-side archive gate in chunk 3,
 * but `bills` still carries `allow create` for any authenticated event member —
 * so the gate was reachable around, not through: anyone with devtools could
 * `addDoc` a bill carrying an archived `eventId` and never touch the callable.
 *
 * That matters beyond tidiness. Archiving is what frees a slot against the
 * free-tier group cap (spec §4.2.1), so an archive that still accepts bills
 * makes the cap decorative — archive both events, keep filing bills into them
 * exactly as before, create two more.
 *
 * Written to FAIL against the pre-chunk-3 rules, which allowed the write.
 *
 * THE TRAP THIS FILE GUARDS: absence is ACTIVE. Firestore rules throw on a
 * missing field rather than yielding null, so an unguarded
 * `get(...).data.archived != true` errors — and a rule that errors DENIES.
 * Every event written before the archive feature has no `archived` field, so
 * getting this wrong blocks new bills in every historical event. The
 * legacy/no-field cases below are the real regression risk, not the archived one.
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
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const OWNER = 'uid_owner';
const MEMBER = 'uid_member';
const STRANGER = 'uid_stranger';

const EV_ACTIVE = 'ev_active';
const EV_ARCHIVED = 'ev_archived';
const EV_LEGACY = 'ev_legacy';
const EV_WEIRD = 'ev_weird';
const EV_FOREIGN = 'ev_foreign';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules-archived-bills',
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
    const base = { name: 'Trip', ownerId: OWNER, memberIds: [OWNER, MEMBER], pendingInvites: [] };
    await setDoc(doc(db, 'events', EV_ACTIVE), { ...base, archived: false });
    await setDoc(doc(db, 'events', EV_ARCHIVED), { ...base, archived: true });
    // No `archived` field at all — every event predating the feature.
    await setDoc(doc(db, 'events', EV_LEGACY), base);
    // Truthy but not `true`; can only come from a bad write.
    await setDoc(doc(db, 'events', EV_WEIRD), { ...base, archived: 'true' });
    // An ACTIVE event owned by someone else, which OWNER has no part in.
    await setDoc(doc(db, 'events', EV_FOREIGN), {
      name: 'Someone else’s trip',
      ownerId: STRANGER,
      memberIds: [STRANGER],
      pendingInvites: [],
      archived: false,
    });
  });
});

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asMember = () => testEnv.authenticatedContext(MEMBER).firestore();
const asStranger = () => testEnv.authenticatedContext(STRANGER).firestore();

function billFor(uid: string, eventId?: string) {
  return {
    billType: eventId ? 'event' : 'private',
    ownerId: uid,
    ...(eventId ? { eventId } : {}),
    billData: { items: [], subtotal: 0, tax: 0, tip: 0, otherFees: 0, total: 0 },
    people: [],
    itemAssignments: {},
    participantIds: [uid],
    members: [],
  };
}

describe('bills — creation into an ARCHIVED event is blocked', () => {
  it('BLOCKS the owner filing a new bill into an archived event', async () => {
    await assertFails(setDoc(doc(asOwner(), 'bills', 'b_new'), billFor(OWNER, EV_ARCHIVED)));
  });

  it('BLOCKS a member filing a new bill into an archived event', async () => {
    await assertFails(setDoc(doc(asMember(), 'bills', 'b_new'), billFor(MEMBER, EV_ARCHIVED)));
  });
});

describe('bills — every non-archived case still works', () => {
  it('ALLOWS a bill in an explicitly active event', async () => {
    await assertSucceeds(setDoc(doc(asOwner(), 'bills', 'b_active'), billFor(OWNER, EV_ACTIVE)));
  });

  // The regression that would break the whole app: rules error on a missing
  // field, and an erroring rule denies.
  it('ALLOWS a bill in an event with NO archived field (every legacy event)', async () => {
    await assertSucceeds(setDoc(doc(asOwner(), 'bills', 'b_legacy'), billFor(OWNER, EV_LEGACY)));
  });

  it('ALLOWS a bill when archived is truthy-but-not-true', async () => {
    await assertSucceeds(setDoc(doc(asOwner(), 'bills', 'b_weird'), billFor(OWNER, EV_WEIRD)));
  });

  it('ALLOWS a private bill with no eventId at all', async () => {
    await assertSucceeds(setDoc(doc(asOwner(), 'bills', 'b_priv'), billFor(OWNER)));
  });

  it('still BLOCKS a non-member, archived or not', async () => {
    await assertFails(setDoc(doc(asStranger(), 'bills', 'b_x'), billFor(STRANGER, EV_ACTIVE)));
  });
});

describe('bills — the archive lock covers CREATION only', () => {
  // The hard rule of the entire feature (spec §4.2.1): a person must never be
  // blocked from paying someone back. Settling writes `settledPersonIds` to an
  // EXISTING bill, and archiving the event must not touch that path.
  it('ALLOWS settling an existing bill inside an archived event', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_existing'), {
        ...billFor(OWNER, EV_ARCHIVED),
        settledPersonIds: [],
      });
    });

    await assertSucceeds(
      setDoc(
        doc(asOwner(), 'bills', 'b_existing'),
        { ...billFor(OWNER, EV_ARCHIVED), settledPersonIds: [MEMBER] },
        { merge: true },
      ),
    );
  });
});

/**
 * CREATE-THEN-MOVE. Gating only `create` made the rule decorative against the
 * exact attacker it was written for: `allow update` gives the bill owner
 * unrestricted field access, so two writes get a bill into an archived event —
 * create it somewhere legal, then repoint `eventId`. The bill then shows up in
 * the archived event and drives its `event_balances` pair docs.
 *
 * The guard must key on `eventId` CHANGING, not merely being present: settling
 * writes `settledPersonIds`/`updatedAt`/`lastActivity` on a bill that already
 * carries an archived `eventId`, and that must keep working. Blocking every
 * update to a bill in an archived event would break paying people back, which
 * is the one thing this feature may never do.
 */
describe('bills — an archived event cannot be reached by MOVING a bill', () => {
  it('BLOCKS repointing a private bill into an archived event', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_move'), billFor(OWNER));
    });
    await assertFails(
      setDoc(
        doc(asOwner(), 'bills', 'b_move'),
        { ...billFor(OWNER, EV_ARCHIVED) },
        { merge: true },
      ),
    );
  });

  it('BLOCKS moving a bill from an active event into an archived one', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_move2'), billFor(OWNER, EV_ACTIVE));
    });
    await assertFails(
      setDoc(
        doc(asOwner(), 'bills', 'b_move2'),
        { ...billFor(OWNER, EV_ARCHIVED) },
        { merge: true },
      ),
    );
  });

  it('ALLOWS moving a bill into an ACTIVE event', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_move3'), billFor(OWNER));
    });
    await assertSucceeds(
      setDoc(doc(asOwner(), 'bills', 'b_move3'), { ...billFor(OWNER, EV_ACTIVE) }, { merge: true }),
    );
  });

  // THE hard rule. Settling touches a bill already inside an archived event and
  // must never be blocked.
  it('ALLOWS settling a bill already in an archived event (eventId unchanged)', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_settle'), {
        ...billFor(OWNER, EV_ARCHIVED),
        settledPersonIds: [],
      });
    });
    await assertSucceeds(
      setDoc(
        doc(asOwner(), 'bills', 'b_settle'),
        { settledPersonIds: [MEMBER], lastActivity: new Date() },
        { merge: true },
      ),
    );
  });

  it('ALLOWS editing other fields on a bill in an archived event', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_edit'), billFor(OWNER, EV_ARCHIVED));
    });
    await assertSucceeds(
      setDoc(doc(asOwner(), 'bills', 'b_edit'), { itemAssignments: { i1: [OWNER] } }, { merge: true }),
    );
  });
});

/**
 * PRE-EXISTING HOLE (found by adversarial review, not introduced by the archive work).
 *
 * `allow update` grants the bill's owner unrestricted field access and never
 * validates the NEW `eventId`. So the owner of any bill could repoint it into an
 * event they have no part in — filing a bill, and the debt it creates, into a
 * stranger's group. `hasEventIdAndMember()` already guards this on CREATE; the
 * update path simply never called it.
 *
 * The guard must key on `eventId` CHANGING. Bills are updated constantly
 * (settling, claiming items, editing), and blocking updates merely because a
 * bill sits in some event would break paying people back.
 */
describe('bills — eventId cannot be repointed into an event you do not belong to', () => {
  it('BLOCKS the owner moving a private bill into a stranger\'s event', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_foreign'), billFor(OWNER));
    });
    await assertFails(
      setDoc(doc(asOwner(), 'bills', 'b_foreign'), { ...billFor(OWNER, EV_FOREIGN) }, { merge: true }),
    );
  });

  it('BLOCKS moving a bill from your own event into a stranger\'s', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_foreign2'), billFor(OWNER, EV_ACTIVE));
    });
    await assertFails(
      setDoc(doc(asOwner(), 'bills', 'b_foreign2'), { ...billFor(OWNER, EV_FOREIGN) }, { merge: true }),
    );
  });

  it('BLOCKS pointing at an event that does not exist', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_ghost'), billFor(OWNER));
    });
    await assertFails(
      setDoc(doc(asOwner(), 'bills', 'b_ghost'), { ...billFor(OWNER, 'ev_does_not_exist') }, { merge: true }),
    );
  });

  // Everything legitimate about moving a bill must still work.
  it('ALLOWS moving into an event you own', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_ok1'), billFor(OWNER));
    });
    await assertSucceeds(
      setDoc(doc(asOwner(), 'bills', 'b_ok1'), { ...billFor(OWNER, EV_ACTIVE) }, { merge: true }),
    );
  });

  it('ALLOWS a member moving their own bill into an event they belong to', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_ok2'), billFor(MEMBER));
    });
    await assertSucceeds(
      setDoc(doc(asMember(), 'bills', 'b_ok2'), { ...billFor(MEMBER, EV_ACTIVE) }, { merge: true }),
    );
  });

  // Detaching is always fine — it removes the bill from the group, it does not
  // push anything into one.
  it('ALLOWS moving a bill OUT of an event', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_out'), billFor(OWNER, EV_ACTIVE));
    });
    await assertSucceeds(
      setDoc(doc(asOwner(), 'bills', 'b_out'), { eventId: null }, { merge: true }),
    );
  });

  // The hard rule, again: this guard must not touch settlement.
  it('ALLOWS settling a bill in a foreign event without touching eventId', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_settle_f'), {
        ...billFor(OWNER, EV_FOREIGN),
        settledPersonIds: [],
      });
    });
    await assertSucceeds(
      setDoc(
        doc(asOwner(), 'bills', 'b_settle_f'),
        { settledPersonIds: [MEMBER], lastActivity: new Date() },
        { merge: true },
      ),
    );
  });
});

/**
 * THE PATHS THAT MUST NEVER BREAK.
 *
 * The bills `allow update` rule is now guarded by a conjunction —
 * `!isMovingIntoArchivedEvent() && !isMovingIntoForeignEvent() && (…)`. Every
 * guard added to that chain applies to EVERY role, including the ones that let
 * people pay each other back. Two of those roles have no other test anywhere,
 * and both were verified only by throwaway probes during review; a third guard
 * added later could silently break them and nothing would go red.
 *
 * These are deliberately exercised on a bill sitting INSIDE AN ARCHIVED EVENT,
 * which is the hardest case: archiving must never block settling (spec §4.2.1).
 */
describe('bills — roles that must keep working inside an archived event', () => {
  const FUTURE = () => Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);

  it('ALLOWS an anonymous guest with a valid share code to claim items', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_guest'), {
        ...billFor(OWNER, EV_ARCHIVED),
        shareCode: 'XY3K9P',
        shareCodeExpiresAt: FUTURE(),
      });
    });
    await assertSucceeds(
      setDoc(
        doc(testEnv.unauthenticatedContext().firestore(), 'bills', 'b_guest'),
        { itemAssignments: { 'item-1': ['person-a'] }, lastActivity: new Date() },
        { merge: true },
      ),
    );
  });

  it('ALLOWS a linked participant to record a settlement', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_participant'), {
        ...billFor(OWNER, EV_ARCHIVED),
        participantIds: [OWNER, MEMBER],
        settledPersonIds: [],
      });
    });
    // MEMBER is not the bill owner — only a linked participant.
    await assertSucceeds(
      setDoc(
        doc(asMember(), 'bills', 'b_participant'),
        { settledPersonIds: [MEMBER], updatedAt: new Date() },
        { merge: true },
      ),
    );
  });

  it('still BLOCKS an anonymous guest from smuggling an eventId change', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'bills', 'b_guest2'), {
        ...billFor(OWNER, EV_ACTIVE),
        shareCode: 'XY3K9Q',
        shareCodeExpiresAt: FUTURE(),
      });
    });
    await assertFails(
      setDoc(
        doc(testEnv.unauthenticatedContext().firestore(), 'bills', 'b_guest2'),
        { eventId: EV_FOREIGN, lastActivity: new Date() },
        { merge: true },
      ),
    );
  });
});
