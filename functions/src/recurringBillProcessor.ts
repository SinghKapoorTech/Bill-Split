import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { createBillCore } from './billFunctions.js';
import { firstRunDate, advanceRunDate } from '../../shared/recurringSchedule.js';
import { isEventArchived } from '../../shared/eventArchive.js';
import {
  resolveSplitAmounts,
  buildPerPersonShareItems,
  roundCents,
} from '../../shared/splitAmounts.js';

interface BillDataShape {
  items: { id: string; name: string; price: number }[];
  subtotal: number;
  tax: number;
  tip: number;
  otherFees: number;
  total: number;
  restaurantName?: string;
}

interface RecurringBillDoc {
  id: string;
  ownerId: string;
  ownerName: string;
  title: string;
  amount: number;
  paidById: string;
  people: { id: string; name: string; venmoId?: string }[];
  splitEvenly: boolean;
  exactAmounts?: Record<string, number>;
  schedule: {
    frequency: 'weekly' | 'biweekly' | 'monthly';
    dayOfWeek?: number;
    dayOfMonth?: number;
    startDate: string;
    endDate?: string;
  };
  status: string;
  nextRunDate: string;
  lastRunDate: string | null;
  generatedBillIds: string[];
  eventId?: string;

  /**
   * Why generation is currently not producing bills, when the template is
   * otherwise active. Written by the processor, read by the UI later. Absent
   * on every template that is generating normally — never written as
   * `undefined`, always removed with FieldValue.delete().
   */
  pausedReason?: 'event-archived';

  // Bill-type generalization (absent on legacy docs → 'quick')
  generatedType?: 'quick' | 'detailed' | 'airbnb';
  billData?: BillDataShape;
  itemAssignments?: Record<string, string[]>;
  isAirbnb?: boolean;
  airbnbData?: {
    startDate: string;
    endDate: string;
    nights: number;
    totalStayCost?: number;
    fees?: { id: string; name: string; amount: number }[];
  };
}

/**
 * Build the billData and itemAssignments for a generated bill from the template.
 *
 * New templates (quick/detailed/airbnb) store a full bill snapshot — copy it
 * verbatim. Legacy quick templates have no snapshot, so fall back to the
 * amount-based builder below.
 */
function buildBillPayload(template: RecurringBillDoc) {
  if (template.billData) {
    return {
      billData: template.billData,
      itemAssignments: template.itemAssignments ?? {},
    };
  }

  const { amount, title, people, splitEvenly, exactAmounts } = template;

  if (splitEvenly) {
    const itemId = `item-${Date.now()}`;
    return {
      billData: {
        items: [{ id: itemId, name: title, price: amount }],
        subtotal: amount,
        tax: 0,
        tip: 0,
        otherFees: 0,
        total: amount,
        restaurantName: title,
      },
      itemAssignments: { [itemId]: people.map((p) => p.id) },
    };
  }

  // Per-person exact amounts are charged verbatim (the entered numbers ARE the
  // agreement). Derive subtotal/total from the ACTUAL sum of those items rather
  // than the template `amount` — legacy templates may carry exact amounts that
  // don't sum to `amount`, and the generated bill must stay internally
  // consistent (items sum == total) or the ledger records a different number
  // than the bill shows.
  const amounts = resolveSplitAmounts(amount, people, 'exact', undefined, exactAmounts);
  const { items, itemAssignments } = buildPerPersonShareItems(people, amounts);
  const resolvedTotal = roundCents(Object.values(amounts).reduce((sum, v) => sum + v, 0));

  return {
    billData: {
      items,
      subtotal: resolvedTotal,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: resolvedTotal,
      restaurantName: title,
    },
    itemAssignments,
  };
}

/**
 * Is the event a template generates into archived?
 *
 * Read DEFENSIVELY, and fail OPEN. Three different kinds of absence all mean
 * "not archived", so generation continues exactly as it does today:
 *   - the event document does not exist (deleted, or never existed),
 *   - the document exists but has no `archived` field (every event written
 *     before the archive feature shipped),
 *   - the read itself failed.
 *
 * The last one is a deliberate trade: a transient Firestore error must never
 * silently stop somebody's rent split, and this check is a soft lock rather
 * than a security boundary — nothing here is the thing standing between a user
 * and an unauthorized write. It is logged at error level so a persistent
 * failure is visible instead of quietly disabling the feature.
 *
 * `isEventArchived` is the single arbiter of "archived" across client and
 * server; do not inline an `archived === true` check anywhere.
 */
