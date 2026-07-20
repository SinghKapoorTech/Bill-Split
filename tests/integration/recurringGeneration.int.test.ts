/**
 * Recurring bill generation — flow & lifecycle integration tests.
 *
 * Complements tests/integration/recurringAndFriends.int.test.ts (basic
 * generation, legacy exact-split consistency, idempotency) by covering the
 * parts of the flow that only show up against real Firestore:
 *   - eligibility (which templates a pass picks up at all)
 *   - catch-up/backfill across missed cycles, incl. the legacy nextRunDate repair
 *   - endDate termination + status transition to 'completed'
 *   - the shape of the generated bill per generatedType (quick/detailed/airbnb)
 *   - template bookkeeping (generatedBillIds, lastRunDate, nextRunDate)
 *   - downstream usage: event bills, ledger accumulation, deletion reversal
 *
 * Dates are fixed and `todayStr` is injected, so nothing here depends on when
 * the suite runs.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db, clearFirestore } from "./helpers/env";
import { makeEvent } from "./helpers/builders";
import { withBillTriggers, deleteBill } from "./helpers/triggerLoop";
import { generateDueRecurringBills } from "../../functions/src/recurringBillProcessor";
import { firstRunDate } from "../../shared/recurringSchedule";

const ALICE = "alice";
const BOB = "bob";
const PAIR_ID = "alice_bob";

const PEOPLE = [
  { id: `user-${ALICE}`, name: "Alice" },
  { id: `user-${BOB}`, name: "Bob" },
];

/** A minimal-valid active template; override any field per test. */
function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec1",
    ownerId: ALICE,
    ownerName: "Alice",
    title: "Rent",
    amount: 100,
    paidById: ALICE,
    people: PEOPLE,
    splitEvenly: true,
    schedule: { frequency: "monthly", dayOfMonth: 1, startDate: "2026-01-01" },
    status: "active",
    nextRunDate: "2026-07-01",
    lastRunDate: "2026-06-01",
    generatedBillIds: [],
    ...overrides,
  };
}

async function seedTemplate(overrides: Record<string, unknown> = {}) {
  const template = makeTemplate(overrides);
  await db
    .collection("recurring_bills")
    .doc(template.id as string)
    .set(template);
  return template;
}

async function getTemplate(id = "rec1") {
  return (await db.collection("recurring_bills").doc(id).get()).data()!;
}

/** Generated bills for a template, sorted by the cycle they belong to. */
async function generatedBills(recurringId = "rec1") {
  const snap = await db
    .collection("bills")
    .where("recurringBillId", "==", recurringId)
    .get();
  return snap.docs
    .map((d) => d.data())
    .sort((a, b) =>
      String(a.recurringCycleDate).localeCompare(String(b.recurringCycleDate)),
    );
}

async function getBalance(pairId = PAIR_ID) {
  const snap = await db.collection("balances").doc(pairId).get();
  return snap.exists ? snap.data()! : null;
}

// ── Eligibility: which templates a pass picks up ────────────────────────────

describe("recurring generation — template eligibility", () => {
  beforeEach(clearFirestore);

  it("skips a paused template even when its next run date has passed", async () => {
    await seedTemplate({ status: "paused", nextRunDate: "2026-01-01" });

    const result = await generateDueRecurringBills(db, "2026-07-01");

    expect(result).toEqual({ processed: 0, created: 0 });
    expect(await generatedBills()).toHaveLength(0);
    // Paused templates must be left completely untouched, so resuming picks up
    // exactly where it left off.
    expect((await getTemplate()).nextRunDate).toBe("2026-01-01");
    expect((await getTemplate()).lastRunDate).toBe("2026-06-01");
  });

  it("skips a completed template", async () => {
    await seedTemplate({ status: "completed", nextRunDate: "2026-01-01" });

    expect(await generateDueRecurringBills(db, "2026-07-01")).toEqual({
      processed: 0,
      created: 0,
    });
    expect(await generatedBills()).toHaveLength(0);
  });

  it("skips a template whose next run date is still in the future", async () => {
    await seedTemplate({
      nextRunDate: "2026-08-01",
      lastRunDate: "2026-07-01",
    });

    expect(await generateDueRecurringBills(db, "2026-07-15")).toEqual({
      processed: 0,
      created: 0,
    });
    expect(await generatedBills()).toHaveLength(0);
    expect((await getTemplate()).lastRunDate).toBe("2026-07-01"); // bookkeeping untouched
  });
});

