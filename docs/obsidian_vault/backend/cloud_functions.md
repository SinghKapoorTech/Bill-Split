---
title: Backend Cloud Functions
date: 2026-02-27
tags: [backend, functions, firestore, architecture, ledger]
---

# Backend Cloud Functions

With the migration to a **Server-Side Unified Ledger Pipeline**, the vast majority of financial logic, aggregation, and atomic transaction handling was moved from the client browser to secure Firebase Cloud Functions.

All functions are located under `functions/src/` and are deployed via the Firebase CLI. They run in a trusted Node.js environment utilizing the `firebase-admin` SDK, which allows them to bypass the strict client-side Firestore rules and securely author the ledger.

---

## 1. `ledgerProcessor`
**Trigger:** `onDocumentWritten ('bills/{billId}')`

This is the core engine of the entire application. It runs every time a `Bill` document is created, updated, or deleted.

### Responsibilities:
1. **Validation & Calculation:** Reads the bill data and item assignments to compute exactly who owes what (or who paid what). 
2. **Authoritative Ledger Updates:** Safely commits mathematical footprints (using an Idempotent Delta engine) into the `friend_balances` collection. It completely reverses the old mathematical effect of the bill before applying the new one, ensuring the ledger perfectly reflects the current state of the bill even if the function is triggered multiple times (idempotency).
3. **Cache Rebuilding:** If the bill belongs to an Event, it automatically aggregates all bills within that event and overwrites the `event_balances` cache document.
4. **Loop Prevention:** It carefully inspects the `before` and `after` snapshots. It aborts execution if the only fields modified were backend tracking metadata (like its own `processedBalances` update), preventing an infinite loop hook cycle.

---

## 2. `settlementProcessor`
**Trigger:** `onCall ('processSettlement')` (HTTPS Callable)

When a user clicks "Settle Up" to pay off an outstanding balance, the client fires this function directly.

### Responsibilities:
1. **Historical Ledger Crawling:** It determines exactly how much is owed, and iterates chronologically through the oldest unsettled bills.
2. **Atomic Ledger Deductions:** It adds the payer's `personId` to the `settledPersonIds` array of the fully covered bills, instructing the `ledgerProcessor` engine that this debt is nullified.
3. **Receipt Generation:** It logs the action permanently in the `settlements` collection for historical tracking and reversal capabilities.
4. **Concurrency Safety:** It is strictly idempotent (rejecting double-submissions of the same settlement) and processes bills in batches to avoid Firestore transaction timeouts.

---

## 3. `settlementReversal`
**Trigger:** `onCall ('processSettlementReversal')` (HTTPS Callable)

Allows a user to undo a settlement if a payment was logged accidentally. 

### Responsibilities:
1. **Lookup:** Finds the `settledBillIds` stored on the target settlement receipt.
2. **Un-Settle:** Safely removes the the user's `personId` from the `settledPersonIds` array on each individual bill document.
3. **Pipeline Reactivation:** Mutating the bills natively re-triggers the `ledgerProcessor`, which computes that the users are no longer settled, perfectly recreating their former owed balance in the ledger. 

---

## 4. `friendAddProcessor`
**Trigger:** `onDocumentUpdated ('users/{userId}')`

A retroactive scanning function that heals the ledger when new social connections are made.

### Responsibilities:
1. **Detect Changes:** Looks at `before.friends` and `after.friends` to identify specifically whose UID was just added.
2. **Historical Query:** Queries the `bills` collection for any past bills where the two users split a cost as non-friends (which bypassed the `friend_balances` ledger at the time).
3. **Pipeline Reactivation:** Gently "touches" these old bills with a `_friendScanTrigger` timestamp. This arbitrary modification causes the `ledgerProcessor` to spin up. The `ledgerProcessor` now sees the users are, in fact, friends, and backfills their shared ledger perfectly. 
