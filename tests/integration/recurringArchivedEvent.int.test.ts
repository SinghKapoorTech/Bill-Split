/**
 * Recurring generation into an ARCHIVED event.
 *
 * Archiving an event is a soft lock: no NEW bills. A recurring template with an
 * `eventId` is the one path that creates bills with no user in the loop, so
 * without this check an archived event keeps growing forever — and the group
 * cap that archive is the escape hatch for would enforce nothing ("archive both
 * events, keep using them, create two more").
 *
 * The other half of the contract is that the skip is LOUD. A user whose rent
 * split quietly stops appearing would not notice for months, so a skip logs a
 * warning and records `pausedReason: 'event-archived'` on the template.
 *
 * RESUME DROPS THE ELAPSED CYCLES, IT DOES NOT REPLAY THEM. The cursor stays
 * frozen while the event is archived, and on resume is fast-forwarded to the
 * first occurrence ON OR AFTER today. Backfilling instead would mean a weekly
 * template on an event archived for a year mints ~52 bills in one pass — each
 * firing the ledger pipeline and moving real balances. Archiving is a
 * deliberate "this is finished", so cycles that elapsed while archived are
 * cycles the user chose not to have.
 *
 * The cycle due TODAY is NOT one of them, and a cursor that is not actually
 * behind is not fast-forwarded at all. Both matter: `pausedReason` records
 * "the event was archived on some past pass", not "cycles were missed", so an
 * unconditional jump would eat a cycle a brief accidental archive never
 * skipped — unrecoverably, since resume only moves forward.
 *
 * Every defensive case asserts that ABSENCE MEANS ACTIVE: a missing event, a
 * document with no `archived` field (i.e. every event written before the
 * feature shipped), and a failed read must all keep generating.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from 'firebase-functions';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { makeEvent } from './helpers/builders';
import {
  generateDueRecurringBills,
  generateRecurringBillNowCore,
} from '../../functions/src/recurringBillProcessor';

const ALICE = 'alice';
const BOB = 'bob';
const EVENT_ID = 'trip1';

const PEOPLE = [
  { id: `user-${ALICE}`, name: 'Alice' },
  { id: `user-${BOB}`, name: 'Bob' },
];

/** An active monthly template, due on 2026-07-01, pointed at EVENT_ID. */
function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rec1',
    ownerId: ALICE,
    ownerName: 'Alice',
    title: 'Rent',
    amount: 100,
    paidById: ALICE,
    people: PEOPLE,
    splitEvenly: true,
    schedule: { frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' },
    status: 'active',
    nextRunDate: '2026-07-01',
    lastRunDate: '2026-06-01',
    generatedBillIds: [],
    eventId: EVENT_ID,
    ...overrides,
  };
}

async function seedTemplate(overrides: Record<string, unknown> = {}) {
  const template = makeTemplate(overrides);
  // Firestore rejects undefined values; `eventId: undefined` is how a caller
  // asks for a private template, so drop the key entirely.
  if (template.eventId === undefined) delete (template as { eventId?: string }).eventId;
  await db
    .collection('recurring_bills')
    .doc(template.id as string)
    .set(template);
  return template;
}

async function getTemplate(id = 'rec1') {
  return (await db.collection('recurring_bills').doc(id).get()).data()!;
}

async function generatedBills(recurringId = 'rec1') {
  const snap = await db.collection('bills').where('recurringBillId', '==', recurringId).get();
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) => String(a.recurringCycleDate).localeCompare(String(b.recurringCycleDate)));
}

/** Seeds the event document with whatever archive state the test needs. */
async function seedEvent(extra: Record<string, unknown> = {}, eventId = EVENT_ID) {
  await db
    .collection('events')
    .doc(eventId)
    .set({ ...makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }), ...extra });
}

