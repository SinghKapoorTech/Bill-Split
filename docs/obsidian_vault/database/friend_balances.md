---
title: Friend Balances Collection Schema
date: 2026-02-21
tags: [database, schema, firestore, friend_balances, balances]
---

# `friend_balances` Collection

The `friend_balances` collection is the **source of truth** for all financial balances between pairs of users. It implements a **symmetrical shared ledger** — meaning when User A creates a bill involving User B, both users see the exact same balance change automatically, without requiring either to be friends with the other.

> [!IMPORTANT]
> This is a critical design distinction. The balance stored in `user.friends[].balance` is a **read cache** of data pulled from this collection. If they ever conflict, `friend_balances` wins.

## Document ID

A deterministic, sorted composite of both participant UIDs:

```
${userId1}_${userId2}   (where userId1 < userId2 alphabetically)
```

**Example:** If Alice (`abc123`) and Bob (`xyz789`), the document ID is `abc123_xyz789`.

This sorting guarantees that there is exactly **one** document per pair, regardless of who creates the bill.

The helper function `getFriendBalanceId(userId1, userId2)` in `friendBalanceService.ts` generates this ID via `[userId1, userId2].sort().join('_')`.

## Schema (`FriendBalance`)

| Field            | Type            | Description                                                                           |
| ---------------- | --------------- | ------------------------------------------------------------------------------------- |
| `id`             | String          | The document ID (matches the computed sorted ID).                                     |
| `participants`   | Array of String | `[userId1, userId2]` — the two Firebase UIDs involved. Used for Firestore queries.    |
| `balances`       | Object (Map)    | See below.                                                                            |
| `lastUpdatedAt`  | Timestamp       | When this document was last written.                                                  |
| `lastBillId`     | String          | Reference to the most recent **[Bill](bills.md)** that triggered a balance change.   |

### The `balances` Map

```typescript
balances: {
  [userId: string]: number  // Net amount this user is OWED by the other participant
}
```

**Sign convention:**
- **Positive** → that user is owed money by the other person.
- **Negative** → that user owes money to the other person.

**Example:** Alice paid for dinner. Bob owes Alice $25.
```json
{
  "balances": {
    "alice_uid": 25,
    "bob_uid": -25
  }
}
```

The two values always sum to zero: `balances[A] + balances[B] === 0`.

## Security Rules

## Security Rules

```javascript
match /friend_balances/{balanceId} {
  // resource == null allows transaction.get() to read non-existent docs
  allow read: if request.auth != null &&
                 (resource == null || request.auth.uid in resource.data.participants);

  // Locked down: Only the backend ledgerProcessor Cloud Function can write balances
  allow write: if false;
}
```

> [!NOTE]
> The `resource == null` condition in the read rule is required because Firestore `runTransaction` always calls `transaction.get()` to establish consistency — even when the document doesn't exist yet. Without this, the rule engine would throw a null-reference error and deny the read.

## Write Strategy — Transactions

All writes to this collection are performed exclusively by the **`ledgerProcessor` Cloud Function** using the Firebase Admin SDK. (See [[../backend/cloud_functions|Cloud Functions Overview]] for details). Specifically, it uses `runTransaction()` internally. This is intentional:

1. The transaction reads the existing document first.
2. Computes new balance values in TypeScript (exact numbers, no server-side transforms) based on the exact change (delta) from the connected bill.
3. Writes the full object back using `transaction.set(..., { merge: true })`.

This transactional approach guarantees that even if a bill is rapidly edited by multiple users concurrently, the running balance remains perfectly mathematically accurate.

## When `friend_balances` Gets Updated

Under the unified ledger architecture, the `friend_balances` collection is strictly updated via the backend to establish a single source of truth and eliminate race conditions.

| Trigger | What fires | When it runs |
|---------|-----------|--------------|
| **Bill is Created/Edited/Reviewing** | `ledgerProcessor` Cloud Function | Automatically `onDocumentWritten` (whenever the Bill document changes in Firestore). |
| **Mark as Settled (Specific User)**| `ledgerProcessor` Cloud Function | The client sets a user in the `settledPersonIds` array. The backend detects this and applies a `$0` debt footprint. |
| **Historical Settle Up** | `settlementProcessor` Cloud Function | A settlement receipt is created. The backend applies the payment directly to the balances. |
| **Adding a New Friend** | `friendAddProcessor` Cloud Function | When a user's `friends` array changes, the backend retroactively triggers all historical shared bills to backfill the ledger. |

> [!IMPORTANT]
> Client code **cannot** modify `friend_balances` directly. All UI mutations (creating, editing, deleting a bill) simply save the bill to Firestore, and the backend guarantees the ledger is perfectly updated.

---

## How Balances Flow

### 1. The Validation & Calculation Phase
When a `Bill` document is written, the `ledgerProcessor` detects the change. It reads the bill, computes exact per-person mathematical totals using `shared/ledgerCalculations.ts`, and determines who the creditors are.

### 2. The Transactional Update Phase (Authoritative)
The pipeline opens an ACID transaction against Firestore:
1. It looks at the bill's `processedBalances` property to see what financial footprint was *previously* committed for this bill.
2. It reverses the old footprint from `friend_balances`.
3. It applies the newly calculated footprint to `friend_balances`.
4. It saves the newly applied footprint back onto the bill's `processedBalances` field.

This system of "Idempotent Deltas" makes the ledger bulletproof against network lag, double-submissions, or race conditions.

### 3. The Cache Rebuild Phase (Best-Effort)
After the transaction successfully commits to `friend_balances`, the backend rebuilds the associated `event_balances` cache document (if the bill was part of an event).

> [!NOTE]
> If the bill was never reviewed (no `processedBalances`), `reverseBillBalancesIdempotent` returns immediately — there is nothing to reverse.

> [!NOTE]
> The Historical Ledger Sync / Self-Healing job (`syncOldBillsForUser`) has been **removed** as part of the ledger unification refactor. The unified `ledgerService` write path now guarantees consistency between both ledgers, eliminating the need for background reconciliation.

## Relationships

- **[Bills](bills.md)**: Each `friend_balances` doc is updated when a bill is finalized or deleted.
- **[Users](users.md)**: The `user.friends[]` array caches balance totals read from this collection.
