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

### New Firestore collection: `settlement_requests/{requestId}`

```
settlement_requests/{requestId}
  - id: string                          // Auto-generated doc ID
  - fromUserId: string                  // Debtor (person who owes)
  - toUserId: string                    // Creditor (person who is owed)
  - amount: number                      // Positive amount being settled
  - status: 'pending' | 'approved' | 'declined'
  - eventId?: string                    // Present if event-scoped request
  - balanceId: string                   // Reference to balances/{uid1_uid2} or event_balances/{...}
  - createdAt: timestamp
  - resolvedAt?: timestamp              // Set when approved or declined
```

### Security Rules

- **Read**: Only `fromUserId` or `toUserId`
- **Create**: Only authenticated user who is `fromUserId`; status must be `'pending'`
- **Update**: Only `toUserId` can update; can only change `status` to `'approved'` or `'declined'` and set `resolvedAt`
- **Delete**: Either participant (for cleanup)

### Uniqueness Constraint

Enforced client-side: before creating a request, query for any existing `pending` request between the same pair (and same `eventId` if event-scoped). If one exists, block creation.

### Firestore Indexes

- Composite index on `(fromUserId, status)` for outgoing request queries
- Composite index on `(toUserId, status)` for incoming request queries

## Request Lifecycle

### Creating a request (debtor clicks "Request Settlement")

1. Client checks for existing `pending` request between this pair (+eventId if scoped)
2. If none exists, creates `settlement_requests` doc with `status: 'pending'`
3. No balance or bill changes happen yet -- everything stays as-is

### Approving a request (creditor clicks "Approve")

1. Client updates request doc: `status: 'approved'`, `resolvedAt: serverTimestamp()`
2. Client calls the existing `processSettlement` or `processEventSettlement` Cloud Function
3. Settlement processes atomically as it does today (marks bills, zeroes balance, writes immutable settlement record)

### Declining a request (creditor clicks "Decline")

1. Client updates request doc: `status: 'declined'`, `resolvedAt: serverTimestamp()`
2. Nothing else happens -- balance stays unchanged
3. Debtor can now send a new request

### Creditor clicks "Settle Up" (instant path)

1. No request created -- directly calls `processSettlement` / `processEventSettlement` as today
2. Existing flow is completely unchanged

### Key architectural point

No new Cloud Functions needed. The approval step gates access to the existing settlement Cloud Functions. The `settlement_requests` collection is purely client-read/write (with security rules). Actual settlement processing is unchanged.

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
}
```

### Where the hook is consumed

- `FriendBalancePreviewCard` -- show pending indicators on balance rows
- `BalanceDetailView` -- swap Settle Up for Approve/Decline or show Pending state
- `SettleUpModal` -- check if pending request exists before allowing new request

## UI Changes

### BalanceListRow (dashboard balance rows)

| State | Debtor sees | Creditor sees |
|-------|------------|---------------|
| Normal | Red "You owe X $Y" | Green "X owes you $Y" |
| Pending request | "You owe X $Y" + clock icon + "Pending" badge | "X owes you $Y" + incoming request indicator (e.g., "Requests settlement") |
| Settled | Gray "Settled up" | Gray "Settled up" |

### BalanceDetailView (detail page)

| State | Debtor's view | Creditor's view |
|-------|--------------|-----------------|
| Normal | Hero card with red balance + "Request Settlement" button | Hero card with green balance + "Settle Up" button |
| Pending | Hero card with "Pending" badge + clock icon. Request button disabled/hidden | Request banner: "X says they've paid $Y". Approve (green) + Decline (red) buttons replace Settle Up |
| After decline | Returns to Normal | Returns to Normal |
| After approve | Transitions to Settled | Transitions to Settled |

### SettleUpModal changes

- When `isPaying` is `true` (debtor): button label changes from "Mark as Settled" to "Request Settlement". On click, creates a `settlement_requests` doc instead of calling `processSettlement`
- When `isPaying` is `false` (creditor): "Mark as Settled" stays as-is, calls `processSettlement` directly
- If a pending request already exists for this pair, show disabled state with "Request Pending" text

## Files to modify

### New files
- `src/types/settlementRequest.types.ts` -- SettlementRequest type
- `src/hooks/useSettlementRequests.ts` -- real-time subscription hook
- `src/services/settlementRequestService.ts` -- CRUD operations for requests

### Modified files
- `firestore.rules` -- add settlement_requests collection rules
- `firestore.indexes.json` -- add composite indexes
- `src/components/settlements/SettleUpModal.tsx` -- debtor path creates request instead of settling
- `src/components/shared/BalanceListRow.tsx` -- pending/request indicators
- `src/pages/BalanceDetailView.tsx` -- Approve/Decline UI, pending state
- `src/components/dashboard/FriendBalancePreviewCard.tsx` -- pass request state to balance rows

## What stays unchanged

- Ledger pipeline (`ledgerProcessor.ts`) -- no changes
- Settlement Cloud Functions (`processSettlement`, `processEventSettlement`) -- no changes
- Settlement reversal (`reverseSettlement`) -- no changes
- Balance data model (`balances`, `event_balances`) -- no changes
- Creditor settlement flow -- remains instant
