# Other Fees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Other Fees" field (delivery, service, long distance, platform fees, etc.) to bills — extracted by AI, manually editable, and distributed proportionally among participants alongside tax and tip.

**Architecture:** Add `otherFees: number` to `BillData` and `PersonTotal` types, thread it through `calculatePersonTotals` with a new parameter, update all four call sites, update the Gemini AI prompt, and add a UI input row in `BillSummary`. Old bills without the field default to `0` everywhere via `?? 0`.

**Tech Stack:** TypeScript, React, Firebase Cloud Functions, Gemini AI (via `@google/generative-ai`)

---

## File Map

| File | Change |
|------|--------|
| `shared/types.ts` | Add `otherFees: number` to `BillData` and `PersonTotal` |
| `src/types/bill.types.ts` | Add `otherFees: number` to `BillData` |
| `shared/calculations.ts` | Add `effectiveOtherFees` param, distribute proportionally |
| `src/hooks/useBillSplitter.ts` | Pass `billData?.otherFees ?? 0` to `calculatePersonTotals` |
| `src/utils/eventBalanceCalculator.ts` | Pass `bill.billData.otherFees ?? 0` to `calculatePersonTotals` |
| `functions/src/ledgerProcessor.ts` | Pass `billData.otherFees ?? 0` to `calculatePersonTotals` |
| `functions/src/billFunctions.ts` | Pass `billData.otherFees ?? 0` to `calculatePersonTotals` |
| `src/services/billService.ts` | Add `otherFees: 0` to all `BillData` literals |
| `src/components/bill/BillSummary.tsx` | Add "Other Fees" input row; update all total calculations |
| `src/components/people/SplitSummary.tsx` | Add `otherFees` line in per-person detail breakdown |
| `functions/src/index.ts` | Update Gemini prompt + normalize `otherFees` in response parser |
| `docs/superpowers/specs/2026-05-01-other-fees-design.md` | Include in final commit |

---

## Task 1: Update Shared Types

**Files:**
- Modify: `shared/types.ts`

- [ ] **Step 1: Add `otherFees` to `BillData` and `PersonTotal` in `shared/types.ts`**

Replace the existing `BillData` and `PersonTotal` interfaces:

```typescript
export interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  otherFees: number;
  total: number;
}

export interface PersonTotal {
  personId: string;
  name: string;
  itemsSubtotal: number;
  tax: number;
  tip: number;
  otherFees: number;
  total: number;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: Errors will appear at `calculatePersonTotals` call sites and in `calculations.ts` — this is correct, they are addressed in subsequent tasks. Zero errors in `shared/types.ts` itself.

---

## Task 2: Update Client-Side BillData Type

**Files:**
- Modify: `src/types/bill.types.ts`

- [ ] **Step 1: Add `otherFees` to `BillData` in `src/types/bill.types.ts`**

Find the `BillData` interface (around line 13) and add `otherFees`:

```typescript
export interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  otherFees: number;
  total: number;
  restaurantName?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: Same call-site errors as before — no new errors introduced by this file.

---

## Task 3: Update `calculatePersonTotals`

**Files:**
- Modify: `shared/calculations.ts`

- [ ] **Step 1: Add `effectiveOtherFees` parameter and distribute it proportionally**

Replace the full function in `shared/calculations.ts` (lines 9–55):