// ── Catch-up / backfill across missed cycles ────────────────────────────────

describe("recurring generation — catch-up across missed cycles", () => {
  beforeEach(clearFirestore);

  it("backfills every missed weekly cycle in a single pass and advances the template", async () => {
    // 2026-06-01 is a Monday. Never run before (lastRunDate null).
    await seedTemplate({
      schedule: { frequency: "weekly", dayOfWeek: 1, startDate: "2026-06-01" },
      nextRunDate: "2026-06-01",
      lastRunDate: null,
    });

    const result = await generateDueRecurringBills(db, "2026-06-22");

    expect(result).toEqual({ processed: 1, created: 4 });
    const bills = await generatedBills();
    expect(bills.map((b) => b.recurringCycleDate)).toEqual([
      "2026-06-01",
      "2026-06-08",
      "2026-06-15",
      "2026-06-22",
    ]);

    const template = await getTemplate();
    expect(template.nextRunDate).toBe("2026-06-29"); // one cycle past the last created
    expect(template.lastRunDate).toBe("2026-06-22");
    expect(template.status).toBe("active");
    // Every generated bill is linked back on the template.
    expect(template.generatedBillIds).toHaveLength(4);
    expect([...template.generatedBillIds].sort()).toEqual(
      bills.map((b) => b.id).sort(),
    );
  });

  it("anchors a first-ever run to the aligned first occurrence, not a raw unaligned start date", async () => {
    // Legacy repair path: nextRunDate was seeded to the raw startDate (the 1st)
    // while the schedule actually fires on the 15th. The first run must realign
    // rather than generate an off-schedule bill dated the 1st.
    await seedTemplate({
      schedule: {
        frequency: "monthly",
        dayOfMonth: 15,
        startDate: "2026-05-01",
      },
      nextRunDate: "2026-05-01",
      lastRunDate: null,
    });

    const result = await generateDueRecurringBills(db, "2026-07-20");

    expect(result.created).toBe(3);
    const cycles = (await generatedBills()).map((b) => b.recurringCycleDate);
    expect(cycles).toEqual(["2026-05-15", "2026-06-15", "2026-07-15"]);
    expect(cycles).not.toContain("2026-05-01"); // the unaligned seed never becomes a bill
    expect((await getTemplate()).nextRunDate).toBe("2026-08-15");
  });

  it("accumulates the ledger once per backfilled cycle", async () => {
    await seedTemplate({
      amount: 100,
      splitEvenly: true,
      schedule: { frequency: "weekly", dayOfWeek: 1, startDate: "2026-06-01" },
      nextRunDate: "2026-06-01",
      lastRunDate: null,
    });

    await withBillTriggers(() => generateDueRecurringBills(db, "2026-06-15"));

    // 3 cycles × ($100 split 2 ways) → Bob owes Alice 150.
    const balance = await getBalance();
    expect(balance!.balance).toBeCloseTo(150, 2);
    expect(balance!.unsettledBillIds).toHaveLength(3);
  });
});

// ── endDate termination ─────────────────────────────────────────────────────

describe("recurring generation — end date", () => {
  beforeEach(clearFirestore);

  it("stops at the end date and marks the template completed", async () => {
    await seedTemplate({
      schedule: {
        frequency: "monthly",
        dayOfMonth: 1,
        startDate: "2026-01-01",
        endDate: "2026-03-01",
      },
      nextRunDate: "2026-01-01",
      lastRunDate: null,
    });

    const result = await generateDueRecurringBills(db, "2026-06-01");

    // Only the 3 cycles up to and including the end date — not every cycle
    // between the start date and today.
    expect(result.created).toBe(3);
    expect((await generatedBills()).map((b) => b.recurringCycleDate)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
    ]);
    expect((await getTemplate()).status).toBe("completed");
  });

  it("does not generate again once the template has completed", async () => {
    await seedTemplate({
      schedule: {
        frequency: "monthly",
        dayOfMonth: 1,
        startDate: "2026-01-01",
        endDate: "2026-03-01",
      },
      nextRunDate: "2026-01-01",
      lastRunDate: null,
    });

    await generateDueRecurringBills(db, "2026-06-01");
    const second = await generateDueRecurringBills(db, "2026-09-01");

    expect(second).toEqual({ processed: 0, created: 0 }); // status is now 'completed'
    expect(await generatedBills()).toHaveLength(3);
  });
});

