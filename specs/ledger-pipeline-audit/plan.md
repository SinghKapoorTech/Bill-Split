# Ledger Pipeline Restructuring Plan

## Context

The Bill Split app's dual-ledger system needs restructuring. The current system has client-side security vulnerabilities, inconsistent write paths, and two competing sources of truth. This plan restructures into a **single-ledger + cache** model with a **server-side pipeline** where bill changes trigger predictable, flag-driven downstream effects — designed to scale to millions of users.

---

## Architecture: Single Ledger + Event Cache

### The Model

```
SOURCE OF TRUTH:
  friend_balances/{uid1_uid2}  — pairwise running balance between two users
                                  (covers ALL bills: standalone + event)

READ-ONLY CACHE (materialized view):
  event_balances/{eventId}     — pre-computed event summary for fast display
                                  Rebuilt by pipeline. Deletable. Not authoritative.

FOOTPRINT (on bills):
  bill.processedBalances       — what this bill contributed to friend_balances
  bill.eventBalancesApplied    — REMOVED (no longer needed as source of truth)
```

### Why Single Ledger + Cache

- **One place to debug** — friend_balances is the only truth. If balances look wrong, check one collection.
- **Settlement is simpler** — only updates friend_balances. Half the transaction size, half the contention.
- **Less concurrency contention** — event_balances was a hot document (every bill in an event writes to it). Now it's just a cache — if a write fails, no data loss.
- **Cache is rebuildable** — delete event_balances doc, next bill change rebuilds it. Or rebuild from bills on demand.
- **Event pages stay fast** — cache provides pre-computed `optimizedDebts` for display. Client falls back to computation from bills if cache is stale.

---

## Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (writes bill docs only — never touches ledgers)         │
│                                                                 │
│  Bill Create/Edit/Delete  ──→  Firestore bills/{billId}        │
│  Mark Person Settled      ──→  updates settledPersonIds         │
│  Add Friend               ──→  Firestore users/{userId}        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                    Firestore onWrite trigger
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  PIPELINE (Cloud Function — admin SDK)                          │
│                                                                 │
│  Stage 1: VALIDATE & CALCULATE                                  │
│    - Read bill data (trusted server-side source of truth)       │
│    - Calculate personTotals from billData + itemAssignments     │
│    - Determine creditor (paidById || ownerId)                   │
│    - FLAG: isDelete? → reversal path                            │
│                                                                 │
│  Stage 2: FRIEND LEDGER [AUTHORITATIVE] (single transaction)   │
│    - FLAG: has linked participants? (participantIds not empty)   │
│    - Compute idempotent delta: new footprint - old footprint    │
│    - Apply delta to friend_balances docs                        │
│    - Save processedBalances footprint on bill                   │
│    - Update unsettledParticipantIds if settledPersonIds changed │
│                                                                 │
│  Stage 3: EVENT CACHE [BEST-EFFORT] (outside transaction)      │
│    - FLAG: eventId != null?                                     │
│    - Query all bills in event                                   │
│    - Aggregate per-person totals across all bills               │
│    - Run optimizeDebts on aggregate                             │
│    - Write to event_balances/{eventId} (cache doc)              │
│    - If this fails, no data loss — cache rebuilt on next change │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Stage 2 is a Firestore transaction** — atomic, retries on contention, authoritative
2. **Stage 3 is outside the transaction** — it's just a cache rebuild. If it fails, the authoritative data (friend_balances) is still correct. Cache will be rebuilt on the next bill change.
3. **Settlement processor only updates friend_balances** — no event_balances writes during settlement. Cache is rebuilt by the pipeline when `settledPersonIds` changes on bills.
4. **Client can compute event summary as fallback** — if cache is missing/stale, compute from bills (already loaded for event page display).

---

## Commit-by-Commit Implementation Plan

Each commit is small and self-contained. System stays functional after every commit.

---

### PHASE 1: Shared Foundations (No behavior change)

#### ~~Commit 1: Extract `optimizeDebts` to shared module~~ DONE

- Created `shared/optimizeDebts.ts` with `OptimizedDebt` interface + `optimizeDebts()` function
- Updated `src/services/eventLedgerService.ts` — imports from `@shared/optimizeDebts`, re-exports type
- Updated `functions/src/settlementProcessor.ts` — imports from `../../shared/optimizeDebts.js`
- Both client and functions type-check clean. No behavior change.

#### ~~Commit 2: Extract ledger delta logic to shared module~~ DONE