async function isTargetEventArchived(db: Firestore, eventId: string): Promise<boolean> {
  try {
    const snap = await db.collection('events').doc(eventId).get();
    if (!snap.exists) return false;
    return isEventArchived((snap.data() ?? {}) as { archived?: boolean });
  } catch (error) {
    logger.error(
      `Could not read event ${eventId} to check its archive state; treating it as active`,
      error,
    );
    return false;
  }
}

/**
 * Generate all due/missed bills for a SINGLE template and advance its schedule.
 * Shared by the hourly batch pass and the immediate generate-on-create/edit path.
 * Returns the number of bills created. Throws on failure (callers decide whether
 * to swallow — the batch pass logs and continues, the catch-up is idempotent).
 */
async function generateForTemplate(
  db: Firestore,
  docSnap: FirebaseFirestore.QueryDocumentSnapshot | FirebaseFirestore.DocumentSnapshot,
  todayStr: string,
): Promise<number> {
  const template = docSnap.data() as RecurringBillDoc;
  const templateRef = docSnap.ref;
  let created = 0;

  // A template that generates into an ARCHIVED event stops generating.
  // Archiving is the user saying "this event is finished"; minting new bills
  // into it forever walks straight around that.
  //
  // The schedule cursor is deliberately NOT advanced while archived — nothing
  // ran, so nothing should claim to have run. It is fast-forwarded on RESUME
  // instead (see the catch-up loop below), which is what keeps unarchiving
  // from replaying a year of cycles at once. And the skip is NOT silent: a
  // user whose rent split just stops appearing would not notice for months, so
  // log it and record the reason on the template.
  if (template.eventId && (await isTargetEventArchived(db, template.eventId))) {
    // END DATE FIRST — a template whose window closed while its event was
    // archived is FINISHED, not paused. Resume only ever moves the cursor
    // forward, so once the end date is behind us there is no occurrence left
    // that could ever generate. Returning early without this leaves it
    // `status: 'active'` with a past nextRunDate, which the hourly due query
    // matches on every pass forever, burning an events/{id} read each time.
    if (template.schedule.endDate && template.schedule.endDate < todayStr) {
      logger.info(
        `Completing recurring bill ${docSnap.id}: end date ${template.schedule.endDate} passed while event ${template.eventId} was archived`,
        { recurringBillId: docSnap.id, eventId: template.eventId },
      );
      await templateRef.update({
        status: 'completed',
        // Terminal, so "why is generation paused" no longer applies. Removed
        // with delete(), never written back as undefined.
        ...(template.pausedReason !== undefined ? { pausedReason: FieldValue.delete() } : {}),
        updatedAt: Timestamp.now(),
      });
      return 0;
    }

    logger.warn(
      `Skipping recurring bill ${docSnap.id}: its event ${template.eventId} is archived`,
      { recurringBillId: docSnap.id, eventId: template.eventId },
    );

    // Only on the transition into the paused state: the hourly pass would
    // otherwise rewrite the same value (and churn updatedAt) every hour.
    if (template.pausedReason !== 'event-archived') {
      await templateRef.update({
        pausedReason: 'event-archived',
        updatedAt: Timestamp.now(),
      });
    }
    return 0;
  }

  // Catch-up loop: create bills for all missed cycles. On the very first
  // run, anchor to the aligned firstRunDate (repairs legacy docs whose
  // nextRunDate was seeded to the raw, unaligned startDate).
  let currentRunDate = template.lastRunDate
    ? template.nextRunDate
    : firstRunDate(template.schedule);

  // RESUMING AFTER AN ARCHIVED PAUSE: drop the cycles that ELAPSED while
  // archived, do not replay them.
  //
  // The cursor was frozen for as long as the event stayed archived, so by the
  // time we reach here it can sit arbitrarily far in the past. Feeding that to
  // the catch-up loop backfills EVERY skipped cycle in one call — a weekly
  // template on an event archived for a year mints ~52 bills in a single pass,
  // each one firing ledgerProcessor and moving real balances, with nothing
  // capping the loop.
  //
  // Archiving is a deliberate "this event is finished", so cycles that elapsed
  // while it was archived are cycles the user chose not to have.
  //
  // TWO CONDITIONS, BOTH LOAD-BEARING:
  //
  // `currentRunDate < todayStr` — only a cursor that is genuinely BEHIND has
  // lost anything. `pausedReason` records "the event was archived on some past
  // pass", NOT "cycles were missed": generateRecurringBillNowCore runs this
  // function on every template edit regardless of due-ness, so the flag can be
  // stamped on a template whose cursor is still in the future and then sit
  // there, stale, until the next due pass. Fast-forwarding unconditionally
  // would move such a cursor BACKWARDS (the first occurrence on/after today is
  // earlier than a future cursor) and mint a bill nobody asked for.
  //
  // Stop ON today, not after it. The cycle due TODAY has not elapsed — today
  // is today — so it generates exactly as it would for a template that was
  // never archived. Skipping it too would mean a 9-hour accidental archive
  // over a cycle boundary silently eats that cycle, unrecoverably: resume only
  // moves forward, and the deterministic bill id below makes the lost cycle
  // unreachable by any retry.
  //
  // Still incapable of exploding: the loop below can then only match the one
  // cycle equal to today, so resume creates at most ONE bill however long the
  // event sat archived.
  if (template.pausedReason === 'event-archived' && currentRunDate < todayStr) {
    const frozenRunDate = currentRunDate;

    // Bounded and stall-guarded, mirroring nextRunDateAfterEdit: the cap only
    // exists so a malformed schedule can never spin forever.
    const MAX_SKIPS = 10000;
    for (let i = 0; i < MAX_SKIPS && currentRunDate < todayStr; i++) {
      const next = advanceRunDate(
        currentRunDate,
        template.schedule.frequency,
        template.schedule.dayOfMonth,
      );
      if (next <= currentRunDate) break; // defensive: never stall
      currentRunDate = next;
    }

    logger.info(
      `Recurring bill ${docSnap.id} resumed after its event was unarchived: dropping the cycles from ${frozenRunDate} up to ${todayStr}, resuming at ${currentRunDate}`,
      { recurringBillId: docSnap.id, eventId: template.eventId },
    );
  }

  const newBillIds: string[] = [];

  while (currentRunDate <= todayStr) {
    // Check end date
    if (template.schedule.endDate && currentRunDate > template.schedule.endDate) {
      break;
    }

    // Idempotency check: skip if bill already exists for this cycle
    const existing = await db
      .collection('bills')
      .where('recurringBillId', '==', template.id)
      .where('recurringCycleDate', '==', currentRunDate)
      .limit(1)
      .get();

    if (existing.empty) {
      const { billData, itemAssignments } = buildBillPayload(template);
      const generatedType = template.generatedType ?? 'quick';

      // Type-specific flags spread into the generated bill doc.
      const extraFields: Record<string, unknown> = {
        recurringBillId: template.id,
        recurringCycleDate: currentRunDate,
        title: template.title,
      };
      if (generatedType === 'airbnb') {
        extraFields.isAirbnb = true;
        if (template.airbnbData) extraFields.airbnbData = template.airbnbData;
      }

      // Deterministic ID: one document per (template, cycle). The existence
      // query above is a non-transactional check-then-create, so the hourly
      // scheduler and the client-fired generateRecurringBillNow can both see
      // "no bill yet" and each create one — double-charging the group. Keying
      // the document turns that race into a loud ALREADY_EXISTS we can absorb.
      let billId: string | null = null;
      try {
        billId = await createBillCore(db, {
          billType: template.eventId ? 'event' : 'private',
          billData,
          people: template.people,
          ownerId: template.ownerId,
          ownerName: template.ownerName,
          paidById: template.paidById,
          eventId: template.eventId,
          // This processor has ALREADY applied the archive policy above — and a
          // deliberately different one: it pauses on a confirmed archive but
          // fails OPEN on a missing event or a failed read, because an
          // unattended rent split that vanishes silently is worse than one that
          // generates into a stale event. Letting the core re-check here would
          // override that with its own fail-closed policy and reintroduce the
          // silent stop. See CreateBillCoreParams.eventArchiveAlreadyChecked.
          eventArchiveAlreadyChecked: true,
          status: 'active',
          splitEvenly: template.splitEvenly,
          isSimpleTransaction: generatedType === 'quick',
          itemAssignments,
          extraFields,
          billId: `${template.id}_${currentRunDate}`,
        });
      } catch (err) {
        const code = (err as { code?: number | string })?.code;
        const alreadyExists =
          code === 6 || code === 'already-exists' || /ALREADY_EXISTS/i.test(String(err));
        if (!alreadyExists) throw err;
        console.log(
          `Skipped duplicate bill for recurring ${template.id} (cycle ${currentRunDate}) — created concurrently`,
        );
      }

      if (billId) {
        newBillIds.push(billId);
        created++;
        console.log(
          `Created bill ${billId} for recurring ${template.id} (cycle ${currentRunDate})`,
        );
      }
    }

    // Advance to next cycle
    currentRunDate = advanceRunDate(
      currentRunDate,
      template.schedule.frequency,
      template.schedule.dayOfMonth,
    );
  }

  // Update the template
  const updates: Record<string, unknown> = {
    lastRunDate: todayStr,
    nextRunDate: currentRunDate,
    updatedAt: Timestamp.now(),
  };

  if (newBillIds.length > 0) {
    updates.generatedBillIds = FieldValue.arrayUnion(...newBillIds);
  }

  // We got past the archive check, so the template is generating again and any
  // recorded pause reason is stale. Remove the field rather than writing
  // `undefined`, which Firestore rejects.
  if (template.pausedReason !== undefined) {
    updates.pausedReason = FieldValue.delete();
  }

  // If next run is past end date, mark as completed
  if (template.schedule.endDate && currentRunDate > template.schedule.endDate) {
    updates.status = 'completed';
  }

  await templateRef.update(updates);
  return created;
}

