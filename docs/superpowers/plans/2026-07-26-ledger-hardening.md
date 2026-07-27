# Ledger Hardening — Fix the balance-corruption bug class

## Background

A production investigation (Aakaash↔Aman + Anuja/Simran) found the ledger pipeline
corrupted balances via five compounding code defects. The DATA was already repaired
for those four users via `scripts/reconcile-balances.mjs`. This plan fixes the CODE
so it cannot recur, and adds a reconciliation safety net + global backfill.

Ledger model recap (see CLAUDE.md “Ledger Pipeline”):
- `bills/{id}.processedBalances` = footprint `{debtorUid: amountOwedToCreditor}`, creditor = `paidById || ownerId` (the "anchor"). Creditor is never in its own footprint.
- `balances/{sortedUidPair}` and `event_balances/{eventId_sortedUidPair}` are delta-accumulators: `balance += toSingleBalance(anchor, debtor, delta)`.
- Sign: `balance > 0` → `participants[0]` (alphabetically-smaller UID) is owed.
- `processedBalancesAnchorId` records which anchor a footprint was written under (added 2026-07-16). Legacy bills lack it.

## The five defects (root cause)

1. **No backfill on the payer-anchor migration + `hasRelevantChange` short-circuit** (`functions/src/ledgerProcessor.ts:42-45,784`): legacy owner-anchored footprints are never recomputed; wrong whenever `paidById != ownerId`.
2. **Unsound legacy-anchor fallback** (`ledgerProcessor.ts:255`, event twin `:505-508`): missing `processedBalancesAnchorId` falls back to `payloadPreviousAnchorId` (== current anchor when payer didn't change) instead of `ownerId` (the real old model) → reversal never fires → can't self-heal.
3. **No self-pair / anchor-in-footprint guard in delta application** (`ledgerProcessor.ts:287-295` friend, `:544-551` event): a stored footprint containing the current anchor yields `getFriendBalanceId(anchor, anchor)` → degenerate `X_X` self-doc. Also no rejection of malformed participant IDs (`user-…`).
4. **Delta-accumulator with no reconciliation or invariant check** (`balance = current + delta` throughout): drift accumulates permanently; the invariant `|balance| < THRESHOLD ⇔ unsettledBillIds empty` is never enforced.
5. **Settlement trusts the stored footprint + only acts on `unsettledBillIds`** (`functions/src/eventSettlementProcessor.ts:173-174,205`; mirror in `settlementProcessor.ts`): a stale footprint → wrong settled amount → residue; and a bill whose footprint was never applied (orphaned) is silently excluded.

## Constraints

- **Verification here = Vitest units (`npm test`) + functions `tsc` build + `npm run lint`.** Java is absent → the emulator integration tests (`tests/integration/*.int.test.ts`) CANNOT run locally and are not in CI. Still ADD integration tests (they run where Java exists), but do NOT claim they were executed.
- Pure logic goes in `shared/` and is unit-tested from `tests/` (NEVER put test files in `shared/` — breaks the functions build). Tests resolve `@shared`/`@` via `vitest.config.ts`.
- Keep `shared/` free of `firebase-admin`/browser APIs. Cloud-Function wiring lives in `functions/src/`.
- No new deps without justification.

## Tasks

### Task 1 — Pure ledger-hardening helpers in `shared/ledgerCalculations.ts` + unit tests
Add pure, exported functions (no Firestore):
- `resolveFootprintAnchor({ storedAnchorId, ownerId, currentAnchorId }): string` — returns `storedAnchorId` when present; otherwise `ownerId` (legacy footprints were owner-anchored). This replaces the unsound `?? payloadPreviousAnchorId ?? anchorId` fallback (Defect 2). Document why.
- `isWritableBalancePair(a: string, b: string): boolean` — true only when `a !== b` (no self-pair) AND both are plausible raw UIDs: non-empty, and NOT starting with `user-`/`guest-`/`person-` and not `anonymous` (Defect 3).
- `isBalanceSettledConsistent(balance: number, unsettledBillIds: string[]): boolean` — the invariant: `Math.abs(balance) < BALANCE_THRESHOLD` iff `unsettledBillIds.length === 0` (Defect 4).
- `sanitizeFootprint(footprint: Record<string,number>, anchorId: string): Record<string,number>` — drops entries whose key equals `anchorId` or fails `isWritableBalancePair(anchorId, key)`; used as a defensive filter before applying/persisting footprints (Defect 3).

Unit tests in `tests/ledgerHardening.test.ts` covering: explicit vs legacy anchor; self-pair rejection; `user-`/`guest-`/`person-`/`anonymous`/empty rejection; invariant true/false/threshold-edge cases; sanitize removes anchor + malformed keys, keeps valid ones. Do not modify existing behavior of other exports.

**Verify:** `npm test` green (incl. new tests); `cd functions && npx tsc` builds.

### Task 2 — Wire anti-corruption guards + observability into `functions/src/ledgerProcessor.ts` (Defects 3, 4)
Using Task 1 helpers. **Do NOT change the anchor/reversal fallback logic** (`:255`, `:505-508`): the current missing-anchor behavior (no reversal, diff against stored footprint) is the safe local optimum — changing it risks double-counting Mar–Jul payer-anchored legacy bills. Legacy mis-anchoring is corrected by the reconciler (Task 3), not here.
- In both delta-application loops (`applyFriendLedger` ~`:287-295`, `applyEventPairLedger` ~`:544-551`): skip any `friendId`/`participantId` where `!isWritableBalancePair(anchorId, id)` (guards self-pairs + malformed IDs), and `logger.warn` when skipping (include billId, anchorId, id).
- Before persisting footprints (`stripZeros(newFootprint)` at `:346` and `:601`), also run `sanitizeFootprint(..., anchorId)` so a corrupt footprint can't be re-persisted.
- After computing each doc's final `balance`+`unsettledBillIds` update (`tx.set` at `:334-341` and `:589-597`), check `isBalanceSettledConsistent(newBalance, resultingUnsettledBillIds)`; if violated, `logger.error` with billId/balanceId (do NOT throw — surface only, don't block writes). Note: `unsettledBillIds` is written via `FieldValue.arrayUnion/arrayRemove`, so compute the resulting membership for the check from the existing doc's array ± this billId.
- Add a `logger.warn` when processing a bill whose footprint field(s) exist but the `processed*AnchorId` field is missing (surfaces un-backfilled legacy bills).
- Preserve all existing idempotency/anchor-flip-reversal behavior otherwise.