describe('recurring generation — archived target event', () => {
  // The processor logs every skip; keep the expected noise out of the output
  // while still asserting it was surfaced.
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await clearFirestore();
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips generation, logs it, and records the reason on the template', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate();

    const result = await generateDueRecurringBills(db, '2026-07-01');

    expect(result).toEqual({ processed: 1, created: 0 });
    expect(await generatedBills()).toHaveLength(0);

    // The reason is recorded so a stalled template is explainable, not a mystery.
    const template = await getTemplate();
    expect(template.pausedReason).toBe('event-archived');

    // …and the skip was surfaced with both ids.
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('archived'),
      expect.objectContaining({ recurringBillId: 'rec1', eventId: EVENT_ID }),
    );
  });

  it('leaves the schedule cursor untouched for as long as the event stays archived', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate({ nextRunDate: '2026-07-01', lastRunDate: '2026-06-01' });

    await generateDueRecurringBills(db, '2026-09-01');

    // Nothing ran, so nothing claims to have run. The cursor is moved on
    // RESUME (see below), not by the passes that skip.
    const template = await getTemplate();
    expect(template.nextRunDate).toBe('2026-07-01');
    expect(template.lastRunDate).toBe('2026-06-01');
    expect(template.status).toBe('active');
    expect(template.generatedBillIds).toEqual([]);
  });

  it('SKIPS the cycles that elapsed while archived and clears pausedReason once the event is unarchived', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate();

    await generateDueRecurringBills(db, '2026-09-01');
    expect(await generatedBills()).toHaveLength(0);
    expect((await getTemplate()).pausedReason).toBe('event-archived');

    // Owner unarchives, exactly as unarchiveEvent() writes it.
    await db.collection('events').doc(EVENT_ID).update({ archived: false });

    const result = await generateDueRecurringBills(db, '2026-09-01');

    // 2026-07-01 and 08-01 elapsed while the event was archived and are NOT
    // replayed — unarchiving must never dump a pile of real, settleable debt
    // on the group in one pass. 09-01 is TODAY's cycle, which has not elapsed,
    // so it generates exactly as it would for a template never archived.
    expect(result.created).toBe(1);
    expect((await generatedBills()).map((b) => b.recurringCycleDate)).toEqual(['2026-09-01']);

    const template = await getTemplate();
    expect(template.nextRunDate).toBe('2026-10-01');
    expect(template.status).toBe('active');

    // Stale reason is REMOVED, never written back as undefined.
    expect(template.pausedReason).toBeUndefined();
    expect('pausedReason' in template).toBe(false);
  });

  it('generates normally again on the first cycle AFTER the resume', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate();

    await generateDueRecurringBills(db, '2026-09-01'); // skipped, paused
    await db.collection('events').doc(EVENT_ID).update({ archived: false });
    await generateDueRecurringBills(db, '2026-09-01'); // resume: today's cycle only

    // Dropping the archived stretch must not break the template — it is still
    // a live monthly schedule.
    expect((await generateDueRecurringBills(db, '2026-10-01')).created).toBe(1);
    expect((await generatedBills()).map((b) => b.recurringCycleDate)).toEqual([
      '2026-09-01',
      '2026-10-01',
    ]);
  });

  it('cannot explode: a weekly template archived for a year mints nothing on resume', async () => {
    // This is the finding in its worst form. Backfilling would create ~52
    // bills in a single call, each firing ledgerProcessor and moving real
    // balances, with no cap on the catch-up loop.
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate({
      schedule: { frequency: 'weekly', dayOfWeek: 3, startDate: '2026-01-07' },
      nextRunDate: '2026-07-01',
      lastRunDate: '2026-06-24',
    });

    await generateDueRecurringBills(db, '2027-07-01');
    await db.collection('events').doc(EVENT_ID).update({ archived: false });

    const result = await generateDueRecurringBills(db, '2027-07-01');

    expect(result.created).toBe(0);
    expect(await generatedBills()).toHaveLength(0);

    // One occurrence forward, and only one: 2027-07-01 is a Thursday, so the
    // next Wednesday is 2027-07-07.
    expect((await getTemplate()).nextRunDate).toBe('2027-07-07');
  });

  it('resumes on the immediate create/edit path with the same skip, not a backfill', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate();

    await generateDueRecurringBills(db, '2026-09-01');
    await db.collection('events').doc(EVENT_ID).update({ archived: false });

    // Editing a template right after unarchiving fires this path directly; it
    // must not be a way to trigger the backfill the hourly pass refuses. Only
    // today's cycle, never the two that elapsed while archived.
    expect(await generateRecurringBillNowCore(db, 'rec1', ALICE, '2026-09-01')).toEqual({
      created: 1,
    });
    expect((await generatedBills()).map((b) => b.recurringCycleDate)).toEqual(['2026-09-01']);
    expect((await getTemplate()).nextRunDate).toBe('2026-10-01');
  });

  it('does not rewrite the template on every pass once the reason is already recorded', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate();

    await generateDueRecurringBills(db, '2026-07-01');
    const afterFirst = (await getTemplate()).updatedAt as Timestamp;

    await generateDueRecurringBills(db, '2026-07-01');
    const afterSecond = (await getTemplate()).updatedAt as Timestamp;

    // The hourly scheduler runs 24×/day forever; re-stamping updatedAt each
    // pass would churn the document and reorder any updatedAt-sorted list.
    expect(afterSecond.toMillis()).toBe(afterFirst.toMillis());
    expect((await getTemplate()).pausedReason).toBe('event-archived');
  });

  it('refuses the immediate create/edit path too, not just the hourly pass', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate();

    // generateRecurringBillNowCore is what the client fires right after saving
    // a template — it must not be a way around the lock.
    expect(await generateRecurringBillNowCore(db, 'rec1', ALICE, '2026-07-01')).toEqual({
      created: 0,
    });
    expect(await generatedBills()).toHaveLength(0);
    expect((await getTemplate()).pausedReason).toBe('event-archived');
  });

  it('does NOT eat the cycle due today when the archive lasted less than one cycle', async () => {
    // The accidental-archive case. Owner archives at 00:15 on the day rent is
    // due, an hourly pass stamps pausedReason, and they unarchive the same
    // morning. Nothing elapsed — today's cycle is still today's cycle — so it
    // must generate. Losing it would be unrecoverable: resume only moves
    // forward and the deterministic bill id puts the skipped cycle out of
    // reach of any retry.
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate({ nextRunDate: '2026-07-01', lastRunDate: '2026-06-01' });

    await generateDueRecurringBills(db, '2026-07-01'); // paused, same day
    expect((await getTemplate()).pausedReason).toBe('event-archived');

    await db.collection('events').doc(EVENT_ID).update({ archived: false });
    const result = await generateDueRecurringBills(db, '2026-07-01');

    expect(result.created).toBe(1);
    expect((await generatedBills()).map((b) => b.recurringCycleDate)).toEqual(['2026-07-01']);
    expect((await getTemplate()).nextRunDate).toBe('2026-08-01');
  });

  it('never moves a cursor BACKWARDS when a stale pausedReason outlives the archive', async () => {
    // pausedReason means "the event was archived on some past pass", NOT
    // "cycles were missed". generateRecurringBillNowCore runs on every template
    // EDIT regardless of due-ness, so the flag can be stamped on a template
    // whose cursor is still in the future, and stays there until the next due
    // pass. Fast-forwarding that unconditionally would drag the cursor back to
    // today and mint a bill nobody asked for.
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    // Cursor several cycles AHEAD of today — the state left by editing a
    // template's schedule forward. Any resume rule that recomputes the cursor
    // from the schedule's own start (rather than advancing the frozen cursor)
    // drags this back to 2026-04-01.
    await seedTemplate({ nextRunDate: '2026-06-01', lastRunDate: '2026-03-01' });

    // Owner edits the template on 2026-03-10 — not due, but this path runs
    // anyway and stamps the flag even though no cycle was missed.
    await generateRecurringBillNowCore(db, 'rec1', ALICE, '2026-03-10');
    expect((await getTemplate()).pausedReason).toBe('event-archived');

    await db.collection('events').doc(EVENT_ID).update({ archived: false });
    const result = await generateRecurringBillNowCore(db, 'rec1', ALICE, '2026-03-12');

    expect(result).toEqual({ created: 0 });
    expect(await generatedBills()).toHaveLength(0);
    // The cursor is UNCHANGED — still pointing at the June cycle it always
    // was, which will generate normally when it comes due.
    expect((await getTemplate()).nextRunDate).toBe('2026-06-01');
    expect((await getTemplate()).pausedReason).toBeUndefined();
  });

  it('COMPLETES a template whose end date passed while its event was archived', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate({
      schedule: {
        frequency: 'monthly',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        endDate: '2026-08-15',
      },
    });

    // Left `active` with a past nextRunDate, this template is matched by the
    // hourly due query on every pass FOREVER, burning an events/{id} read each
    // time — and it can never produce another bill, because resume only moves
    // the cursor forward.
    await generateDueRecurringBills(db, '2026-09-01');

    const template = await getTemplate();
    expect(template.status).toBe('completed');
    expect(await generatedBills()).toHaveLength(0);
    // Terminal, not paused: the stale reason is removed rather than left to
    // imply generation will come back.
    expect('pausedReason' in template).toBe(false);

    // …and it drops out of the due query for good.
    expect(await generateDueRecurringBills(db, '2026-10-01')).toEqual({
      processed: 0,
      created: 0,
    });
  });

  it('completes, without a partial backfill, when the end date passed between the pause and the resume', async () => {
    // The gap the archived-branch end-date check cannot cover: the end date
    // elapses AFTER the template is paused but BEFORE the next pass runs, and
    // the owner unarchives in between. Resume then computes a cursor with an
    // already-elapsed endDate — it must still create nothing and finish the
    // template, not replay the cycles between nextRunDate and endDate.
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate({
      schedule: {
        frequency: 'monthly',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        endDate: '2026-08-15',
      },
    });

    await generateDueRecurringBills(db, '2026-07-01'); // paused while endDate is still ahead
    expect((await getTemplate()).pausedReason).toBe('event-archived');

    await db.collection('events').doc(EVENT_ID).update({ archived: false });
    const result = await generateDueRecurringBills(db, '2026-09-01');

    expect(result.created).toBe(0);
    expect(await generatedBills()).toHaveLength(0);
    expect((await getTemplate()).status).toBe('completed');
  });

  it('does NOT complete an archived template whose end date is still in the future', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate({
      schedule: {
        frequency: 'monthly',
        dayOfMonth: 1,
        startDate: '2026-01-01',
        endDate: '2026-12-31',
      },
    });

    await generateDueRecurringBills(db, '2026-09-01');

    // Unarchiving before the end date must still resume — completing early
    // would silently kill a live schedule.
    const template = await getTemplate();
    expect(template.status).toBe('active');
    expect(template.pausedReason).toBe('event-archived');
  });

  it('does not let one archived event block other templates in the same pass', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedEvent({}, 'trip2'); // active event
    await seedTemplate({ id: 'rec-archived' });
    await seedTemplate({ id: 'rec-active', eventId: 'trip2' });
    await seedTemplate({ id: 'rec-private', eventId: undefined });

    const result = await generateDueRecurringBills(db, '2026-07-01');

    expect(result).toEqual({ processed: 3, created: 2 });
    expect(await generatedBills('rec-archived')).toHaveLength(0);
    expect(await generatedBills('rec-active')).toHaveLength(1);
    expect(await generatedBills('rec-private')).toHaveLength(1);
  });
});

