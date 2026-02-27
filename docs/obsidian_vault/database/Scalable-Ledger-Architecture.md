---
tags:
  - architecture
  - database
  - firebase
  - scaling
---
# Scalable Ledger Architecture (Idempotent Deltas)

## Why We Are Making This Change

There are two primary ways to calculate a user's running balance, and the previous architecture relied on problematic implementations of both, leading to critical flaws at scale:

### 1. The $O(N)$ Recalculation Approach ("Burn the Database")
When a user edits a single $10 bill, the easiest way to find the new balance is to delete the current balance, query the database for every single bill that user has ever been a part of in their life, and add them all up from scratch.
- **The Problem:** This requires $O(N)$ document reads, where $N$ is the total number of bills.
- **The Impact at Scale:** If an active user has 5 years of history and 2,000 bills, editing one coffee receipt requires loading 2,000 documents from Firebase. With 10,000 active users making edits, you instantly trigger millions of reads, bankrupting your Firebase quota limits and causing the app to freeze while it waits for the calculation to finish.

### 2. The "Blind Delta" Approach ("Guessing the Math")
To avoid reading 2,000 documents, developers often try to implement "Deltas". If a bill is edited from $50 to $100, the app calculates $+50$ in the browser, and blindly fires an instruction to the server: *"Merge +$50 to the ledger."* 
This approach is fundamentally fragile for financial applications:
- **Network Drops (Double Spending):** If a user saves a bill but their cellular connection stutters just as the request hits the server, their phone might automatically retry the network request. A blind delta API receives it twice and blindly executes `+$50` and then `+$50` again. The user now permanently owes $100 instead of $50, and the database is silently corrupted.
- **"Ghost Debts" on Delete/Edit:** If the user completely removes Person A from a bill, the app has to somehow blindly guess what Person A's original balance was on that bill in order to subtract it. If the client guesses wrong (e.g. because of stale data), Person A gets subtracted by $3 instead of $5. Person A is now permanently stuck with a $2 "ghost debt" on the global dashboard that can never be tracked down or resolved.

### The Solution: "Idempotent Deltas"
In computer science, an operation is *idempotent* if executing it 1 time has exactly the same effect as executing it 100 times.
Under this new architecture, every `Bill` permanently records a footprint of *exactly* what effect it had on the ledger. 

When you edit a bill, the engine:
1. Opens a strict ACID Database Transaction.
2. Reads the footprint from the Bill.
3. Exactly completely reverses the old footprint from the Ledger (Wiping the slate clean).
4. Applies the new math to the Ledger.
5. Saves the new footprint back onto the Bill.

**Benefits:**
- **Crash Proof:** If a network retry hits the server twice, the footprint is already up to date. The first transaction applies normally. The second transaction reverses the new math, and applies the exact same new math again. The ledger stays perfectly intact.
- **Cost:** It requires exactly 2 Reads and 2 Writes per operation, costing an absolute flat fraction of a cent per edit regardless of how long the user has been active.

---

## Scenarios & Edge Cases

### 1. Bill-Specific "Mark as Settled"
**Scenario:** A user hands their friend $25 in cash right at the dinner table. We don't want this debt added to the running total, but we still want them recorded on the digital receipt.
**Behavior:**
- The UI saves the friend's `personId` into a new `settledPersonIds: string[]` array on the Bill document.
- Our Delta Engine fires mathematically. It evaluates that friend's owed amount as `$0` because they are in the `settledPersonIds` array.
- The Delta Engine reverses their old debt, applies the new `$0` debt, and their balance instantly vanishes from the global ledger without affecting anyone else on the receipt.

### 2. Bills with Non-Friends (Shadow Users)
**Scenario:** You go on a trip with Dave. Dave is not your friend in the app yet, but you split 10 bills with him via his phone number.
**Behavior:**
- The Delta Engine never checks the "Friends List" social graph.
- Every time you create a bill, the engine happily creates a raw `friend_balances` document between your User ID and Dave's User ID, tracking the math in the background.
- Because Dave isn't your friend, the UI simply hides this balance on your Dashboard.
- Six months later, you add Dave as a friend. Because the engine was silently tracking the math the entire time, Dave instantly appears on your Dashboard with the perfectly calculated 6-month history.

### 3. Global "Settle Up"
**Scenario:** You and a friend decide to settle your entire global balance or event balance.
**Behavior:**
- The app logs a historical `Settlement` document (a receipt of the payment).
- Wait, does it just do a blind delta? No! We implemented **Cascading Settlements**.
- The settlement processor (`settlementProcessor.ts`) queries your oldest unsettled bills and calculates the exact amount you owe on each.
- For each fully-covered bill, it pushes your `personId` into the `settledPersonIds` array and updates `friend_balances` atomically in a single transaction.
- The ledger pipeline auto-fires for each modified bill and rebuilds the `event_balances` cache.
- Any remaining partial payment left over is applied directly to `friend_balances` as an idempotent deduction.
- The settlement processor does **not** write to `event_balances` — the pipeline handles that as a cache rebuild.
- Settlements can be **reversed** via the `reverseSettlement` Cloud Function, which un-settles bills and restores balances atomically.

