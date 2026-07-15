# Ledger Pipeline Integration Tests — Design

**Date:** 2026-07-14
**Status:** Approved pending user review

## Goal

Add integration tests that exercise full backend flows — bill create/edit/delete →
ledger pipeline → `balances` / `event_balances` → settlements → reversals — without
any browser. Today only pure functions in `shared/` are unit-tested; the transactional
Firestore code in `functions/src/` (the code most likely to hide double-count,
reversal, and flow-through bugs) has zero automated coverage.

## Non-goals

- No UI / Playwright / browser coverage (existing `e2e/` handles that).
- No CI job yet — local-only (`npm run test:integration`). CI gating can be added later.
- No behavior changes to Cloud Functions beyond a thin-wrapper refactor (below).

## Approach

**Firestore emulator + in-process function invocation** (Approach 1 from brainstorm):

- Tests run under Vitest at the repo root, with `firebase-admin` connected to the
  **Firestore emulator**.
- Trigger/callable *logic* is invoked directly in-process. The settlement functions
  already export testable cores (`processSettlementCore`, `processEventSettlementCore`,
  `processSettlementReversalCore`, `generateDueRecurringBills`). The three inline
  triggers get the same treatment (refactor below).
- A small **trigger-loop harness** simulates Firestore's trigger behavior: after every
  bill write it re-invokes the pipeline with (before, after) snapshots, and re-fires on
  the pipeline's own follow-up writes until quiescent — proving the
  `hasRelevantChange` loop guard terminates.

## Environment safety (MUST-hold invariants)

Integration tests must be physically unable to touch prod (`divit-6d217`) or beta
(`divit-beta`):

1. **`demo-` project ID.** Emulator runs as `--project demo-bill-split-test`. The
   Firebase CLI treats `demo-*` projects as offline-only; no cloud project exists.
2. **Hard guard.** The test setup throws before initializing `firebase-admin` unless
   `FIRESTORE_EMULATOR_HOST` is set. No silent fallback to ADC/service accounts.
3. **Single entry point.** `npm run test:integration` =
   `firebase emulators:exec --only firestore --project demo-bill-split-test "vitest run --config vitest.integration.config.ts"`.
   `emulators:exec` injects `FIRESTORE_EMULATOR_HOST` into the child and tears the
   emulator down afterward. No `.env` / `.env.beta` is read; no credentials loaded.
4. **Data isolation.** Each test suite clears the emulator between tests via the
   emulator REST endpoint
   (`DELETE /emulator/v1/projects/demo-bill-split-test/databases/(default)/documents`).

## Refactor: extract trigger cores (thin wrappers only)

Follow the existing `*Core` convention. No logic changes; `functions` `tsc` build must
still pass; trigger wrappers become one-liners delegating to the core.

| File | Extracted core | Signature |
|---|---|---|
| `functions/src/ledgerProcessor.ts` | `processLedgerWrite` | `(billId: string, before: DocumentData \| undefined, after: DocumentData \| undefined) => Promise<void>` |
| `functions/src/friendAddProcessor.ts` | `processFriendAdd` | `(userId: string, before: DocumentData \| undefined, after: DocumentData \| undefined) => Promise<void>` |
| `functions/src/eventDeleteProcessor.ts` | `processEventDelete` | `(eventId: string) => Promise<void>` |

## Test infrastructure

```
tests/integration/
├── helpers/
│   ├── env.ts          # emulator guard + firebase-admin init (demo project) + clearFirestore()
│   ├── triggerLoop.ts  # simulated trigger runtime (below)
│   └── builders.ts     # makeBill(), makeUser(), makeEvent() minimal-valid doc builders
├── ledgerPipeline.int.test.ts
├── eventLedger.int.test.ts
├── settlement.int.test.ts
└── recurringAndFriends.int.test.ts
```

### `triggerLoop.ts` — simulated trigger runtime

Mimics prod trigger semantics deterministically (no polling):

- `writeBill(billId, data)` / `updateBill(billId, updates)` / `deleteBill(billId)`:
  read current doc (before) → apply the write → read doc (after) → call
  `processLedgerWrite(billId, before, after)` → if the pipeline itself wrote to the
  bill (e.g. `processedBalances`, `_ledgerVersion`), re-fire with the new before/after
  — loop until a pass makes no bill writes. **Max 10 iterations**; exceeding it fails
  the test (infinite-loop detector).
- `updateUser(userId, updates)`: apply write → call `processFriendAdd` → any bills it
  touched (`_friendScanTrigger`) get their own `processLedgerWrite` re-fires via the
  same loop.
- `deleteEvent(eventId)`: snapshot the event's bills → delete event doc → call
  `processEventDelete(eventId)` → for each bill it deleted, fire
  `processLedgerWrite(billId, before, undefined)` (mirrors prod cascade; verifies the
  documented double-reversal idempotency).
- Settlement callables are invoked directly (`processSettlementCore` etc.), then any
  bills they modified are run through the bill trigger loop — this is the
  **flow-through** path under test.