Add integration coverage in `tests/integration/ledgerPipeline.int.test.ts` (runs under emulator when Java present): a legacy bill with `paidById != ownerId` and NO anchor field reconciles correctly (no self-pair doc; balance lands on the correct pair); reprocessing is idempotent.

**Verify:** `cd functions && npx tsc` builds; `npm test` green; `npm run lint` no NEW errors. State integration tests were written but NOT run (no Java).

### Task 3 — Reconciliation rebuild: pure core in `shared/` + Cloud Function wrappers (Defects 1 & 4; global backfill)
- Pure `shared/reconcileBalances.ts`: `rebuildLedgerFromBills({ bills, resolveFriendUids, resolveEventUids }): { friend: Map<id,{participants,balance,unsettledBillIds}>, event: Map<...> }` — sums correct footprints across bills using existing `computeBillPersonTotals` + `calculateFriendFootprint` + `getFriendBalanceId`/`getEventBalanceId` + `toSingleBalance`. Pure: takes uid-resolver callbacks so it has no Firestore dependency. Unit-test with in-memory fixtures in `tests/reconcileBalances.test.ts` (assert correct balances, unsettledBillIds membership, self-pair entries excluded).
- Wrapper in `functions/src/reconciliation/reconcileLedger.ts`: reads bills/users/events, builds admin-side resolvers mirroring `resolveEligibleFriends`/`resolveEventParticipants`, calls the pure core, then upserts changed docs / zeroes emptied real pairs / deletes junk (self-pair or malformed-participant) docs, and stamps `processedBalancesAnchorId` etc. on bills. Support `{ dryRun: boolean, uidFilter?: string[] }`. This is the durable drift-repair + the global backfill for Defect 1.
- Export `reconcileLedger` as an `onCall` (admin-guarded: caller must be an allow-listed uid) AND a daily `onSchedule` that runs in dryRun+report mode (logs drift; does not auto-write) — safe default. Mirror the existing `reconcileEventFootprints` onCall style in `functions/src/index.ts`.
- Add integration test `tests/integration/reconcileLedger.int.test.ts`.

**Verify:** `npm test` green; `cd functions && npx tsc` builds.

### Task 4 — Settlement residue observability (Defect 5)
REVISED (safe scope): the stored-footprint-based `settledDelta` is intentionally consistent with how the balance doc was built — do NOT change the settlement math (recomputing "fresh" would break consistency for a corrupt-but-internally-consistent pair). The orphan/drift correction is the reconciler's job (Task 3). Task 4 only adds real-time OBSERVABILITY so a residue like the historical $19.84 is surfaced the moment it happens.

In BOTH `functions/src/eventSettlementProcessor.ts` and `functions/src/settlementProcessor.ts`, right after the balance `tx.update(...)` that sets `balance: currentBalance - settledDelta` and `unsettledBillIds: skippedBillIds`:
- Compute the resulting balance (`currentBalance - settledDelta`) and resulting unsettled ids (`skippedBillIds`) and check `isBalanceSettledConsistent(resultingBalance, skippedBillIds)` (import from `../../shared/ledgerCalculations.js`). If violated, `logger.error('settlement: post-settlement balance/unsettled invariant violated (residue?)', { balanceId, resultingBalance, skippedCount })`. Do NOT throw — settlement still commits.
- This directly surfaces the "non-zero balance with no backing unsettled bills" residue state.
- Keep the retry-safe counter pattern and immutable settlement record exactly as-is.
- Add `tests/integration/settlement.int.test.ts` coverage asserting a normal full settlement leaves an invariant-consistent (zeroed) balance.

**Verify:** `cd functions && npx tsc` builds; `npm test` green; eslint no NEW errors.

## Out of scope (separate, confirm with human)
- RUNNING the global backfill (`reconcileLedger` with `dryRun:false`, no filter) against PROD data.
- Committing/pushing to `main` (deploys to prod). develop is currently 4 commits ahead of origin/main — resolve the git path with the human at commit time.

## Definition of done
- All four tasks pass their two-stage review.
- `npm test` green, `functions` `tsc` builds clean, `npm run lint` has no NEW errors.
- Final whole-implementation code review.
- Present to human; do NOT commit/push or run prod backfill without explicit approval.