```typescript
export function calculatePersonTotals(
  billData: BillData | null,
  people: Person[],
  itemAssignments: ItemAssignment,
  effectiveTip: number,
  effectiveTax: number,
  effectiveOtherFees: number = 0
): PersonTotal[] {
  if (!billData || people.length === 0) return [];

  const personSubtotals: Record<string, number> = {};
  people.forEach(person => {
    personSubtotals[person.id] = 0;
  });

  billData.items.forEach(item => {
    const assignedPeople = itemAssignments[item.id] || [];
    if (assignedPeople.length > 0) {
      const splitPrice = item.price / assignedPeople.length;
      assignedPeople.forEach(personId => {
        if (personSubtotals[personId] !== undefined) {
          personSubtotals[personId] += splitPrice;
        }
      });
    }
  });

  const totalAssignedSubtotal = Object.values(personSubtotals).reduce((sum, val) => sum + val, 0);

  const results: PersonTotal[] = people.map(person => {
    const personSubtotal = personSubtotals[person.id];
    const proportion = totalAssignedSubtotal > 0 ? personSubtotal / totalAssignedSubtotal : 0;
    const personTax = effectiveTax * proportion;
    const personTip = effectiveTip * proportion;
    const personOtherFees = effectiveOtherFees * proportion;
    const personTotal = personSubtotal + personTax + personTip + personOtherFees;

    return {
      personId: person.id,
      name: person.name,
      itemsSubtotal: personSubtotal,
      tax: personTax,
      tip: personTip,
      otherFees: personOtherFees,
      total: personTotal,
    };
  });

  return results;
}
```

Note: `effectiveOtherFees` has a default of `0` so existing call sites that haven't been updated yet still compile.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`

Expected: Zero errors (the default parameter covers all existing call sites).

---

## Task 4: Update All `calculatePersonTotals` Call Sites

**Files:**
- Modify: `src/hooks/useBillSplitter.ts` (line 36)
- Modify: `src/utils/eventBalanceCalculator.ts` (line 51)
- Modify: `functions/src/ledgerProcessor.ts` (lines 137–142)
- Modify: `functions/src/billFunctions.ts` (lines 59–65)

- [ ] **Step 1: Update `src/hooks/useBillSplitter.ts`**

Find the call at line 36 and add `otherFees`:

```typescript
const personTotals = useMemo((): PersonTotal[] => {
  if (!allItemsAssigned) return [];
  return calculatePersonTotals(
    billData,
    people,
    itemAssignments,
    billData?.tip ?? 0,
    billData?.tax ?? 0,
    billData?.otherFees ?? 0
  );
}, [billData, people, itemAssignments, allItemsAssigned]);
```

- [ ] **Step 2: Update `src/utils/eventBalanceCalculator.ts`**

Find the call at line 51 and add `otherFees`:

```typescript
calculatePersonTotals(
  bill.billData,
  people,
  bill.itemAssignments || {},
  bill.billData.tip,
  bill.billData.tax,
  bill.billData.otherFees ?? 0
)
```

- [ ] **Step 3: Update `functions/src/ledgerProcessor.ts`**

Find the call at lines 137–142 and add `otherFees`:

```typescript
calculatePersonTotals(
  billData,
  people,
  (bill.itemAssignments as Record<string, string[]>) || {},
  billData.tip,
  billData.tax,
  billData.otherFees ?? 0
)
```

- [ ] **Step 4: Update `functions/src/billFunctions.ts`**

Find the call at lines 59–65 and add `otherFees`:

```typescript
calculatePersonTotals(
  billData,
  people,
  {},
  billData.tip,
  billData.tax,
  billData.otherFees ?? 0
)
```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`

Expected: Zero errors.

---

## Task 5: Update `billService.ts` Defaults

**Files:**
- Modify: `src/services/billService.ts`

- [ ] **Step 1: Add `otherFees: 0` to all `BillData` literals**

There are two places in `billService.ts` where `BillData` objects are constructed. Find every object literal that has `tax: 0, tip: 0` and add `otherFees: 0` after `tip`:

**`createSimpleTransaction` (~line 88):**
```typescript
const billData: BillData = {
  items: [
    {
      id: dummyItemId,
      name: title,
      price: amount
    }
  ],
  subtotal: amount,
  tax: 0,
  tip: 0,
  otherFees: 0,
  total: amount,
  restaurantName: title
};
```

**Default/fallback object (~line 84, if it exists as a separate literal):**
```typescript
{ items: [], subtotal: 0, tax: 0, tip: 0, otherFees: 0, total: 0 }
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`

Expected: Zero errors.

---

## Task 6: Update `BillSummary` UI

**Files:**
- Modify: `src/components/bill/BillSummary.tsx`

- [ ] **Step 1: Replace full `BillSummary.tsx` content**

```typescript
import { BillData } from '@/types';
import { Input } from '@/components/ui/input';