/**
 * Core generation pass: for every active template due on/before `todayStr`,
 * create bills for all missed cycles and advance the schedule. Pure of any
 * trigger plumbing so it can be driven by the hourly scheduler, a dev HTTP
 * trigger, or a unit test. `todayStr` is injectable so backfill can be tested
 * deterministically.
 */
export async function generateDueRecurringBills(
  db: Firestore,
  todayStr: string,
): Promise<{ processed: number; created: number }> {
  // Query all active recurring bills that are due
  const snapshot = await db
    .collection('recurring_bills')
    .where('status', '==', 'active')
    .where('nextRunDate', '<=', todayStr)
    .get();

  if (snapshot.empty) {
    console.log('No recurring bills due.');
    return { processed: 0, created: 0 };
  }

  console.log(`Processing ${snapshot.size} recurring bill(s)...`);
  let created = 0;

  for (const docSnap of snapshot.docs) {
    try {
      created += await generateForTemplate(db, docSnap, todayStr);
    } catch (error) {
      console.error(`Failed to process recurring bill ${docSnap.id}:`, error);
      // Continue with other templates — don't let one failure block the rest
    }
  }

  console.log('Recurring bill processing complete.');
  return { processed: snapshot.size, created };
}

/**
 * Immediate, single-template generation for the create/edit flow. Verifies the
 * caller owns the template, then runs the same catch-up generation so any
 * already-due / overdue cycles are created right away instead of waiting up to
 * an hour for the scheduler. Idempotent with the hourly pass (existing-cycle
 * check prevents duplicates).
 */
