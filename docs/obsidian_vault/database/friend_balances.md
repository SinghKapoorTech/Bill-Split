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

```javascript
match /friend_balances/{balanceId} {
  // resource == null allows transaction.get() to read non-existent docs
  allow read: if request.auth != null &&
                 (resource == null || request.auth.uid in resource.data.participants);

  allow create: if request.auth != null &&
                   request.auth.uid in request.resource.data.participants;

  allow update: if request.auth != null &&
                   request.auth.uid in resource.data.participants &&
                   request.auth.uid in request.resource.data.participants;

  allow delete: if false;
}
```

> [!NOTE]
> The `resource == null` condition in the read rule is required because Firestore `runTransaction` always calls `transaction.get()` to establish consistency — even when the document doesn't exist yet. Without this, the rule engine would throw a null-reference error and deny the read.

## Write Strategy — Transactions

All writes to this collection use `runTransaction()` (not `writeBatch` + `FieldValue.increment()`). This is intentional:

1. The transaction reads the existing document first.
2. Computes new balance values in TypeScript (exact numbers, no server-side transforms).
3. Writes the full object back using `transaction.set(..., { merge: true })`.

This approach ensures Firestore Security Rules can evaluate `request.resource.data` correctly, since plain numbers (not `FieldValue.increment()` transforms) are present at rules evaluation time.

## When `friend_balances` Gets Updated

The ledger is updated in three situations:

| Trigger | What fires | When it runs |
|---------|-----------|--------------|
| **User enters the Review step** | `applyBillBalancesIdempotent()` | As soon as `currentStep === 3` in the wizard (even if the user never presses "Done") |
| **User presses "Done"** | `navigate('/dashboard')` only — balances already applied on step entry | Immediately after the Review step effect |
| **Bill is deleted** | `reverseBillBalancesIdempotent()` | Before `deleteDoc()` in both `clearSession` and `deleteSession` |

> [!IMPORTANT]
> The trigger is the **Review step entry**, not the "Done" button. This ensures balances update even when the user:
> - Taps "Charge on Venmo" and leaves the app without pressing Done
> - Closes the browser tab from the Review screen
> - Navigates away via the back button after reviewing

### Why Entry — Not Done?

If balances only updated on "Done", any user who left the app to Venmo a friend would see stale balances indefinitely. Moving the trigger to step entry means the balance is committed the moment the user has seen and reviewed the split.

### Idempotency

`applyBillBalancesIdempotent` uses a strictly transactional reverse-and-apply footprint engine. It compares the current `personTotals` against `processedBalances` on the bill document. It subtracts the mathematically old tracked footprint, and adds the new requested footprint during a single ACID transaction. If called multiple times with the same totals, the net effect on the math remains identical.

---

## How Balances Flow

### On Review Step Entry (Bill Creation / Edit)

When the user navigates to the Review step, `applyBillBalancesIdempotent()` runs in the background via a `useEffect` in `BillWizard.tsx`:

1. Reads the bill's `people` array and `processedBalances` from Firestore.
2. Cross-references each person's `id` against the owner's `user.friends` list to resolve real Firebase UIDs.
3. People added manually without a linked account are **skipped** (their IDs are local UUIDs).
4. Runs a Firestore transaction per friend.
5. In the transaction, the engine computes reversing the old footprint (`processedBalances`) and applying the new total, arriving at an exact new value.
6. Writes the new balance back to the `friend_balances` doc.
7. Updates the bill's `processedBalances` to reflect the new committed footprint.
8. Calls `recalculateAllFriendBalances()` to sync the cache into `user.friends[]`.

### On Bill Deletion

`reverseBillBalancesIdempotent()` is called **before** `deleteDoc()`:

1. Reads the bill's `processedBalances`.
2. For each friend in the map, runs a transaction to completely substract the exact footprint they originally contributed to the ledger.
3. Automatically triggers UI updates because the `getHydratedFriends` hook uses `onSnapshot` to re-fetch the new accurate balance live.

> [!NOTE]
> If the bill was never reviewed (no `processedBalances`), `reverseBillBalancesIdempotent` returns immediately — there is nothing to reverse.

### Historical Ledger Sync (Self-Healing)

`syncOldBillsForUser(userId)` is an automated background job that runs once every 24 hours when a user logs in. It fixes the ledger for legacy bills created before `friend_balances` existed:

1. Scans the user's past bills for any that lack `processedBalances`.
2. If the old bill has items and assignments, it calculates what the split *would have been*.
3. Runs `applyBillBalances` to seamlessly push the missing historical data into the new ledger.

## Relationships

- **[Bills](bills.md)**: Each `friend_balances` doc is updated when a bill is finalized or deleted.
- **[Users](users.md)**: The `user.friends[]` array caches balance totals read from this collection.