// ── Shape of the generated bill, per generatedType ──────────────────────────

describe("recurring generation — generated bill shape", () => {
  beforeEach(clearFirestore);

  it("builds an evenly-split simple transaction from a legacy quick template", async () => {
    await seedTemplate({ amount: 100, splitEvenly: true, title: "Rent" });

    await generateDueRecurringBills(db, "2026-07-01");

    const [bill] = await generatedBills();
    expect(bill.billData.items).toHaveLength(1);
    expect(bill.billData.items[0]).toMatchObject({ name: "Rent", price: 100 });
    expect(bill.billData.total).toBe(100);
    expect(bill.billData.restaurantName).toBe("Rent");
    // The single item is shared by everyone on the template.
    expect(bill.itemAssignments[bill.billData.items[0].id]).toEqual([
      `user-${ALICE}`,
      `user-${BOB}`,
    ]);
    expect(bill.isSimpleTransaction).toBe(true);
    expect(bill.billType).toBe("private");
    expect(bill.paidById).toBe(ALICE);
    expect(bill.title).toBe("Rent");
    expect(bill.recurringBillId).toBe("rec1");
    expect(bill.recurringCycleDate).toBe("2026-07-01");
  });

  it("copies a detailed template snapshot verbatim instead of rebuilding from amount", async () => {
    const billData = {
      items: [
        { id: "item-1", name: "Internet", price: 60 },
        { id: "item-2", name: "Electric", price: 40 },
      ],
      subtotal: 100,
      tax: 8,
      tip: 0,
      otherFees: 2,
      total: 110,
      restaurantName: "Utilities",
    };
    const itemAssignments = {
      "item-1": [`user-${ALICE}`, `user-${BOB}`],
      "item-2": [`user-${BOB}`],
    };
    await seedTemplate({
      generatedType: "detailed",
      amount: 110,
      billData,
      itemAssignments,
    });

    await generateDueRecurringBills(db, "2026-07-01");

    const [bill] = await generatedBills();
    expect(bill.billData).toEqual(billData); // per-item detail preserved
    expect(bill.itemAssignments).toEqual(itemAssignments); // incl. the uneven split
    expect(bill.isSimpleTransaction).toBe(false);
    expect(bill.isAirbnb).toBeUndefined();
  });

  it("carries airbnb stay metadata onto each generated occurrence", async () => {
    const airbnbData = {
      startDate: "2026-07-01",
      endDate: "2026-07-05",
      nights: 4,
      totalStayCost: 800,
      fees: [{ id: "fee-1", name: "Cleaning", amount: 100 }],
    };
    const billData = {
      items: [{ id: "item-1", name: "Stay", price: 900 }],
      subtotal: 900,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: 900,
      restaurantName: "Tahoe Cabin",
    };
    await seedTemplate({
      generatedType: "airbnb",
      amount: 900,
      billData,
      itemAssignments: { "item-1": [`user-${ALICE}`, `user-${BOB}`] },
      airbnbData,
    });

    await generateDueRecurringBills(db, "2026-07-01");

    const [bill] = await generatedBills();
    expect(bill.isAirbnb).toBe(true);
    expect(bill.airbnbData).toEqual(airbnbData);
    expect(bill.isSimpleTransaction).toBe(false);
    expect(bill.billData).toEqual(billData);
  });
});

// ── Downstream usage of generated bills ─────────────────────────────────────