### `builders.ts`

`makeBill({ ownerId, people, items, eventId?, paidById?, ... })` returns a
minimal valid bill doc: `people` with `user-<uid>` ids, `billData` (items/subtotal/
tax/tip/total), `itemAssignments`, `participantIds`, `billType`. Linked-friend user
docs created via `makeUser(uid, { friends })`.

### Vitest config & scripts

- New `vitest.integration.config.ts`: same aliases as `vitest.config.ts`; `include:
  ['tests/integration/**/*.int.test.ts']`; `setupFiles: tests/integration/helpers/env.ts`;
  generous per-test timeout (15s); `fileParallelism: false` (suites share one emulator).
- `vitest.config.ts`: add `exclude: ['tests/integration/**']` so `npm test` stays
  emulator/Java-free and CI is unaffected.
- `package.json`:
  `"test:integration": "firebase emulators:exec --only firestore --project demo-bill-split-test \"vitest run --config vitest.integration.config.ts\""`.
- Vitest resolves `functions/src/*.ts` imports directly (Vite maps the `.js` specifiers
  to `.ts`); `firebase-admin`/`firebase-functions` resolve from `functions/node_modules`
  by normal Node walk-up resolution. If root-level resolution fights this, fallback is
  aliases in the integration config — an implementation detail, not a design change.

## Test scenarios

### `ledgerPipeline.int.test.ts` — core ledger flows
1. **Create:** bill (owner A paid, friend B owes) → `balances/{A_B}` has correct
   signed amount, `unsettledBillIds` contains bill, bill `processedBalances` footprint
   matches.
2. **Idempotent delta:** re-fire pipeline with identical data → no double-count.
   Edit item price → balance reflects delta exactly once.
3. **Anchor change:** flip `paidById` A→B → old footprint reversed and new one applied
   atomically; net balance flips sign.
4. **Delete:** bill delete → balance returns to 0, bill removed from `unsettledBillIds`.
5. **Settled flow-through:** add B to `settledPersonIds` → B's share removed from
   balance.
6. **Loop guard:** trigger loop reaches quiescence ≤ 10 iterations in all of the above.

### `eventLedger.int.test.ts` — event pair ledger
1. Event bill → `event_balances/{eventId_A_B}` pair doc created alongside `balances`,
   same sign convention, `processedEventBalances` footprint matches.
2. Two bills in one event (different payers) → pair doc aggregates both.
3. `deleteEvent` cascade → bills, `event_balances`, invitations deleted; `balances`
   reversed to 0; double-reversal (cascade + bill-delete trigger) does not overshoot.

### `settlement.int.test.ts` — settlement flows
1. **Global settle:** `processSettlementCore(A, B)` → `balances/{A_B}` zeroed,
   `settlements` record written, debtor in each bill's `settledPersonIds`,
   `processedBalances[debtor]` zeroed; pipeline flow-through zeroes
   `event_balances` for event bills.
2. **Event settle:** `processEventSettlementCore(eventId, A, B)` → event pair doc
   zeroed; flow-through reduces the **global** `balances` by the same amount; bills
   outside the event untouched.
3. **Reversal:** `processSettlementReversalCore(settlementId)` → debtor removed from
   `settledPersonIds`, pipeline re-fires, balances restored to pre-settlement values.

### `recurringAndFriends.int.test.ts`
1. `generateDueRecurringBills(now)` with a due schedule → bill created; run it through
   the trigger loop → balances update; run again with same `now` → no duplicate bill.
2. **Friend add retro-scan:** bill exists between A and unlinked B (no balance yet
   because B is not A's friend) → `updateUser(A, friends+=B)` → `processFriendAdd`
   touches `_friendScanTrigger` → pipeline re-fires → `balances/{A_B}` now exists.

## Assertion contract

Every scenario asserts **both** sides of the idempotency pair: the balance doc(s)
(`balance`, `unsettledBillIds`, `participants`) **and** the bill footprints
(`processedBalances` / `processedEventBalances`). Amounts asserted to the cent
(`toBeCloseTo(x, 2)`).

## Risks / open points

- `resolveEligibleFriends` runs a `users` query with `isShadow`/`createdById` filters —
  emulator auto-creates single-field indexes, so no `firestore.indexes.json` change
  expected; if a composite index error surfaces in the emulator it will name the fix.
- `firebase-functions` `logger` works outside a functions runtime (falls back to
  console) — no mocking needed.
- Windows/Git Bash: `emulators:exec` requires Java (already required for e2e).

## Definition of done

- `npm test` (unit) unchanged and green without Java/emulator.
- `npm run test:integration` green locally, covering all scenarios above.
- `cd functions && npm run build` (tsc) green after the trigger refactor.
- No test ever runs without `FIRESTORE_EMULATOR_HOST` (guard verified by a test that
  asserts the guard throws when env is missing — or by code review of `env.ts`).