interface Props {
  billData: BillData;
  onUpdate: (updates: Partial<BillData>) => void;
}

export function BillSummary({ billData, onUpdate }: Props) {
  const handleTaxChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      const total = parseFloat(
        ((billData.subtotal || 0) + numValue + (billData.tip || 0) + (billData.otherFees || 0)).toFixed(2)
      );
      onUpdate({ tax: numValue, total });
    }
  };

  const handleTipChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      const total = parseFloat(
        ((billData.subtotal || 0) + (billData.tax || 0) + numValue + (billData.otherFees || 0)).toFixed(2)
      );
      onUpdate({ tip: numValue, total });
    }
  };

  const handleOtherFeesChange = (value: string) => {
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      const total = parseFloat(
        ((billData.subtotal || 0) + (billData.tax || 0) + (billData.tip || 0) + numValue).toFixed(2)
      );
      onUpdate({ otherFees: numValue, total });
    }
  };

  return (
    <div className="mt-4 md:mt-6 space-y-2 border-t pt-3 md:pt-4">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Subtotal:</span>
        <span className="font-medium">${(billData.subtotal || 0).toFixed(2)}</span>
      </div>
      <div className="flex justify-between items-center text-sm md:text-base">
        <span className="text-muted-foreground font-semibold">Tax:</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              inputMode="decimal"
              value={billData.tax || ''}
              onChange={(e) => handleTaxChange(e.target.value)}
              className="w-28 md:w-32 h-9 md:h-10 text-right text-base md:text-sm pl-6"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center text-sm md:text-base">
        <span className="text-muted-foreground font-semibold">Tip:</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              inputMode="decimal"
              value={billData.tip || ''}
              onChange={(e) => handleTipChange(e.target.value)}
              className="w-28 md:w-32 h-9 md:h-10 text-right text-base md:text-sm pl-6"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between items-center text-sm md:text-base">
        <span className="text-muted-foreground font-semibold">Other Fees:</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
            <Input
              type="number"
              inputMode="decimal"
              value={billData.otherFees || ''}
              onChange={(e) => handleOtherFeesChange(e.target.value)}
              className="w-28 md:w-32 h-9 md:h-10 text-right text-base md:text-sm pl-6"
              step="0.01"
              min="0"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>
      <div className="flex justify-between text-base md:text-lg font-bold border-t pt-2">
        <span>Total:</span>
        <span>${((billData.subtotal || 0) + (billData.tax || 0) + (billData.tip || 0) + (billData.otherFees || 0)).toFixed(2)}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`

Expected: Zero errors.

---

## Task 7: Update Per-Person Breakdown in `SplitSummary`

**Files:**
- Modify: `src/components/people/SplitSummary.tsx`

- [ ] **Step 1: Add "Other Fees" line in the per-person detail breakdown**

In `SplitSummary.tsx`, find the expanded detail section that shows `pt.tax` and `pt.tip` (around lines 344–361). Add an `otherFees` row after the `tip` row:

```tsx
{pt.tax > 0 && (
  <p className="flex justify-between pr-1">
    <span>Tax</span>
    <span className="tabular-nums ml-2 shrink-0">${pt.tax.toFixed(2)}</span>
  </p>
)}
{pt.tip > 0 && (
  <p className="flex justify-between pr-1">
    <span>Tip</span>
    <span className="tabular-nums ml-2 shrink-0">${pt.tip.toFixed(2)}</span>
  </p>
)}
{pt.otherFees > 0 && (
  <p className="flex justify-between pr-1">
    <span>Other Fees</span>
    <span className="tabular-nums ml-2 shrink-0">${pt.otherFees.toFixed(2)}</span>
  </p>
)}
```

- [ ] **Step 2: Update `generateItemDescription` to include other fees in Venmo note**

In `SplitSummary.tsx`, find the `generateItemDescription` function (around line 40). Replace it so it appends the person's other fees share to the note when non-zero. `personTotals` is already in scope as a prop:

```typescript
const generateItemDescription = (personId: string): string => {
  const assignedItems: string[] = [];

  billData.items.forEach(item => {
    const assignedPeople = itemAssignments[item.id] || [];
    if (assignedPeople.includes(personId)) {
      const shareCount = assignedPeople.length;
      if (shareCount > 1) {
        assignedItems.push(`${item.name} (split ${shareCount} ways)`);
      } else {
        assignedItems.push(item.name);
      }
    }
  });

  const pt = personTotals.find(p => p.personId === personId);
  const suffix = pt && pt.otherFees > 0 ? ` + Other Fees ($${pt.otherFees.toFixed(2)})` : '';

  if (assignedItems.length === 0) {
    return `${billName} - Your share${suffix}`;
  }

  return `${billName}: ${assignedItems.join(', ')}${suffix}`;
};
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`

Expected: Zero errors.

---

## Task 8: Update Gemini AI Prompt and Response Parser

**Files:**
- Modify: `functions/src/index.ts`

- [ ] **Step 1: Update the Gemini prompt**

Find the `prompt` constant (around line 84) and replace it:

```typescript
const prompt = `Extract restaurant bill data from this image. Return ONLY valid JSON (no markdown):

{
  "restaurantName": "Restaurant Name",
  "items": [{"name": "Item", "price": 10.99}],
  "subtotal": 50.00,
  "tax": 4.50,
  "tip": 10.00,
  "otherFees": 3.99,
  "total": 68.99
}

Rules:
- Extract the restaurant name if visible on the receipt
- If restaurant name is not found, omit the field or set to null
- Split quantities into separate items (e.g., "2x Burger" = two entries)
- Use individual item prices, not totals
- All values must be numbers
- "otherFees" is the combined total of any delivery fees, service fees, long distance fees, platform fees, or any other charges that are not tax or tip — set to 0 if none`;
```

- [ ] **Step 2: Add `otherFees` normalization in the response parser**

Find the block that normalizes `billData.tip` (around line 155) and add `otherFees` normalization immediately after it:

```typescript
// Normalize tip field - handle null, undefined, or non-numeric values
if (billData.tip === null || billData.tip === undefined || typeof billData.tip !== 'number') {
  billData.tip = 0;
}

// Normalize otherFees field
if (billData.otherFees === null || billData.otherFees === undefined || typeof billData.otherFees !== 'number') {
  billData.otherFees = 0;
}
```

- [ ] **Step 3: Verify TypeScript compiles cleanly**

Run: `npx tsc --noEmit`

Expected: Zero errors.

---

## Task 9: Final Build Verification and Commit

- [ ] **Step 1: Full production build**

Run: `npm run build`

Expected: Build completes with zero errors and zero TypeScript errors. Warnings are acceptable.

- [ ] **Step 2: Start dev server and manually verify**

Run: `npm run dev`

Open http://localhost:8080. Verify:
1. Create a new bill manually — confirm "Other Fees" input appears between Tip and Total in `BillSummary`
2. Enter a value in Other Fees — confirm Total updates correctly (`subtotal + tax + tip + otherFees`)
3. Add people and assign items — confirm per-person breakdown in Review step shows "Other Fees" line when non-zero
4. Upload a receipt image with a delivery fee — confirm Gemini extracts it into the Other Fees field

- [ ] **Step 3: Commit everything including the spec**

```bash
git add \
  shared/types.ts \
  src/types/bill.types.ts \
  shared/calculations.ts \
  src/hooks/useBillSplitter.ts \
  src/utils/eventBalanceCalculator.ts \
  functions/src/ledgerProcessor.ts \
  functions/src/billFunctions.ts \
  src/services/billService.ts \
  src/components/bill/BillSummary.tsx \
  src/components/people/SplitSummary.tsx \
  functions/src/index.ts \
  docs/superpowers/specs/2026-05-01-other-fees-design.md \
  docs/superpowers/plans/2026-05-01-other-fees.md
git commit -m "feat: add Other Fees field to bills for delivery, service, and platform fees"
```