export async function generateRecurringBillNowCore(
  db: Firestore,
  recurringBillId: string,
  ownerId: string,
  todayStr: string,
): Promise<{ created: number }> {
  const docSnap = await db.collection('recurring_bills').doc(recurringBillId).get();

  if (!docSnap.exists) {
    throw new Error('Recurring bill not found');
  }

  const template = docSnap.data() as RecurringBillDoc;
  if (template.ownerId !== ownerId) {
    throw new Error('Not authorized to generate this recurring bill');
  }

  // Only active templates generate; paused/completed are no-ops.
  if (template.status !== 'active') {
    return { created: 0 };
  }

  const created = await generateForTemplate(db, docSnap, todayStr);
  return { created };
}

/**
 * Scheduled Cloud Function that runs every hour and generates all due bills.
 */
export const processRecurringBills = onSchedule(
  {
    schedule: 'every 1 hours',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async () => {
    const db = getFirestore();
    const todayStr = new Date().toISOString().split('T')[0];
    await generateDueRecurringBills(db, todayStr);
  },
);

/**
 * Dev-only HTTP trigger to run a generation pass on demand against the
 * emulator (the scheduler never fires locally). Pass ?today=YYYY-MM-DD to
 * simulate a run date for backfill testing. Exported ONLY under the emulator
 * (see index.ts) so it is never deployed to production.
 */
export const devTriggerRecurringBills = onRequest(async (req, res) => {
  const db = getFirestore();
  const today =
    (typeof req.query.today === 'string' && req.query.today) ||
    new Date().toISOString().split('T')[0];
  const result = await generateDueRecurringBills(db, today);
  res.json({ ok: true, today, ...result });
});
