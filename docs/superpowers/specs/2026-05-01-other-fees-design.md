# Other Fees Feature Design

**Date:** 2026-05-01  
**Status:** Approved

## Overview

Add an "Other Fees" field to bills to capture delivery fees, service fees, long distance fees, platform fees, and any other charges that are not tax or tip. The field is a single combined number, distributed proportionally among bill participants (same model as tax and tip), extracted automatically by Gemini AI from receipts, and manually editable by users.

## Data Model

### `BillData` (`src/types/bill.types.ts` and `shared/types.ts`)

Add `otherFees: number` alongside `tax` and `tip`:

```typescript
interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  otherFees: number;   // delivery, service, long distance, platform fees, etc.
  total: number;
  restaurantName?: string;
}
```

Backward compatibility: old Firestore bills without `otherFees` read as `undefined` and are treated as `0` via `?? 0` at every call site.

### `PersonTotal` (`shared/types.ts`)

Add `otherFees: number` to the per-person breakdown:

```typescript
interface PersonTotal {
  personId: string;
  name: string;
  itemsSubtotal: number;
  tax: number;
  tip: number;
  otherFees: number;
  total: number;
}
```

## Calculations (`shared/calculations.ts`)

`calculatePersonTotals` receives a new `effectiveOtherFees` parameter. Distribution is proportional to each person's item subtotal share — identical to tax and tip:

```
personOtherFees = effectiveOtherFees × (personSubtotal / totalAssignedSubtotal)
personTotal = personSubtotal + personTax + personTip + personOtherFees
```

All call sites pass `billData.otherFees ?? 0` as `effectiveOtherFees`.

## AI Extraction (`functions/src/index.ts`)

Gemini prompt updated to include `otherFees` in the JSON schema and instructions:

- JSON example includes `"otherFees": 3.99`
- Rule: sum all delivery fees, service fees, long distance fees, platform fees, and any non-tax/non-tip charges into `otherFees`; set to `0` if none
- Response parser defaults `otherFees` to `0` if absent from AI response

## UI Changes

### `BillSummary.tsx`

New "Other Fees" input row between Tip and Total, identical in behavior to Tax and Tip:

```
Subtotal    $50.00
Tax         [ editable ]
Tip         [ editable ]
Other Fees  [ editable ]   ← NEW
────────────────────────
Total       $68.99
```

- Input: `type="number"`, `step="0.01"`, `min="0"`
- `handleOtherFeesChange`: parses float, validates `>= 0`, recalculates `total = subtotal + tax + tip + otherFees`

### Bill Wizard Review Step

Per-person breakdown includes `otherFees` line when non-zero.

### Venmo Charge Description

`generateItemDescription()` appends other fees to the itemized note if `otherFees > 0`.

### `billService.ts`

`createBill()` and simple transaction creator default `otherFees: 0`.

### `useBillSession.ts`

Passes `billData.otherFees ?? 0` as `effectiveOtherFees` when calling `calculatePersonTotals`.

### Cloud Function Ledger Pipeline

No direct changes needed — the pipeline uses `shared/calculations.ts` and picks up `otherFees` automatically once the calculation function is updated.

## Backward Compatibility

- All existing Firestore bills remain valid — missing `otherFees` defaults to `0`
- No migration required
- `total` on old bills is unaffected (was already correct without `otherFees`)
