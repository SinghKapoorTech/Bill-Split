# Recurring bills: generate first occurrence immediately on create/edit

## Problem (root cause, evidence-backed)

Recurring bills **do** impact the balances ledger — verified on beta by force-running
the scheduler: it generated 5 backfilled bills for an overdue template and the
owner↔friend `balances` doc updated to `-65.5` (owner owed), each generated bill
carrying `processedBalances: { friend: 11 }`.

The reason it *looked* broken: generation only runs on the **hourly**
`processRecurringBills` schedule. A template the user just created (even one already
due) produces no bill — and therefore no balance change — until the next hourly tick.
The `83bea29` "reads-before-writes" fix (already deployed) was the real code fix that
lets `createBillCore` run inside generation without throwing.

## Goal

When a recurring template is **created or edited**, immediately run a generation pass
**for that template** so any already-due / overdue cycles are created right away (with
balances updated via the existing pipeline). The hourly job remains the safety net for
future cycles. Idempotency (existing-cycle query) prevents duplicates if the hourly run
and the immediate run overlap.

## Approach

Reuse the proven generation logic. Extract the per-template body, expose an
ownership-checked core, wrap it in an auth'd callable, and have the client invoke it
after writing the template (best-effort; failure falls back to the hourly job).

## File-level steps

1. **`functions/src/recurringBillProcessor.ts`**
   - Extract the per-template loop body of `generateDueRecurringBills` into
     `generateForTemplate(db, docSnap, todayStr): Promise<number>` (returns # created).
     Refactor the loop to call it (behavior-preserving).
   - Add `generateRecurringBillNowCore(db, recurringBillId, ownerId, todayStr)`:
     - Load `recurring_bills/{id}`; throw `not-found` if missing.
     - Verify `data.ownerId === ownerId`; else `permission-denied`.
     - If `status !== 'active'` → return `{ created: 0 }`.
     - Else call `generateForTemplate` and return `{ created }`.

2. **`functions/src/index.ts`**
   - Export callable `generateRecurringBillNow` (auth required) →
     `generateRecurringBillNowCore(getFirestore(), data.recurringBillId, auth.uid, todayStr)`
     where `todayStr = new Date().toISOString().split('T')[0]`.

3. **`src/services/recurringBillService.ts`**
   - After `createRecurringBill` (post-`setDoc`) and after
     `updateRecurringBillFromInput`, call the `generateRecurringBillNow` callable with
     the template id. Wrap in try/catch and swallow errors (template is already saved;
     hourly job will catch up). `createRecurringBill` still returns the id.

## Out of scope

- Scheduler frequency (staying hourly).
- Any change to the ledger math or `createBillCore` (already correct).

## Verification

- `npm test` (Vitest) stays green — no `shared/` logic changed.
- `cd functions && npm run build` (tsc) passes — covers the refactor + new code.
- Emulator integration (live DB check, never prod):
  - Confirm the **refactor** is behavior-preserving by running a generation pass via
    the emulator-only `devTriggerRecurringBills` against a seeded due template →
    bills created + `balances` updated.
  - Confirm the **new immediate path** by calling `generateRecurringBillNowCore`
    directly against the emulator Firestore for a freshly-seeded due template →
    asserts bills created + `balances` doc reflects the footprint, and a second call
    is a no-op (idempotent).
- Fresh reviewer subagent audits the diff against this plan.

## Notes

- No new Firestore index required: the idempotency query
  (`recurringBillId` + `recurringCycleDate`) already runs in the deployed hourly
  processor (it created 5 bills on beta), so the composite index exists.
- Work directly on `develop` (project convention — no feature branches).
