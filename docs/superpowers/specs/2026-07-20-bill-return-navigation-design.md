# Bill Return Navigation — Design

**Date:** 2026-07-20
**Status:** Approved, pending implementation

## Problem

There is no path back to where the user was before they opened a bill. Exiting a
bill lands on a hardcoded destination that ignores the entry point.

Concretely: opening a bill from `/balances/:uid` and pressing Done lands on
`/bills`, not back on the balances page. Same for entry from the dashboard or a
squad.

## Current behavior (as mapped)

`BillWizard.handleDone` (`src/components/bill-wizard/BillWizard.tsx:632-650`) is
the single exit for both "Done" and the step-0 back button:

- event bills → `/events/:eventId`
- everything else → `/bills`

Sibling wizards repeat the pattern with a _different_ fallback (`/dashboard`):

| Wizard             | Exit sites                                              | Destinations                               |
| ------------------ | ------------------------------------------------------- | ------------------------------------------ |
| Bill               | `BillWizard.tsx:647,649`                                | `/events/:id`, `/bills`                    |
| Simple transaction | `SimpleTransactionWizard.tsx:424-428, 468-472, 584-588` | `/events/:id`, `/squads/:id`, `/dashboard` |
| Airbnb             | `AirbnbWizard.tsx:327,329`                              | `/events/:id`, `/dashboard`                |
| Recurring          | `RecurringQuickWizard.tsx:262,390`                      | `/bills`, `/dashboard`                     |

Plus a session-timeout escape at `AIScanView.tsx:173` → `/dashboard`.

### Existing conventions

- **Forward context** is the dominant pattern: `state: { targetEventId,
targetEventName }` (`EventDetailView.tsx:267,273,318,438`,
  `CreateOptionsDialog.tsx:61`) and `state: { targetSquadId, targetSquadName }`
  (`SquadDetailView.tsx:77,83`). Exit logic reuses it as a de facto "return to
  event" — which is why the event case half-works today.
- Entry points that pass **no state at all**: `BillsView.tsx:158`,
  `BalanceDetailView.tsx:113,126`. These are the broken cases.
- A working `returnTo` round trip already exists for auth
  (`GuestClaimView.tsx:539` → `Auth.tsx:24-29,52-54`), via query param +
  localStorage.

### Key structural fact

Wizard step navigation is component state (`handlePrevStep`), **not** history
entries. The history stack is therefore just `origin → bill`, meaning
hardware/swipe back already lands on the origin today. The bug is that the
buttons disagree with the stack — not that the stack is wrong.

_This assumption must be verified against the running app before the `navigate(-1)`
strategy is relied upon._

## Requirements

1. Leaving a bill returns to the entry point: event detail, balances page,
   squad, bills list, or dashboard.
2. Mobile is the priority platform.
3. Every exit agrees — Done, in-app back, and hardware/swipe back.
4. Built as a reusable pattern, applied to all four wizards.

## Design

### 1. `useReturnTo(billId)` — `src/hooks/useReturnTo.ts`

Resolves the exit destination once, in priority order:

1. `location.state.returnTo` — stamped by the entry point
2. `sessionStorage['returnTo:{billId}']` — survives reload / app relaunch
3. Inferred from the bill: `eventId` → `/events/:id`, `squadId` → `/squads/:id`
4. `/dashboard`

On first successful resolve it writes to sessionStorage.

**The sessionStorage write must happen before any state-clearing navigation.**
`AIScanView.tsx:165` and `AirbnbView.tsx:139` both run
`navigate('.', { replace: true, state: {} })`, which wipes router state
mid-session. Without the eager persist, `returnTo` would silently vanish on
those paths.

Returns `{ returnTo, label, goBack }`.

### 2. `goBack()` — pop when possible, navigate otherwise

The hook records `useNavigationType()` on mount.

- `PUSH` → the origin is genuinely one entry behind, so `navigate(-1)`.
  Identical to hardware back, and does not grow the stack.
- anything else (cold deep link, reload, `POP`) →
  `navigate(returnTo, { replace: true })`.

Correct destination in every case; clean stack in the common one.

### 3. `navigateToBill(navigate, location, path, extraState?)`

Same module. Stamps `returnTo: location.pathname + location.search`
automatically, so the nine entry call sites become one-line swaps and a tenth
entry point cannot easily forget the origin.

Call sites: `BillsView.tsx:158`, `BalanceDetailView.tsx:113,126`,
`EventDetailView.tsx:265,270,317,438`, `SquadDetailView.tsx:75,80`,
`CreateOptionsDialog.tsx:61`.

Existing `targetEventId` / `targetSquadId` state passes through untouched — no
behavior change to the forward-context path.

### 4. Exits

All hardcoded branches listed in the table above are replaced with `goBack()`,
including the `AIScanView.tsx:173` timeout escape.

### 5. Label, and two adjacent fixes

`label` derives from the resolved path:

| Path          | Label    |
| ------------- | -------- |
| `/events/*`   | Event    |
| `/balances/*` | Balances |
| `/squads/*`   | Squad    |
| `/bills`      | Bills    |
| else          | Home     |

This replaces the current `exitLabel` ternary, which fixes by construction the
existing bug where the label reads "Dashboard" (`BillWizard.tsx:844-846`) while
`handleDone` navigates to `/bills` (`:649`).

Separately, `StepFooter` (`src/components/shared/StepFooter.tsx:23,38-47`) gains
an optional `onExit` / `exitLabel`. It currently has no exit prop, so on desktop
step 0 there is no way out of a bill except the nav bar.

## Testing

**Unit (Vitest, in `tests/` — not in `shared/`, per CLAUDE.md):** the
`useReturnTo` resolution ladder — each priority tier, the state-wipe case, and
label derivation.

**Manual QA** against `npm run dev` at mobile viewport:

- event → bill → Done returns to event
- `/balances/:uid` → bill → Done returns to that balances page
- dashboard → bill → Done returns to dashboard
- hard reload mid-bill, then Done
- Android-style hardware back agrees with Done
- desktop step 0 now has an exit control

## Risks

`navigate(-1)` after _completing_ a bill returns to a page rendered from
Firestore realtime listeners, so it should show the new bill. If any origin page
holds derived state in a `useState` that does not resubscribe, it could look
stale. `BalanceDetailView` and `EventDetailView` to be checked specifically
during manual QA; fall back to `replace` navigation for the post-completion exit
if either misbehaves.

## Out of scope

Event detail, squads, and settings subpages reachable from multiple places. The
hook is built to be reusable by them later, but they are not wired up here.