---

## Architectural Challenges & Fixes

### 1. The Firestore Read-After-Write Trap
**The Problem:** Firestore strictly mandates that within an atomic `runTransaction` block, **all** document reads (`transaction.get`) must execute before **any** document writes (`transaction.set` or `update`). If we looped through 5 friends on a bill and tried to read Friend A, update Friend A, then read Friend B... Firestore would instantly crash.
**The Fix:** Our Delta Engine groups these phases strictly. Phase 1 iterates through all involved friends and banks the `get()` promises. Phase 2 unrolls the collected delta math and executes all the `set()` writes safely.

### 2. The Deletion Race Condition
**The Problem:** If a user deletes a bill, the frontend would call the Delta Engine to reverse the bill's footprint on the ledger, and then instantly call `deleteDoc` to wipe the bill itself. Because Firestore transactions retry under contention, the Delta Engine might spin up a fraction of a second *after* `deleteDoc` finished. The Delta Engine would try to read the bill to see what its old footprint was, but the bill would already be gone, causing a silent failure where the ledger was never updated.
**The Fix:** The frontend explicitly reads the bill's `processedBalances` footprint *before* triggering deletion, and passes it directly to the Delta Engine as `providedPreviousBalances`. The Delta Engine skips the document read entirely and safely executes the reversal regardless of when `deleteDoc` executes.

---

## Data Schema modifications

### `bills` Collection
Every bill will permanently store exactly what it recently contributed to both ledgers, and track who has already settled up for that specific bill:
```typescript
interface Bill {
  ...
  // Users who have paid their share for this specific bill
  settledPersonIds?: string[];

  // Tracks exactly what was added to the global friend ledger
  processedBalances?: Record<string, number>;

  // Tracks exactly what was added to the local event ledger
  eventBalancesApplied?: Record<string, number>;

  // Pipeline version — incremented by ledgerProcessor after each processing pass.
  // Used for observability and as a guard against redundant trigger processing.
  _ledgerVersion?: number;
}
```

### `settlements` Collection [NEW]
We need a dedicated collection to record when a user "Settles Up" so they can pay each other back.
```typescript
interface Settlement {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  date: Timestamp;
  eventId?: string; // If this settlement was made specifically inside an event
  settledBillIds?: string[]; // Bill IDs fully settled by this payment (enables reversal)
```

### `friend_balances` Collection
Pairwise running balance between two users. Written exclusively by the server-side pipeline (Admin SDK).
```typescript
interface FriendBalance {
  id: string;                        // Deterministic: sorted uid1_uid2
  participants: [string, string];    // The two user UIDs
  balances: Record<string, number>;  // { uid1: amount, uid2: -amount }
  contributingBillIds: string[];     // All bill IDs with non-zero contribution to this balance
  lastUpdatedAt: Timestamp;
  lastBillId: string;                // Most recent bill that triggered a change
}
```

The `contributingBillIds` array is maintained atomically by the pipeline:
- `arrayUnion(billId)` when a bill has a non-zero contribution to this friend pair
- `arrayRemove(billId)` when a bill's contribution goes to zero (settled, person removed, or bill deleted)

This enables the UI to show which bills make up a debt and simplifies settlement by providing bill IDs directly.

---

## Shared Pure Modules

Core calculation logic is extracted into framework-agnostic pure modules under `shared/`. These contain no Firebase, no browser APIs — just math. Both the client app and Cloud Functions import from them.

### `shared/ledgerCalculations.ts`
| Function | Purpose |
|----------|---------|
| `personIdToFirebaseUid(personId)` | Normalizes `user-{uid}` format → raw Firebase UID |
| `getFriendBalanceId(uid1, uid2)` | Deterministic sorted document ID for a friend-balance pair |
| `calculateFriendFootprint(input)` | Computes per-friend amounts from bill data (supports flexible payer) |
| `computeFootprintDeltas(new, old)` | Diff engine — returns only non-zero changes |
| `toProcessedBalances(footprint)` | Strips zero entries before saving to Firestore |

### `shared/optimizeDebts.ts`
| Function | Purpose |
|----------|---------|
| `optimizeDebts(netBalances)` | Greedy debt minimization — reduces N-way balances to minimum transfers |

---

## Server-Side Ledger Pipeline

> [!NOTE]
> **Migration complete.** Client-side ledger writes have been removed and security rules locked down. The pipeline (`ledgerProcessor`) is the sole writer to `friend_balances` and `event_balances`.

