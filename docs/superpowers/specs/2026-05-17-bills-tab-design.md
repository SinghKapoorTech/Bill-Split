# Bills Tab — Design Spec

**Date:** 2026-05-17  
**Status:** Approved

## Overview

Replace the "Squads" bottom nav tab with a new "Bills" tab that hosts the full bills list, currently embedded in the Dashboard. The Dashboard becomes leaner, showing only the friend balances section. Squads remain accessible via the Settings page.

## Changes

### 1. Bottom Navigation (`MobileNavBar.tsx`)

Replace the Squads nav item with Bills:

| Field  | Old value                     | New value                  |
|--------|-------------------------------|----------------------------|
| name   | `'Squads'`                    | `'Bills'`                  |
| path   | `'/squads'`                   | `'/bills'`                 |
| icon   | `MdPeople` (react-icons/md)   | `Receipt` (lucide-react)   |

### 2. New Route (`App.tsx`)

Add `/bills` route inside the existing protected `<Layout>` wrapper, alongside `/dashboard`, `/events`, etc.

```tsx
<Route path="/bills" element={<BillsView />} />
```

### 3. New Page (`src/pages/BillsView.tsx`)

**Header** — mirrors EventsView pattern:
```tsx
<h1 className="text-3xl font-bold">Your Bills</h1>
<p className="text-muted-foreground">Manage and track your split bills</p>
```
Plus a rounded `+` button (top-right) that opens the existing `CreateOptionsDialog`.

**Body** — the full bills list moved from Dashboard:
- `useBills()` + `useBillSession()` hooks for data and session management
- `allBills` derived from `activeSession` + `savedSessions` (same logic as Dashboard)
- `MobileBillCard` per bill with motion stagger animation
- Loading spinner (`Loader2`) for `isManualRefreshing` state
- Empty state for when `allBills.length === 0`
- All handlers: `handleViewBill`, `handleResumeBill`, `handleDeleteBill`
- Utility functions: `formatDate`, `getBillTitle`

### 4. Dashboard Cleanup (`Dashboard.tsx`)

Remove:
- The bills list JSX block (the `allBills.length > 0` section)
- `useBills` hook call
- `useBillSession` hook call (if only used for bills)
- `isResuming`, `isDeleting`, `isManualRefreshing` state
- `handleViewBill`, `handleResumeBill`, `handleDeleteBill` handlers
- `formatDate`, `getBillTitle` utilities (move to BillsView or a shared util)
- All bill-related imports (`MobileBillCard`, `motion`, etc.) that are no longer needed

**What remains on Dashboard:** the friend balances section only.

## Squads Access

Squads are no longer in the bottom nav. Users access them via **Settings → Squads tab**. No Squads routes are removed.

## Icon Choice

`Receipt` from `lucide-react` — already used throughout the app for bill-related UI (`src/components/dashboard/MobileBillCard.tsx`). Semantically clear and consistent.
