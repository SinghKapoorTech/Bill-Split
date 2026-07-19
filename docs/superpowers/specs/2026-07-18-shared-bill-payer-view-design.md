# Shared Bill: Payer View & "Who Paid" — Design

**Date:** 2026-07-18
**Status:** Approved (design), pending implementation plan
**Scope:** Frontend only — `src/components/guest/GuestClaimView.tsx` + a small header helper. No backend, schema, or security-rule changes.

## Problem

When someone opens a bill they did **not** create (route `/shared/:sessionId` → `CollaborativeSessionView` → `GuestClaimView`), the view has two gaps:

1. **It never shows who created the bill or who paid.** The payer's name only appears buried inside the "Pay X on Venmo" button text; when that button is hidden the payer is invisible, and the creator is never shown at all.
2. **When the viewer _is_ the payer, the view is a confusing dead-end.** The "Pay on Venmo" button is correctly hidden (you can't pay yourself — guard at `GuestClaimView.tsx` `currentPerson.id !== payerPerson.id`), but nothing replaces it. The payer sees only their _own_ item share as "Total" with no indication they paid, how much they are owed, or any way to charge/settle the debtors.

### Root cause (verified against production data)

Reproduced with two real event bills in project `divit-6d217`, both viewed by the same user **Aman Singh** (`sV7ZAkoqKuXVe6OGgJCe1Ga9DhE3`):

- **`3zeWOycguZsKFMhzmPAs`** (Nachos): `paidById` = Aakaash. Aman owes Aakaash → Pay button shows. Working as intended.
- **`EnCgYHPMFUCdh9xKmBru`** (Aloha Melt): `ownerId` = Aakaash (creator), `paidById` = Aman (the viewer). Aman is the creditor, owed **$42.98** (Aakaash $23.14 + Anuja $19.84 per `processedBalances`). The Pay button is hidden by design, and there is no creditor UI to replace it.

Routing is decided purely by ownership — `EventDetailView.tsx`: `!isOwner ? /shared/:id : /bill/:id` — so a non-owner who was tagged as payer lands on the shared view without the owner's `/bill` editor.

## Goals

- On the shared view, always show **who created** and **who paid**.
- When the logged-in viewer is the payer (creditor), give them the **same per-person Charge + Mark-as-Settled** controls as the `/bill` last step (`ReviewStep` → `SplitSummary`).

## Non-Goals (YAGNI)

- No changes for the bill **owner** (they already use the `/bill` editor).
- No routing changes — the payer still reaches the bill via `/shared/`.
- No backend, Firestore schema, security-rule, or ledger-pipeline changes.
- No editable item re-assignment on the shared view for the payer (roster is read-only below).

## Approach

**Reuse `src/components/people/SplitSummary.tsx`** — the exact component `/bill`'s last step renders via `ReviewStep`. It already encodes the full rule set:

- `didIPay && !isMe` → **Charge** + **Settle** buttons (`venmoType = 'charge'`)
- `!didIPay && isThisPersonTheCreditor && !isMe` → **Pay** button (`venmoType = 'pay'`)
- Resolves the creditor from `paidById || ownerId`.

Rejected alternative: bespoke payer UI inside `GuestClaimView`. It duplicates `SplitSummary`'s logic and will drift from the `/bill` behavior. Reuse is DRY and keeps the two surfaces identical.

## Design

### 1. "Created by / Paid by" header

Added to the shared view for **all** viewers of a bill they don't own. Names resolved from `session.people` (fall back to `session.members`) by matching `ownerId` / `paidById` against person ids in both raw and `user-` prefixed forms (same matching already used by `payerPerson`).

- `ownerId !== creditorId` → **"Created by {ownerName} · {payerName} paid"**
- `ownerId === creditorId` → **"Created & paid by {ownerName}"** (covers the Nachos bill)

Where `creditorId = paidById || ownerId`, mirroring `SplitSummary`.

### 2. Body branches by viewer role

| Viewer                                                 | Body                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Logged-in creditor** (viewer's uid matches `paidById |                                                                                            | ownerId`) | Render `SplitSummary` with the full roster — each debtor row shows **Charge** + **Settle**. The existing read-only items list stays below. |
| **Debtor / anonymous guest** (unchanged)               | Keep today's single "your total" card + **Pay on Venmo** button and the item-claim badges. |

### 3. Wiring `SplitSummary` into `GuestClaimView`

- Compute `personTotals` with the already-imported `computeBillPersonTotals(session.billData, session.people, session.itemAssignments, splitEvenly)`.
- Compute `allItemsAssigned` (every item has ≥1 assignee).
- Pass `paidById={session.paidById}`, `ownerId={session.ownerId}`, `settledPersonIds={session.settledPersonIds}`, `billName={restaurantName}`.
- Wire `onMarkAsSettled` to `billService.updateBill(session.id, { settledPersonIds: (isSettled ? arrayUnion : arrayRemove)(personId) })` — identical to `ReviewStep.handleMarkAsSettled`, with the same success/error toasts.

## Guardrails / correctness

- **Anonymous guests must keep working.** `SplitSummary`'s Charge/Settle handlers require `user` and show a "sign in required" toast otherwise. Routing guests through it would _break_ their working anonymous Pay button. Therefore guests/debtors keep the current single-person card; only the logged-in creditor gets `SplitSummary`.
- **Write path is already permitted.** Only `settledPersonIds` is written, and only by the creditor. Verified in `firestore.rules`: a user in `participantIds` may perform a settlement-only update (`isSettlementUpdate()` = `onlyUpdating(['settledPersonIds','updatedAt','lastActivity'])`). No rule change needed.
- **Edge — not all items assigned.** `SplitSummary` renders an "assign all items" notice when `allItemsAssigned` is false. On the shared view the payer cannot assign items (that's the owner's job), so in that state the payer sees the notice instead of the roster. Acceptable for v1; the owner completes assignment from `/bill`.
- **Missing debtor `venmoId`.** Some `people` entries have no `venmoId` (e.g. Aloha Melt). The Charge deep link opens with an empty recipient and the `VenmoChargeDialog` lets the user fill it — same behavior as the `/bill` page today. No special handling.

## Testing

- **Unit (Vitest, `tests/`):** header-name resolution helper — owner≠payer, owner=payer, prefixed vs raw ids, name fallback to `members`.
- **Manual / E2E:** load `/shared/EnCgYHPMFUCdh9xKmBru` as Aman → see "Created by Aakaash · Aman paid", a roster with Charge + Settle for Aakaash and Anuja, Settle writes `settledPersonIds` and the row shows Settled. Load `/shared/3zeWOycguZsKFMhzmPAs` as Aman → Pay button still shows (debtor path unchanged). Load a shared bill as an anonymous guest → Pay button still works.

## Files touched

- `src/components/guest/GuestClaimView.tsx` — header + role branch + `SplitSummary` wiring.
- New small helper (e.g. `src/utils/billParticipants.ts` or inline) for creator/payer name resolution, unit-tested.
- `tests/` — unit test for the name-resolution helper.
