import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { createBillCore } from './billFunctions.js';
import { firstRunDate, advanceRunDate } from '../../shared/recurringSchedule.js';

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
      itemAssignments: { [itemId]: people.map(p => p.id) },
    };
  }

  // Per-person exact amounts
  const items: { id: string; name: string; price: number }[] = [];
  const assignments: Record<string, string[]> = {};
  let runningTotal = 0;

  people.forEach((person, i) => {
    const itemId = `item-${person.id}`;
    let price: number;
    if (i === people.length - 1) {
      price = Math.round((amount - runningTotal) * 100) / 100;
    } else {
      price = Math.round((exactAmounts?.[person.id] || 0) * 100) / 100;
    }
    runningTotal += price;
    items.push({ id: itemId, name: `${person.name}'s share`, price });
    assignments[itemId] = [person.id];
  });

  return {
    billData: {
      items,
      subtotal: amount,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: amount,
      restaurantName: title,
    },
    itemAssignments: assignments,
  };
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
  todayStr: string
): Promise<number> {
  const template = docSnap.data() as RecurringBillDoc;
  const templateRef = docSnap.ref;
  let created = 0;

  // Catch-up loop: create bills for all missed cycles. On the very first
  // run, anchor to the aligned firstRunDate (repairs legacy docs whose
  // nextRunDate was seeded to the raw, unaligned startDate).
  let currentRunDate = template.lastRunDate
    ? template.nextRunDate
    : firstRunDate(template.schedule);
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

      const billId = await createBillCore(db, {
        billType: template.eventId ? 'event' : 'private',
        billData,
        people: template.people,
        ownerId: template.ownerId,
        ownerName: template.ownerName,
        paidById: template.paidById,
        eventId: template.eventId,
        status: 'active',
        splitEvenly: template.splitEvenly,
        isSimpleTransaction: generatedType === 'quick',
        itemAssignments,
        extraFields,
      });

      newBillIds.push(billId);
      created++;
      console.log(`Created bill ${billId} for recurring ${template.id} (cycle ${currentRunDate})`);
    }

    // Advance to next cycle
    currentRunDate = advanceRunDate(
      currentRunDate,
      template.schedule.frequency,
      template.schedule.dayOfMonth
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
  todayStr: string
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
  todayStr: string
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
  }
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
