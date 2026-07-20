import { describe, it, expect } from "vitest";
import {
  calculateBillTotals,
  mergeBillData,
  getSettlementStatus,
  getSettlementStatusForUser,
  initialWizardStep,
} from "@/utils/billCalculations";
import type { Bill, BillData } from "@/types";

describe("initialWizardStep", () => {
  const REVIEW = 3;

  it("opens a recurring-generated bill on the review step", () => {
    expect(initialWizardStep({ recurringBillId: "tmpl-1" }, REVIEW)).toBe(
      REVIEW,
    );
  });

  it("opens an ordinary new bill on the first step", () => {
    expect(initialWizardStep({}, REVIEW)).toBe(0);
  });

  it("respects a step the user actually reached on a generated bill", () => {
    expect(
      initialWizardStep({ recurringBillId: "tmpl-1", currentStep: 1 }, REVIEW),
    ).toBe(1);
  });

  it("returns a saved step for an ordinary non-recurring bill", () => {
    expect(initialWizardStep({ currentStep: 2 }, REVIEW)).toBe(2);
  });

  it("respects an explicitly saved step 0 rather than treating it as unset", () => {
    // The bug: `currentStep || 0` cannot tell "never saved" from "saved as 0",
    // so a user who walked back to step 0 would be bounced to review again.
    expect(
      initialWizardStep({ recurringBillId: "tmpl-1", currentStep: 0 }, REVIEW),
    ).toBe(0);
  });
});

describe("calculateBillTotals", () => {
  it("sums item prices and adds tax, tip, and fees", () => {
    const items = [
      { id: "a", name: "Pizza", price: 20 },
      { id: "b", name: "Soda", price: 10.5 },
    ];
    // 30.50 items + 3 tax + 6 tip + 1.50 fees = 41
    expect(calculateBillTotals(items, 3, 6, 1.5)).toEqual({
      subtotal: 30.5,
      total: 41,
    });
  });

  it("defaults otherFees to zero", () => {
    expect(
      calculateBillTotals([{ id: "a", name: "X", price: 10 }], 1, 2),
    ).toEqual({
      subtotal: 10,
      total: 13,
    });
  });
});

describe("mergeBillData", () => {
  it("combines items, sums subtotals and fees, keeps existing tax/tip", () => {
    const existing: BillData = {
      items: [{ id: "a", name: "Pizza", price: 10 }],
      subtotal: 10,
      tax: 2,
      tip: 3,
      otherFees: 1,
      total: 16,
      restaurantName: "First Place",
    };
    const incoming: BillData = {
      items: [{ id: "b", name: "Wings", price: 5 }],
      subtotal: 5,
      tax: 4,
      tip: 1,
      otherFees: 2,
      total: 12,
      restaurantName: "Second Place",
    };

    const merged = mergeBillData(existing, incoming);
    expect(merged.items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(merged.subtotal).toBe(15);
    expect(merged.tax).toBe(2); // existing kept
    expect(merged.tip).toBe(3); // existing kept
    expect(merged.otherFees).toBe(3); // fees add up
    expect(merged.total).toBe(15 + 2 + 3 + 3);
    expect(merged.restaurantName).toBe("First Place");
  });
});

describe("getSettlementStatus", () => {
  const bill = (people: number, settled: string[]): Bill =>
    ({
      people: Array.from({ length: people }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
      })),
      settledPersonIds: settled,
    }) as unknown as Bill;

  it("is unsettled when no debtor has paid", () => {
    expect(getSettlementStatus(bill(3, []))).toBe("unsettled");
  });

  it("is partial when some but not all debtors have paid", () => {
    expect(getSettlementStatus(bill(3, ["p1"]))).toBe("partial");
  });

  it("is settled when all debtors have paid (owner excluded)", () => {
    expect(getSettlementStatus(bill(3, ["p1", "p2"]))).toBe("settled");
  });

  it("a single-person bill is always settled", () => {
    expect(getSettlementStatus(bill(1, []))).toBe("settled");
  });
});

describe("getSettlementStatusForUser", () => {
  it("owner sees the aggregate status", () => {
    const bill = {
      ownerId: "owner1",
      people: [{ id: "a" }, { id: "b" }, { id: "c" }],
      settledPersonIds: ["b"],
    } as unknown as Bill;
    expect(getSettlementStatusForUser(bill, "owner1")).toBe("partial");
  });

  it("debtor sees their own status from unsettledParticipantIds", () => {
    const bill = {
      ownerId: "owner1",
      people: [{ id: "user-owner1" }, { id: "user-deb1" }],
      unsettledParticipantIds: ["deb1"],
    } as unknown as Bill;
    expect(getSettlementStatusForUser(bill, "deb1")).toBe("unsettled");

    const paid = { ...bill, unsettledParticipantIds: [] } as unknown as Bill;
    expect(getSettlementStatusForUser(paid, "deb1")).toBe("settled");
  });

  it("falls back to settledPersonIds for legacy bills (both id formats)", () => {
    const bill = {
      ownerId: "owner1",
      people: [{ id: "user-owner1" }, { id: "user-deb1" }],
      settledPersonIds: ["user-deb1"],
    } as unknown as Bill;
    expect(getSettlementStatusForUser(bill, "deb1")).toBe("settled");
  });
});