All ledger mutations are moving to a **server-side pipeline** — a Firestore `onDocumentWritten` trigger on `bills/{billId}`. The client only writes bill documents; the pipeline handles all downstream ledger effects.

### `ledgerProcessor` Cloud Function (`functions/src/ledgerProcessor.ts`)

```
Bill Create/Edit/Delete  →  Firestore bills/{billId}
                                    │
                         onDocumentWritten trigger
                                    │
                                    ▼
              ┌─────────────────────────────────────┐
              │  Stage 1: VALIDATE & CALCULATE      │
              │  - Compute personTotals from bill    │
              │  - Determine creditor (paidById)     │
              ├─────────────────────────────────────┤
              │  Stage 2: FRIEND LEDGER             │
              │  [authoritative, in transaction]     │
              │  - Compute footprint → delta         │
              │  - Apply to friend_balances          │
              │  - Save processedBalances on bill    │
              ├─────────────────────────────────────┤
              │  Stage 3: EVENT CACHE               │
              │  [best-effort, outside transaction]  │
              │  - Full rebuild from all event bills │
              │  - Write to event_balances           │
              └─────────────────────────────────────┘
```

**Key design decisions:**
- **Stage 2 is a Firestore transaction** — atomic, retries on contention, authoritative
- **Stage 3 is outside the transaction** — it's just a cache rebuild. If it fails, friend_balances (the authority) is still correct. Cache rebuilds on the next bill change.
- **Loop prevention:** `hasRelevantChange()` compares only bill-content fields (`billData`, `people`, `itemAssignments`, `settledPersonIds`, `paidById`, `splitEvenly`, `ownerId`). The pipeline's own `processedBalances` write is excluded, preventing infinite trigger loops.
- **Delete handling:** reads footprint from `before` snapshot, reverses friend_balances, rebuilds event cache without the deleted bill.

### Client-Side Write Path — REMOVED

The client no longer writes to `friend_balances` or `event_balances` directly. All ledger mutations flow through the server-side pipeline. The client only writes bill documents to Firestore.

- `friendBalanceService.ts` — deleted
- `eventLedgerService.ts` — write functions removed, retained only for `EventLedger` type + `OptimizedDebt` re-export
- `ledgerService.ts` — both methods (`applyBillToLedgers`, `reverseBillFromLedgers`) are no-ops
- All UI components (BillWizard, ReviewStep, SimpleTransactionWizard, etc.) no longer call ledger write functions

### Security Rules — Ledger Collections Locked Down

With the pipeline as the sole writer, Firestore security rules now block all client-side writes:

| Collection | Client Read | Client Write | Server (Admin SDK) |
|-----------|-------------|-------------|-------------------|
| `friend_balances` | Participants only | **Blocked** (`if false`) | Full access |
| `event_balances` | Event members only | **Blocked** (`if false`) | Full access |

The `isSettlementUpdate()` helper on bills was tightened to only allow `settledPersonIds` — `processedBalances` and `eventBalancesApplied` are now written exclusively by the server pipeline.

---

## Phased Execution Plan (Small, Safe Chunks)

We will execute this change carefully, ensuring nothing breaks for existing users.

### Phase 1: Data Infrastructure & Preparation (No logic changes)
- [x] Add `settlements` collection rules to Firebase.
- [x] Create `src/types/settlement.types.ts` interface.
- [x] Update `src/types/bill.types.ts` to add optional `settledPersonIds`, `processedBalances`, and `eventBalancesApplied`.
- [x] Create `src/services/settlementService.ts` for basic CRUD operations.

### Phase 2: Building the O(1) Engine (In Isolation)
- [x] Refactor `friendBalanceService.ts` to implement the new Transactional Reversed-Footprint method (`applyBillBalancesIdempotent`). Leave the old method intact temporarily.
- [x] Refactor `eventLedgerService.ts` to implement the same Idempotent transaction logic for events.

### Phase 3: Switching Over the Triggers
- [x] Update `useBills.ts` Create/Update/Delete functions to point to the new Idempotent methods instead of the old delta methods.
- [x] Update `useEventBills.ts` similarly.

### Phase 4: Settle Up UI
- [x] Build the UI component for capturing "Global Settle Up" (selecting friend, inputting amount, firing `createSettlement`).
- [x] Add the "Settle Up" UI to `EventDetailView.tsx`.
- [ ] Update Bill Creation UI to support checking off "Already Settled" to push to `settledPersonIds`.

### Phase 5: Cleanup & Unification ✅
- [x] Delete the old non-idempotent delta functions (`applyBillBalances`, `reverseBillBalances`, `applyBillToEventLedger`).
- [x] Delete the self-healing sync jobs (`syncOldBillsForUser`, `recalculateEventLedger`).
- [x] Create unified `ledgerService.ts` that orchestrates both ledger services via `Promise.all`.
- [x] Update all UI call sites to use `ledgerService` instead of calling individual services directly.