describe("recurring generation — downstream usage", () => {
  beforeEach(clearFirestore);

  it("generates event bills that feed the per-pair event ledger", async () => {
    await db
      .collection("events")
      .doc("trip1")
      .set(makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }));
    await seedTemplate({ eventId: "trip1", amount: 100, splitEvenly: true });

    await withBillTriggers(() => generateDueRecurringBills(db, "2026-07-01"));

    const [bill] = await generatedBills();
    expect(bill.billType).toBe("event");
    expect(bill.eventId).toBe("trip1");

    // Flows into both the event-scoped and global friend ledgers.
    const eventBalance = await db
      .collection("event_balances")
      .doc("trip1_alice_bob")
      .get();
    expect(eventBalance.exists).toBe(true);
    expect(eventBalance.data()!.balance).toBeCloseTo(50, 2);
    expect((await getBalance())!.balance).toBeCloseTo(50, 2);
  });

  it("reverses the ledger when a generated bill is deleted", async () => {
    await seedTemplate({ amount: 100, splitEvenly: true });
    await withBillTriggers(() => generateDueRecurringBills(db, "2026-07-01"));
    expect((await getBalance())!.balance).toBeCloseTo(50, 2);

    const [bill] = await generatedBills();
    await deleteBill(bill.id);

    // Deleting one occurrence unwinds only that occurrence's contribution.
    const balance = await getBalance();
    expect(balance!.balance).toBeCloseTo(0, 2);
    expect(balance!.unsettledBillIds ?? []).not.toContain(bill.id);
  });
});

// ── Reported bug: past start date produces no bills on create ───────────────

describe("recurring generation — past start date on create (reported bug)", () => {
  beforeEach(clearFirestore);

  /**
   * Mirrors exactly what recurringBillService.createRecurringBill() writes when
   * the user presses Done: nextRunDate anchored via the SAME shared helper the
   * client uses, lastRunDate null, status active.
   */
  async function seedAsClientWould(startDate: string) {
    const schedule = {
      frequency: "monthly" as const,
      dayOfMonth: 1,
      startDate,
    };
    await db
      .collection("recurring_bills")
      .doc("rec1")
      .set(
        makeTemplate({
          schedule,
          nextRunDate: firstRunDate(schedule), // client: computeNextRunDate()
          lastRunDate: null,
          amount: 100,
          splitEvenly: true,
        }),
      );
  }

  it("writing the template alone creates no bills — generation is a separate step", async () => {
    await seedAsClientWould("2026-04-01");

    // No generation pass has run. This is the reported symptom: pressing Done
    // persists the template but nothing generates the overdue occurrences.
    expect(await generatedBills()).toHaveLength(0);

    // The template is nonetheless correctly seeded as *due* — its next run is
    // in the past, so any generation pass will pick it up.
    const template = await getTemplate();
    expect(template.status).toBe("active");
    expect(template.nextRunDate).toBe("2026-04-01");
    expect(template.nextRunDate < "2026-07-19").toBe(true);
  });

  it("a generation pass backfills every past occurrence — the logic itself is sound", async () => {
    await seedAsClientWould("2026-04-01");

    await withBillTriggers(() => generateDueRecurringBills(db, "2026-07-19"));

    // April, May, June, July — every cycle between the past start date and today.
    expect((await generatedBills()).map((b) => b.recurringCycleDate)).toEqual([
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
      "2026-07-01",
    ]);
    // And the backfill lands on the ledger: 4 × ($100 split 2 ways).
    expect((await getBalance())!.balance).toBeCloseTo(200, 2);
  });
});

// ── Fault isolation ─────────────────────────────────────────────────────────

describe("recurring generation — fault isolation", () => {
  beforeEach(clearFirestore);
  // The processor logs the failing template; keep the expected noise out of the
  // test output while still asserting it was reported.
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  afterEach(() => errorSpy.mockClear());

  it("keeps processing other templates when one template throws", async () => {
    // Malformed: no schedule at all, so the first-run anchoring throws.
    await db
      .collection("recurring_bills")
      .doc("rec-broken")
      .set(
        makeTemplate({ id: "rec-broken", schedule: null, lastRunDate: null }),
      );
    await seedTemplate({ id: "rec-good" });

    const result = await generateDueRecurringBills(db, "2026-07-01");

    expect(result.processed).toBe(2);
    expect(result.created).toBe(1); // the healthy template still ran
    expect(await generatedBills("rec-good")).toHaveLength(1);
    expect(await generatedBills("rec-broken")).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled(); // failure was surfaced, not swallowed silently
  });
});
