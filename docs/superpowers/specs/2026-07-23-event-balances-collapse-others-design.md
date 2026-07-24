# Event page: collapse "other people's" balances behind an arrow

**Date:** 2026-07-23
**Surface:** `src/pages/EventDetailView.tsx` → `EventBalancesSection`

## Problem

On an event's detail page the Balances section renders **every** debt in the
event, including balances strictly between two other people (e.g. _Alice owes
Bob_, where the current user is neither party). This buries the balances the
user actually cares about — the ones where they owe someone or someone owes
them.

## Goal

By default, show only the balances that involve the current user. Hide the rest
behind an expand/collapse chevron so users can still see the full event ledger
on demand.

## Behavior

- **Visible by default:** debts where the current user is the payer or the
  payee (`direction !== 'neutral'`).
- **Hidden behind the arrow:** debts between two other people
  (`direction === 'neutral'`).
- The collapsible section starts **collapsed** on page open (no persistence).
- Toggle affordance: a chevron button below the visible list.
  - Collapsed: `▼ Show N other balance(s)`
  - Expanded: `▲ Hide other balances`
- Chevron uses the existing pattern (`ChevronDown` from `lucide-react` +
  `transition-transform rotate-180`), matching `SplitSummary.tsx`. No shadcn
  Accordion/Collapsible dependency added.

### Note on "settled up = zero" rows

`optimizedDebts` (from `useEventLedger`) only ever contains **non-zero** debts —
settled pairs are removed by `simplifyDebts` cycle elimination. So there are no
zero-balance rows to hide; the only thing moving behind the arrow is
**balances between other people**.

## Empty states

| My balances | Other balances | Render                                                                     |
| ----------- | -------------- | -------------------------------------------------------------------------- |
| none        | none           | `"All settled up! No outstanding balances."` (unchanged)                   |
| none        | some           | `"You're all settled up in this event."` + the toggle revealing the others |
| some        | none           | just my balance rows (no toggle)                                           |
| some        | some           | my balance rows + toggle                                                   |

## Implementation notes

- Change is contained to `EventBalancesSection` inside
  `src/pages/EventDetailView.tsx`.
- Partition `optimizedDebts` into `myDebts` / `otherDebts` by whether
  `user.uid` is in `[debt.fromUserId, debt.toUserId]`.
- Reuse the existing `renderDebtRow(debt, idx)` for both groups — neutral rows
  already render without a Pay/Settle action, so they need no changes.
- Add a single `useState` for the expanded flag.

## Out of scope

- No change to `useEventLedger`, `renderDebtRow`, or `BalanceListRow`.
- No persistence of expand/collapse state.
- No change to the global (non-event) balances surfaces.

## Verification

- `npm run typecheck` and `npm run build` pass.
- Manual QA checklist (event detail page):
  1. Event where you owe/are owed **and** others owe each other → only your
     rows show; arrow reveals the others; up-arrow hides them again.
  2. Event where only others owe each other → "all settled up in this event"
     message + arrow reveals their balances.
  3. Fully settled event → "All settled up!" message, no arrow.
