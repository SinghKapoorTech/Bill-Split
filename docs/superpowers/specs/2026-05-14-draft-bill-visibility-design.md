# Draft Bill Visibility — Design Spec

**Date:** 2026-05-14  
**Status:** Approved

## Problem

Bills start as `draft` the moment a wizard is opened and remain `draft` until the owner clicks "Done." Currently, non-owners (event members, bill participants) can see draft bills on both the event detail view and the dashboard home screen before the owner has finished creating them.

**Rule:** A draft bill is visible only to its owner. Non-owners see it only after it becomes `active`.

## Bill Status Lifecycle

- **`draft`** — Bill is being created in a wizard. Owner-only visibility.
- **`active`** — Wizard completed (owner clicked "Done"). Visible to all relevant parties.
- **`archived`** — Bill settled or manually archived. Visible to all relevant parties.

Status transitions to `active` in exactly three places:
- `BillWizard.tsx` `handleDone()`
- `SimpleTransactionWizard.tsx` `handleComplete()`
- `AirbnbWizard.tsx` `handleDone()`

## Changes

### 1. Client-side filtering — `src/hooks/useBills.ts`

In the `onSnapshot` callback, filter the returned bills array before setting state:

```ts
bills.filter(b => b.status !== 'draft' || b.ownerId === user.uid)
```

Owner's own draft bills remain visible so they can resume them. All other users' drafts are hidden.

### 2. Client-side filtering — event bills subscription

In the `subscribeBillsByEvent` callback (called from `useEventBills.ts` or similar), apply the same filter with the current user's UID:

```ts
bills.filter(b => b.status !== 'draft' || b.ownerId === currentUserId)
```

The `currentUserId` is passed into the subscription or filtered at the call site.

### 3. Firestore security rules — `firestore.rules`

Add a helper function and apply it to all non-owner read conditions in the `bills` collection:

```js
function isNotDraft() {
  return resource.data.status != 'draft';
}
```

Every non-owner `allow read` condition is updated to AND with `isNotDraft()`. The owner's unconditional read rule is left unchanged.

This ensures the invariant is enforced at the database level regardless of client behavior.

## What Is Not Changing

- Write rules — drafts can still be written/updated by the owner during wizard flow
- The status transition logic in the wizards — no changes needed there
- Share-link join flow — a draft bill with a share code is still inaccessible to non-owners via the security rule
- The ledger pipeline — draft bills already don't affect balances (no `participantIds` linked during draft)

## Out of Scope

- UI indicators for draft bills on the owner's own dashboard
- Explicit "publish" button (the "Done" button already serves this role)