// ── Absence means ACTIVE ────────────────────────────────────────────────────
// Each of these would, if mishandled, silently stop a template that has every
// right to keep generating.

describe('recurring generation — archive check reads the event defensively', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    await clearFirestore();
    vi.spyOn(logger, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates when the event has NO archived field (pre-feature document)', async () => {
    await seedEvent(); // makeEvent writes no `archived` key at all
    await seedTemplate();

    expect((await generateDueRecurringBills(db, '2026-07-01')).created).toBe(1);
    expect((await getTemplate()).pausedReason).toBeUndefined();
  });

  it('generates when archived is explicitly false', async () => {
    await seedEvent({ archived: false });
    await seedTemplate();

    expect((await generateDueRecurringBills(db, '2026-07-01')).created).toBe(1);
  });

  it('generates when the event document does not exist at all', async () => {
    // No event seeded — the template points at a deleted/never-created event.
    await seedTemplate();

    expect((await generateDueRecurringBills(db, '2026-07-01')).created).toBe(1);
    expect((await getTemplate()).pausedReason).toBeUndefined();
  });

  it('fails OPEN and logs when the event read throws', async () => {
    await seedEvent({ archived: true, archivedAt: Timestamp.now() });
    await seedTemplate();

    const realCollection = db.collection.bind(db);
    vi.spyOn(db, 'collection').mockImplementation(((name: string) => {
      if (name === 'events') {
        return {
          doc: () => ({
            get: () => Promise.reject(new Error('simulated Firestore outage')),
          }),
        };
      }
      return realCollection(name);
    }) as unknown as typeof db.collection);

    // A transient read failure must not silently stop this user's rent split —
    // nor crash the scheduled run for every other user.
    const result = await generateDueRecurringBills(db, '2026-07-01');

    vi.mocked(db.collection).mockRestore();

    expect(result).toEqual({ processed: 1, created: 1 });
    expect(await generatedBills()).toHaveLength(1);
    // Failing open is only acceptable because it is visible.
    expect(errorSpy).toHaveBeenCalled();
  });
});
