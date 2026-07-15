# Pre-Push Checklist — Ledger Integration Tests + Pipeline Fixes

**Session date:** 2026-07-14 · **Branch:** `main` (⚠️ push = prod deploy)
**State:** all gates green — integration 20/20, units 76/76, functions `tsc` exit 0.

This CR contains: the integration test suite (`tests/integration/`), three trigger-core
extractions, and **two production bug fixes** in `functions/src/` (reads-after-writes
crash in `ledgerProcessor.ts`; broken global flow-through in `eventSettlementProcessor.ts`).

---

## 🔴 Resolve BEFORE pushing

### 1. ~~Review the unreviewed "rider" changes~~ ✅ DONE (2026-07-14)
Full review completed: **safe to ship as-is, zero fixes required.** The rider batch
(`shared/splitAmounts.ts`, `shared/calculations.ts`, wizards, GuestClaimView,
recurringBillProcessor, e2e spec updates) is a correctness improvement — it fixes
server-side penny-creation on splitEvenly bills and the guest Venmo amount excluding
tax/tip while the ledger included it. All gates re-verified green (tsc ×2, 76 units,
20 integration). Minor awareness items only (see 🟡 #4 for the splitEvenly
self-correction deltas on beta).

**Still true:** the session work is compile-coupled to the `shared/` riders — land
everything as ONE commit; a partial commit breaks the functions build.

### 2. ~~Repair script for legacy inflated balances~~ ✅ NOT NEEDED (verified 2026-07-14)
Read-only query against prod (`divit-6d217`) `settlements`: **8 documents total,
zero with `eventId`** — event-scoped settlement has never been used in prod, so the
flow-through bug never corrupted any real balances. No repair required. (If beta has
test data from event settlements, it's disposable.)

### 3. ~~Verify prod composite indexes~~ ✅ DONE (2026-07-14)
All three queries are covered by `firestore.indexes.json` (deployed via
`firebase deploy --only firestore` in the same pipeline):
- `bills`: `participantIds` array-contains + `ownerId ==` → explicit composite ✓
- `recurring_bills`: `status ==` + `nextRunDate` ASC → explicit composite ✓ (correct for the `<=` range)
- `users`: `isShadow ==` + `createdById in` → no composite required (equality-only;
  served by automatic single-field indexes via index merging; no fieldOverrides exempt them) ✓

**Residual (cheap):** after beta deploy, exercise add-friend + a recurring run once
and glance at function logs for `FAILED_PRECONDITION` — belt-and-suspenders only.

### 4. Push discipline
You are on `main`; per repo docs every push to `main` auto-deploys backend to
**prod with no gate**. Recommended: commit → push to `develop` first → verify on
beta (`npm run dev:beta`, run an event settlement + a paidById edit end-to-end) →
then promote `develop → main`.

---

## 🟡 Recommended follow-ups (soon after, not blocking)

1. **Test the two untested composed flows:** reversal of an *event-scoped*
   settlement, and a global settlement of the residual after an event settlement.
   (Both hand-traced as correct; cheap to add to `settlement.int.test.ts`.)
2. **Event delete with `paidById !== ownerId`** — likely real bug:
   `processEventDelete` reverses with `ownerId` as anchor while bill-delete uses
   `paidById || ownerId`, so cascade-deleting a payer≠owner event bill may reverse
   against the wrong balance doc. Needs a failing-test investigation + fix.
3. **Stage 3 error swallowing:** a Stage-3-only failure after Stage 2 commits
   leaves event pair docs stale with no retry until the next bill edit.
   Pre-existing design; consider at least alert-level logging/metrics.
4. **Penny-level corrective deltas on beta:** the `shared/` rider changes
   splitEvenly cent allocation, so existing splitEvenly bills will emit small
   self-correcting deltas on their next edit. Expected behavior — just don't
   mistake it for a regression while testing beta.

## 🔵 Backlog / polish (tracked, no action needed for this CR)

- Friend-add retro-scan cannot create balances for historical guest (`person-*`)
  bills — if the product expects that, it needs a linking mechanism (no code path today).
- Pre-existing edge: bill deleted mid-pipeline → `billRef.update({_ledgerVersion})`
  throws on missing doc (harmless retry noise).
- Pre-existing: double `_ledgerVersion` bump when a reversal fires with zero new
  deltas (harmless; not a relevant-change field).
- Concurrency/contention tests deliberately skipped (flaky-prone); revisit if prod
  shows transaction retries.
- Style: add the "MUST stay behavior-identical" note to `processFriendAdd` /
  `processEventDelete` doc comments (parity with `processLedgerWrite`); document the
  dual naming convention (`*Core` for callables vs bare verb for trigger cores);
  dedupe the `@shared`/`@` alias blocks across the two vitest configs.
- CI: integration tests are local-only by choice. When ready, add a CI job
  (needs Java + `firebase emulators:exec`) and make it a hard gate.

---

## Verification snapshot (evidence at time of writing)

| Gate | Result |
|---|---|
| `npm run test:integration` | 5 files / 20 tests passed (demo project, clean teardown) |
| `npm test` | 8 files / 76 tests passed (no integration files) |
| `cd functions && npm run build` | exit 0 |
| Guard (`vitest` without emulator) | refuses to run, 0 tests execute |