- Created `shared/ledgerCalculations.ts` with pure functions:
  - `personIdToFirebaseUid(personId)` — normalizes `user-{uid}` → raw UID
  - `getFriendBalanceId(uid1, uid2)` — deterministic sorted doc ID
  - `calculateFriendFootprint(input)` — computes per-friend amounts from bill data
  - `computeFootprintDeltas(newFootprint, oldFootprint)` — diff engine
  - `toProcessedBalances(footprint)` — strips zero entries for storage
- Updated `src/services/friendBalanceService.ts` — imports shared functions, removed local logic
- Updated `src/services/eventLedgerService.ts` — imports shared `personIdToFirebaseUid`
- Both client and functions type-check clean. No behavior change.

#### ~~Commit 3: Add `settledBillIds` to settlement type and processor~~ DONE

- Updated `src/types/settlement.types.ts` — added `settledBillIds?: string[]`
- Updated `functions/src/settlementProcessor.ts` — added `settledBillIds: toSettle.map(p => p.bill.id)` to settlement record write
- Both client and functions type-check clean. Additive change, no behavior change for existing settlements.

---

### PHASE 2: Server-Side Pipeline (Core migration)

#### Commit 4: Create `ledgerProcessor` Cloud Function

The heart of the pipeline. Firestore `onWrite` trigger on bills collection.

- Create `functions/src/ledgerProcessor.ts`:
  - Trigger: `onDocumentWritten('bills/{billId}')`
  - On create/update:
    - Stage 1: Validate bill, calculate personTotals from trusted data
    - Stage 2: Apply friend_balances delta (idempotent, using shared calculations) — in `runTransaction`
    - Stage 3: Rebuild event cache if `eventId` set — query event bills, aggregate, write cache (outside tx)
  - On delete:
    - Read footprint from `before` snapshot
    - Reverse friend_balances delta in transaction
    - Rebuild event cache (without deleted bill)
  - Log stage decisions for observability
- Register in `functions/src/index.ts`
- **DO NOT remove client-side ledger service yet** — both run in parallel (idempotent, safe)
- Deploy Cloud Functions
- Verify: Create bill → check Cloud Function logs → check friend_balances updated.

#### Commit 5: Add pipeline guard flag

During transition, prevent double processing.

- Add `_ledgerVersion?: number` field to bill type
- Pipeline increments `_ledgerVersion` after processing
- Pipeline checks: if `before._ledgerVersion === after._ledgerVersion` and the trigger is from its own write → skip
- Verify: Create bill → pipeline processes once, not infinite loop.

#### Commit 6: Remove client-side ledger writes

Pipeline is proven. Remove client-side writes.

- Modify `src/services/ledgerService.ts`:
  - `applyBillToLedgers()` → becomes no-op (log "handled by pipeline")
  - `reverseBillFromLedgers()` → becomes no-op (pipeline handles delete)
- Delete `src/services/friendBalanceService.ts`
- Modify `src/services/eventLedgerService.ts` — remove write functions, keep only `optimizeDebts` export
- Simplify `src/hooks/useBills.ts` `deleteSession()` — just `deleteDoc()`, pipeline handles reversal
- Simplify `src/hooks/useEventBills.ts` `deleteTransaction()` — same
- Remove `useEffect` in `BillWizard.tsx` that calls `ledgerService.applyBillToLedgers()` on review step
- Verify: Full flow works — create, edit, settle, delete. All via pipeline.

#### Commit 7: Lock down security rules

Client no longer needs write access to ledger collections.

- Update `firestore.rules`:
  ```
  // friend_balances (lines 197-205)
  allow create: if false;
  allow update: if false;

  // event_balances (lines 216-220)
  allow write: if false;
  ```
- Tighten `isSettlementUpdate()` (line 119-121):
  ```
  function isSettlementUpdate() {
    return onlyUpdating(['settledPersonIds']);
  }
  ```
- Deploy: `firebase deploy --only firestore:rules`
- Verify: Client-side write to friend_balances → rejected. App still works via pipeline.

---

### PHASE 3: Simplify Settlement Processor

#### Commit 8: Remove event_balances writes from settlement processor

Settlement should only update friend_balances (the authority). Pipeline rebuilds the event cache.

- Update `functions/src/settlementProcessor.ts`:
  - Remove lines 373-436 (event ledger footprint computation)
  - Remove lines 462-477 (remaining amount applied to event ledger)
  - Remove `eventBalancesApplied` writes on bills
  - Keep: friend_balances updates, settledPersonIds marking, unsettledParticipantIds removal
  - The pipeline `onWrite` trigger will auto-fire for each modified bill → rebuilds event cache
- Remove `eventBalancesApplied` field from bill writes in the processor
- Verify: Settle in event → friend_balances updated → pipeline rebuilds event cache.

#### Commit 9: Create `reverseSettlement` Cloud Function

