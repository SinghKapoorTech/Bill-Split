# Plan: Let recurring bills be any bill type (Quick / Detailed / Airbnb)

## Problem

Recurring bills are hardwired to the **quick (simple-transaction)** model: the wizard
reuses the simple-transaction `DetailsStep`/`PeopleStep` and stores a single `amount`,
and the Cloud Function generates each occurrence with `isSimpleTransaction: true`
(`functions/src/recurringBillProcessor.ts:175`). Users can't make a recurring **detailed
itemized** bill or a recurring **Airbnb/House** bill.

## Decisions (confirmed with user)

- Support **all three creatable types** as recurring: **Quick Expense**, **Detailed Bill**
  (fixed line items), **Airbnb/House**.
- The user picks the type via a **new first step** in the recurring wizard; later steps adapt.

## Design — "template = a saved bill snapshot + a schedule"

Rather than special-casing each type in the processor, generalize the recurring template to
store a **full bill snapshot**: `billData` + `itemAssignments` (+ `airbnbData` for Airbnb) +
type flags. The Cloud Function then just **copies that snapshot** into a new bill each cycle
and stamps the right flags. This keeps the processor near-trivial and makes "add a type"
mostly a wizard-composition problem. Feasible because `BillEntryStep` and `AirbnbEntryStep`
are **controlled components** (`billData`/`setBillData`, `airbnbData`/`setAirbnbData` props;
`onTriggerSave` optional) — so they compose into the recurring wizard with no draft auto-save.

### Assumptions (please confirm at approval)
1. **Detailed recurring = manual items only** — no AI receipt scanning in the recurring
   setup (items are fixed and regenerate each cycle). The receipt/AI tab is hidden in the
   recurring context.
2. **Airbnb recurring keeps fixed dates** — the stored stay dates/nights/fees regenerate
   as-is each cycle (dates do **not** auto-shift). Recurring Airbnb is unusual; flagging it.
3. **Back-compat** — existing templates have no `generatedType`/`billData`; they are treated
   as `quick` and the processor falls back to the current amount-based builder.

## Acceptance criteria

- The recurring wizard opens on a **Type** step offering Quick / Detailed / Airbnb.
- **Quick**: unchanged behavior (single amount, split).
- **Detailed**: user enters fixed items + tax/tip/fees, people, and per-item assignment;
  each generated bill is a normal itemized bill (`isSimpleTransaction` false, `isAirbnb` false).
- **Airbnb**: user enters stay dates/cost/fees, guests, split; each generated bill is an
  Airbnb bill (`isAirbnb: true`, `airbnbData` populated).
- Each generated occurrence carries the correct type/flags and shows the right
  icon/label on the Bills page and Settings list.
- Editing an existing recurring bill loads its type + data correctly.
- Existing (quick) recurring bills keep working with no migration.
- `npm run build`, `tsc --noEmit`, `npm run lint` pass; Playwright covers a detailed and an
  Airbnb recurring creation; processor verified against the emulator.

## Steps (file-level, dependency order)

### 1. Types — `src/types/recurring.types.ts`
- Add `export type RecurringGeneratedType = 'quick' | 'detailed' | 'airbnb';`
- Extend `RecurringBill`: `generatedType: RecurringGeneratedType`, optional
  `billData?: BillData`, `itemAssignments?: Record<string,string[]>`, `isAirbnb?: boolean`,
  `airbnbData?: Bill['airbnbData']`. Keep `amount` (quick + display/back-compat).
- Update `CreateRecurringBillInput`/`UpdateRecurringBillInput` to match.

### 2. Service — `src/services/recurringBillService.ts`
- Persist the new fields on create/update using conditional spreading (never write
  `undefined` to Firestore). `getRecurringBill` returns them; default `generatedType` to
  `'quick'` when absent (back-compat read).

### 3. New step — `src/components/recurring-wizard/steps/TypeStep.tsx`
- Three-option selector (Quick / Detailed / Airbnb) styled like `CreateOptionsDialog`
  (Zap / Receipt / Home icons). Calls `onSelect(type)` and advances.

### 4. Detailed entry reuse — small prop on `src/components/bill-wizard/steps/BillEntryStep.tsx`
- Add optional `hideReceiptScan?: boolean` to render manual-items-only (no AI/receipt tab)
  for the recurring context. Default false (no change to the normal bill wizard).

### 5. Wizard — `src/components/recurring-wizard/RecurringWizard.tsx`
- Add `generatedType` state; **Type** becomes step 0.
- Build `STEPS` dynamically per type:
  - quick: Type → Details → People → Schedule → Review (current steps shifted by 1).
  - detailed: Type → Items(`BillEntryStep` manual) → People(`bill-wizard/PeopleStep`) →
    Assign(`AssignmentStep`) → Schedule → Review.
  - airbnb: Type → Stay(`AirbnbEntryStep`) → Guests(`AirbnbGuestsStep`) →
    SplitMethod(`AirbnbSplitMethodStep`) → [Assign(`AirbnbAssignStep`) if not even] →
    Schedule → Review.
- Hold shared state: `billData`, `itemAssignments`, `airbnbData`, `splitEvenly`/method.
  Pass controlled props to reused steps; omit `onTriggerSave`.
- `handleComplete`: assemble the snapshot per type and call
  `createRecurringBill({ generatedType, billData, itemAssignments, isAirbnb, airbnbData,
  amount: billData.total, people, paidById, splitEvenly, schedule })`.
- Edit load: hydrate type + billData/itemAssignments/airbnbData.
- Keep the existing Schedule + Review steps; Review adapts its summary to the type
  (reuse each wizard's review summary where practical, else a generic summary).

### 6. Processor — `functions/src/recurringBillProcessor.ts`
- Extend `RecurringBillDoc` with `generatedType`, `billData`, `itemAssignments`, `isAirbnb`,
  `airbnbData`.
- `buildBillPayload`: if `template.billData` present → return it (and stored
  `itemAssignments`); else legacy amount-based builder (back-compat for old quick templates).
- In the `createBillCore` call: set `isSimpleTransaction: generatedType === 'quick'`; for
  airbnb pass `isAirbnb: true` and `airbnbData` via `extraFields` (which spreads into the
  bill doc).

### 7. Display — `MobileRecurringBillCard.tsx` + `RecurringBillList.tsx`
- Show the type via icon/label (Quick=Zap, Detailed=Receipt, Airbnb=Home) so the three are
  distinguishable in the Bills page and Settings.

### 8. Tests
- Extend `e2e/recurring-on-bills.spec.ts` (or a new spec): create a **detailed** recurring
  bill and an **Airbnb** recurring bill via the wizard; assert they appear and open.
- Verify generated-bill flags by exercising the processor logic against the emulator (or a
  focused unit test of `buildBillPayload`/flag selection).
- `tsc`, `lint`, `build`.

## Suggested build order (verify incrementally)
1. Types + service + processor + Type step + **Quick** path refactor (no behavior change) — verify quick still works.
2. **Detailed** path — verify end to end.
3. **Airbnb** path — verify end to end.
4. Display + tests + final review.

## Out of scope
- AI receipt scanning inside recurring setup.
- Auto-shifting Airbnb dates per cycle.
- Firestore rules/indexes (same `recurring_bills` collection, owner-only).
