import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { createBillCore } from './billFunctions.js';

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
 * Advance a date by the given frequency.
 */
function advanceDate(
  dateStr: string,
  frequency: 'weekly' | 'biweekly' | 'monthly',
  dayOfMonth?: number
): string {
  const d = new Date(dateStr + 'T00:00:00Z');

  if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (frequency === 'biweekly') {
    d.setUTCDate(d.getUTCDate() + 14);
  } else {
    // Monthly: advance to same day next month, clamp to last day.
    // Must set day to 1 first to avoid month overflow (e.g., Jan 31 → Feb 31 → Mar 3).
    const targetDay = dayOfMonth ?? d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(targetDay, lastDay));
  }

  return d.toISOString().split('T')[0];
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
 * Scheduled Cloud Function that runs every hour.
 * Queries active recurring bills whose nextRunDate <= today,
 * creates bills for all due/missed cycles, and advances the schedule.
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

    // Query all active recurring bills that are due
    const snapshot = await db
      .collection('recurring_bills')
      .where('status', '==', 'active')
      .where('nextRunDate', '<=', todayStr)
      .get();

    if (snapshot.empty) {
      console.log('No recurring bills due.');
      return;
    }

    console.log(`Processing ${snapshot.size} recurring bill(s)...`);

    for (const docSnap of snapshot.docs) {
      const template = docSnap.data() as RecurringBillDoc;
      const templateRef = docSnap.ref;

      try {
        // Catch-up loop: create bills for all missed cycles
        let currentRunDate = template.nextRunDate;
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
            console.log(`Created bill ${billId} for recurring ${template.id} (cycle ${currentRunDate})`);
          }

          // Advance to next cycle
          currentRunDate = advanceDate(
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
      } catch (error) {
        console.error(`Failed to process recurring bill ${template.id}:`, error);
        // Continue with other templates — don't let one failure block the rest
      }
    }

    console.log('Recurring bill processing complete.');
  }
);
