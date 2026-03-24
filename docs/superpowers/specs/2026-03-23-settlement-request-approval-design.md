# Settlement Request & Approval Flow

## Problem

Currently, either party (debtor or creditor) can instantly mark a balance as settled. This means a debtor can claim they've paid without the creditor confirming they received the money. The settlement should require creditor approval when initiated by the debtor.

## Requirements

- **Debtor settles** -> sends a request to the creditor (not instant)
- **Creditor settles** -> instant (they're confirming receipt of payment)
- **Pending state**: Debtor sees balance with "Pending" badge + clock icon
- **Creditor sees**: Request text/icon on their balance row; tapping into detail shows Approve/Decline instead of Settle Up
- **Decline**: Request removed silently, balance returns to normal for both sides
- **Re-requests**: One active request at a time per pair (+eventId), can re-send immediately after decline
- **Scope**: Both global and event-scoped settlements

## Data Model

### New Firestore collection: `settlement_requests/{deterministic_id}`

Uses a **deterministic document ID** for atomic uniqueness enforcement:
- Global: `{sortedUid1}_{sortedUid2}` (same sort order as `balances`)
- Event-scoped: `{eventId}_{sortedUid1}_{sortedUid2}`

This prevents duplicate pending requests without TOCTOU races -- Firestore naturally rejects creating an existing doc.

```
settlement_requests/{deterministic_id}
  - fromUserId: string                  // Debtor (person who owes)
  - toUserId: string                    // Creditor (person who is owed)
  - amount: number                      // Positive, informational (see Balance Drift below)
  - status: 'pending' | 'approved' | 'declined'
  - eventId?: string                    // Present if event-scoped request
  - createdAt: timestamp
  - resolvedAt?: timestamp              // Set when approved or declined
```

Note: `balanceId` was removed -- it is derivable from `fromUserId` + `toUserId` + optional `eventId` using existing `getFriendBalanceId` / `getEventBalanceId` helpers.

### Security Rules

- **Read**: Only `fromUserId` or `toUserId`
- **Create**: Only authenticated user who is `fromUserId`; `status` must be `'pending'`; `amount` must be positive; `fromUserId != toUserId`; `createdAt` must be `request.time`; `resolvedAt` must not be set
- **Update**: Only `toUserId` can update; can only change `status` from `'pending'` to `'approved'` or `'declined'`; must set `resolvedAt` to `request.time`; no other fields may change (use `onlyUpdating(['status', 'resolvedAt'])` pattern)
- **Delete**: Either participant (for cleanup)

### Uniqueness Constraint

Enforced atomically via deterministic document IDs. Before creating, the client reads the doc by ID. If it exists and is `pending`, block creation. If it exists and is `declined`, use a Firestore batch write to delete the old doc and create the new one atomically. Firestore rejects duplicate creates automatically.

Use `getFriendBalanceId` and `getEventBalanceId` from `shared/ledgerCalculations.ts` to generate deterministic IDs -- do not re-implement the sort logic.

### Firestore Indexes

- Composite index on `(fromUserId, status)` for outgoing request queries
- Composite index on `(toUserId, status)` for incoming request queries

## Request Lifecycle

### Creating a request (debtor clicks "Request Settlement")

1. Client computes deterministic doc ID from the user pair (+eventId)
2. Client reads doc by ID. If `pending`, block creation. If `declined`, delete then create new
3. Creates `settlement_requests` doc with `status: 'pending'`
4. No balance or bill changes happen yet -- everything stays as-is
5. Success toast: "Settlement request sent"

### Approving a request (creditor clicks "Approve")

1. Client updates request doc: `status: 'approved'`, `resolvedAt: serverTimestamp()`
2. Client calls the existing `processSettlement` or `processEventSettlement` Cloud Function
3. Settlement processes atomically as it does today (marks bills, zeroes balance, writes immutable settlement record)
4. **If `processSettlement` fails**: show error toast to the creditor. The request stays `approved` but the balance is not zeroed. The creditor can retry by navigating back to the balance detail and the UI should show a "Retry Settlement" button when a request is `approved` but the balance is still non-zero. Alternatively, they can use the settlement reversal flow.

### Declining a request (creditor clicks "Decline")

1. Client updates request doc: `status: 'declined'`, `resolvedAt: serverTimestamp()`
2. Nothing else happens -- balance stays unchanged
3. Debtor can now send a new request (the declined doc is cleaned up on next request creation)

### Creditor clicks "Settle Up" (instant path)

1. No request created -- directly calls `processSettlement` / `processEventSettlement` as today
2. **After successful settlement**: check for any pending request for this pair (+eventId) and auto-approve it (set `status: 'approved'`, `resolvedAt: serverTimestamp()`) to clean up stale requests
3. Existing flow is otherwise unchanged
4. **If auto-approve fails** (network error): the settlement succeeded but the request remains `pending`. The hook handles this defensively -- if a pending request exists but the balance is zero, treat it as auto-resolved in the UI and clean it up on next interaction

### Balance drift between request and approval

The `amount` on the request is **informational only** -- it reflects the balance at the time the request was created. The actual settlement always uses the live balance via `processSettlement`/`processEventSettlement`. If the balance has changed since the request was created, the creditor's UI shows the live balance (not the request amount). The request banner text says "X requested to settle" without a specific dollar amount, avoiding confusion if the balance has drifted.

### Key architectural point

No new Cloud Functions needed. The approval step gates access to the existing settlement Cloud Functions. The `settlement_requests` collection is purely client-read/write (with security rules). Actual settlement processing is unchanged.

**Note on server-side enforcement**: The approval flow is a social protocol enforced by the UI, not a server-side authorization gate. The existing `processSettlement` Cloud Function does not check caller role (debtor vs creditor). If server-side enforcement is desired in the future, the Cloud Function would need to verify the caller is the creditor or has an approved request.

## Real-time Subscriptions

### New hook: `useSettlementRequests`

Subscribes to two queries on `settlement_requests`:

- **Outgoing**: `where('fromUserId', '==', currentUserId)` + `where('status', '==', 'pending')`
- **Incoming**: `where('toUserId', '==', currentUserId)` + `where('status', '==', 'pending')`

Returns:
```typescript
{
  outgoingRequests: SettlementRequest[];
  incomingRequests: SettlementRequest[];
  getOutgoingRequestForUser(friendId: string, eventId?: string): SettlementRequest | undefined;
  getIncomingRequestFromUser(friendId: string, eventId?: string): SettlementRequest | undefined;
  loading: boolean;
}
```

**Provided via context** (`SettlementRequestsContext`) to avoid redundant Firestore subscriptions across multiple consuming components. Wrap at the app level alongside `AuthContext`.

### Where the hook is consumed

- `FriendBalancePreviewCard` -- show pending indicators on balance rows
- `BalanceDetailView` -- swap Settle Up for Approve/Decline or show Pending state
- `SettleUpModal` -- check if pending request exists before allowing new request

### Stale request cleanup

The hook filters out requests older than 14 days client-side. Stale pending requests are treated as expired and ignored by the UI. A future enhancement could add a scheduled Cloud Function for server-side cleanup.

## UI Changes

### BalanceListRow (dashboard balance rows)

New props added to `BalanceListRowProps`:
- `pendingOutgoing?: boolean` -- debtor has a pending outgoing request
- `pendingIncoming?: boolean` -- creditor has a pending incoming request

| State | Debtor sees | Creditor sees |
|-------|------------|---------------|
| Normal | Red "You owe X $Y" | Green "X owes you $Y" |
| Pending request | "You owe X $Y" + clock icon + "Pending" badge | "X owes you $Y" + incoming request indicator (e.g., "Requests settlement") |
| Settled | Gray "Settled up" | Gray "Settled up" |

### BalanceDetailView (detail page)

| State | Debtor's view | Creditor's view |
|-------|--------------|-----------------|
| Normal | Hero card with red balance + "Request Settlement" button | Hero card with green balance + "Settle Up" button |
| Pending | Hero card with "Pending" badge + clock icon. Request button disabled/hidden | Request banner: "X requested to settle". Approve (green) + Decline (red) buttons replace Settle Up |
| After decline | Returns to Normal | Returns to Normal |
| After approve | Transitions to Settled | Transitions to Settled |

Event-scoped requests are visible within the event detail view only; they do not bubble up to the main dashboard.

### SettleUpModal changes

- When `isPaying` is `true` (debtor): button label changes from "Mark as Settled" to "Request Settlement". On click, creates a `settlement_requests` doc instead of calling `processSettlement`. Success toast: "Settlement request sent" (not "Settlement processed")
- When `isPaying` is `false` (creditor): "Mark as Settled" stays as-is, calls `processSettlement` directly (plus auto-approves any pending request for cleanup)
- If a pending request already exists for this pair, show disabled state with "Request Pending" text
- **Venmo button path**: The "Pay on Venmo" / "Charge on Venmo" button behavior is unchanged for both parties -- it opens the Venmo deep link as today. For debtors, after paying on Venmo externally, they return to the app and use "Request Settlement" to notify the creditor. The Venmo button does not create a settlement request automatically.

## Files to modify

### New files
- `src/types/settlementRequest.types.ts` -- SettlementRequest type
- `src/hooks/useSettlementRequests.ts` -- real-time subscription hook + context provider
- `src/services/settlementRequestService.ts` -- CRUD operations for requests

### Modified files
- `firestore.rules` -- add settlement_requests collection rules
- `firestore.indexes.json` -- add composite indexes
- `src/components/settlements/SettleUpModal.tsx` -- debtor path creates request instead of settling
- `src/components/shared/BalanceListRow.tsx` -- add `pendingOutgoing`/`pendingIncoming` props, render indicators
- `src/pages/BalanceDetailView.tsx` -- Approve/Decline UI, pending state
- `src/components/dashboard/FriendBalancePreviewCard.tsx` -- pass request state to balance rows
- `src/App.tsx` (or equivalent root) -- wrap with `SettlementRequestsContext` provider

## What stays unchanged

- Ledger pipeline (`ledgerProcessor.ts`) -- no changes
- Settlement Cloud Functions (`processSettlement`, `processEventSettlement`) -- no changes
- Settlement reversal (`reverseSettlement`) -- no changes
- Balance data model (`balances`, `event_balances`) -- no changes
- Creditor settlement flow -- remains instant

## Known limitations / future enhancements

- **No push notifications**: Creditors discover incoming requests passively when viewing the dashboard. A future enhancement could add a notification badge count on the dashboard or push notifications.
- **No server-side enforcement**: The debtor could technically bypass the UI and call `processSettlement` directly. Server-side enforcement would require modifying the Cloud Function to check caller role.
- **No request history**: Declined requests are overwritten on re-request. A future enhancement could track request history if needed.