`deleteSettlement()` currently deletes the record without reversing financial effect.

- Create `functions/src/settlementReversal.ts`:
  - Read settlement → get `settledBillIds`
  - For each bill: `arrayRemove` person from `settledPersonIds`, `arrayUnion` back to `unsettledParticipantIds`
  - Pipeline auto-fires for each modified bill → recalculates friend_balances + rebuilds event cache
  - Delete settlement record
- Update `src/services/settlementService.ts` — `deleteSettlement()` calls `httpsCallable('processSettlementReversal')`
- Register and deploy
- Verify: Create settlement → reverse it → balances restored.

#### Commit 10: Add batch limit + idempotency to settlement processor

Prevent transaction overflow and duplicate settlements.

- Update `functions/src/settlementProcessor.ts`:
  - `MAX_BILLS_PER_TX = 50` guard
  - Return `{ hasMore: true }` if bills remain
  - Add `idempotencyKey` field — check for existing settlement before processing
- Update `src/services/settlementService.ts` — send idempotency key
- Verify: Test with many bills. Test retry behavior.

---

### PHASE 4: Retroactive Friend Scan

#### Commit 11: Create `friendAddProcessor` Cloud Function

When a user adds a friend, scan historical shared bills and apply to friend ledger.

- Create `functions/src/friendAddProcessor.ts`:
  - Trigger: `onDocumentUpdated('users/{userId}')`
  - Detect newly added friend UIDs (diff `before.friends` vs `after.friends`)
  - For each new friend, query (using existing composite indexes):
    - `bills WHERE unsettledParticipantIds ARRAY-CONTAINS newFriendUid AND ownerId == userId`
    - `bills WHERE unsettledParticipantIds ARRAY-CONTAINS userId AND ownerId == newFriendUid`
  - For each found bill: touch the doc (e.g., update a `_ledgerVersion` field) to trigger pipeline re-processing
  - Batch: max 50 bills per invocation
- Register in `functions/src/index.ts`
- Deploy
- Verify: Add friend who was guest in old bills → friend_balances shows retroactive balance.

---

### PHASE 5: Client-Side Event Cache Fallback

#### Commit 12: Add client-side event summary computation as fallback

If the event cache is missing or stale, compute from bills.

- Create `src/utils/eventBalanceCalculator.ts`:
  - `computeEventBalances(bills: Bill[])` → `{ netBalances, optimizedDebts }`
  - Uses `calculatePersonTotals` from shared + `optimizeDebts` from shared
  - Pure function, no Firestore
- Update `src/hooks/useEventLedger.ts`:
  - Primary: read `event_balances/{eventId}` via `onSnapshot` (cache)
  - Fallback: if doc doesn't exist or is stale, compute from bills
  - `useMemo` to avoid recomputation on every render
- Verify: Delete event_balances doc manually → event page still shows correct balances (computed from bills).

---

### PHASE 6: Performance

#### Commit 13: Batch friend profile hydration

50 friends = 50 reads → batch to ~2 reads.

- Update `src/services/userService.ts` `getHydratedFriends()`:
  - Replace per-friend loop with batched `documentId() in` queries (max 30 per batch)
- Verify: Dashboard with many friends loads faster, fewer network calls.

#### Commit 14: Batch squad member hydration

Same N+1 problem.

- Update `src/services/squadService.ts` `hydrateSquad()`:
  - Same batched pattern
- Verify: Squads page loads faster.

#### Commit 15: Add missing composite index

- Add to `firestore.indexes.json`:
  ```json
  { "collectionGroup": "eventInvitations", "queryScope": "COLLECTION",
    "fields": [{ "fieldPath": "email", "order": "ASCENDING" },
               { "fieldPath": "status", "order": "ASCENDING" }] }
  ```
- Deploy: `firebase deploy --only firestore:indexes`

---

### PHASE 7: Reliability

#### Commit 16: Transaction for `updatePersonDetails`

- Update `src/services/billService.ts` — wrap read-modify-write in `runTransaction()`
- Verify: Concurrent edits don't overwrite each other.

#### Commit 17: Atomic squad member sync

- Update `src/services/squadService.ts` — use `writeBatch()` for squad + member doc updates
- Verify: Squad create/update/delete is atomic.

---

### PHASE 8: Operational (Optional)

#### Commit 18: Pipeline stage logging

- Structured JSON logging in `ledgerProcessor.ts`

#### Commit 19: Cascade delete for events

- `onDocumentDeleted('events/{eventId}')` trigger — cleans up bills, cache, invitations

#### Commit 20: Ledger reconciliation (scheduled function)

- Validates friend_balances against bill footprints periodically

#### Commit 21: Clean up `eventBalancesApplied` field from existing bills

- Migration script: remove `eventBalancesApplied` from all bill documents (no longer used)

---

## Commit Summary

| # | Commit | Change Type | Deploy |
|---|--------|------------|--------|
| 1 | Extract `optimizeDebts` to shared | Refactor | No |
| 2 | Extract ledger delta logic to shared | Refactor | No |
| 3 | Add `settledBillIds` to settlements | Additive | Functions |
| 4 | Create `ledgerProcessor` pipeline | Additive (parallel) | Functions |
| 5 | Add pipeline guard flag | Coordination | Functions |
| 6 | Remove client-side ledger writes | **Breaking** | Client |
| 7 | Lock down security rules | **Breaking** | Rules |
| 8 | Remove event_balances from settlement | Simplification | Functions |
| 9 | Create `reverseSettlement` | Additive | Functions + Client |
| 10 | Batch limit + idempotency | Additive | Functions + Client |
| 11 | Create `friendAddProcessor` | Additive | Functions |
| 12 | Client-side event cache fallback | Additive | Client |
| 13 | Batch friend hydration | Performance | Client |
| 14 | Batch squad hydration | Performance | Client |
| 15 | Add missing composite index | Fix | Indexes |
| 16 | Transaction for `updatePersonDetails` | Reliability | Client |
| 17 | Atomic squad member sync | Reliability | Client |
| 18-21 | Operational hardening | Optional | Functions |

**Critical deploy order:** Commits 4→5→6→7 must be sequential. Pipeline must be running before client writes are removed and rules are locked.

---

## Critical Files Reference

| File | Current Role | Change |
|------|-------------|--------|
| `src/services/ledgerService.ts` | Orchestrator | Commit 6: becomes no-op |
| `src/services/friendBalanceService.ts` | Friend ledger writes | Commit 6: delete |
| `src/services/eventLedgerService.ts` | Event ledger writes + optimizeDebts | Commit 6: keep only optimizeDebts |
| `src/services/settlementService.ts` | Settlement API | Commit 9-10: add reversal + idempotency |
| `functions/src/settlementProcessor.ts` | Settlement CF | Commits 3, 8, 10: simplify |
| **New:** `functions/src/ledgerProcessor.ts` | Pipeline CF | Commit 4: core pipeline |
| **New:** `functions/src/friendAddProcessor.ts` | Retroactive scan | Commit 11 |
| **New:** `functions/src/settlementReversal.ts` | Settlement undo | Commit 9 |
| **New:** `shared/optimizeDebts.ts` | Shared debt algo | Commit 1 |
| **New:** `shared/ledgerCalculations.ts` | Shared delta math | Commit 2 |
| **New:** `src/utils/eventBalanceCalculator.ts` | Client fallback | Commit 12 |
| `firestore.rules` | Security | Commit 7: lock down ledgers |
| `firestore.indexes.json` | Indexes | Commit 15: add eventInvitations |
| `src/hooks/useBills.ts` | Bill deletion | Commit 6: simplify to deleteDoc |
| `src/hooks/useEventLedger.ts` | Event balance display | Commit 12: add fallback |
| `src/services/userService.ts` | Friend data | Commit 13: batch hydration |
| `src/services/squadService.ts` | Squad CRUD | Commits 14, 17: batch + atomic |
| `src/services/billService.ts` | Bill CRUD | Commit 16: transaction |

---

## Verification Plan

### After Phase 2 (Pipeline live)
1. Create bill with 3 people → friend_balances updated by pipeline (check CF logs)
2. Create event bill → friend_balances updated + event_balances cache rebuilt
3. Edit assignments → delta correct (not full replacement)
4. Mark person settled → friend_balances zeroed for that person + cache rebuilt
5. Delete bill → friend_balances reversed + cache rebuilt
6. Client-side write to friend_balances → rejected by security rules

### After Phase 3 (Settlement simplified)
1. Settle in event → only friend_balances updated by settlement processor
2. Pipeline auto-fires for settled bills → event cache rebuilt
3. Reverse settlement → bills un-settled, pipeline re-fires, balances restored

### After Phase 4 (Retroactive scan)
1. Add friend who was guest in 5 old bills → friend_balances shows correct balance
2. Query uses indexed unsettledParticipantIds (check query plan)

### After Phase 5 (Cache fallback)
1. Delete event_balances cache doc → event page still shows correct balances (computed)
2. Next bill change in event → cache rebuilt automatically

### Post-Migration Reconciliation
1. Sum all processedBalances footprints per friend pair → compare against friend_balances
2. Fix any discrepancies from pre-pipeline race conditions
