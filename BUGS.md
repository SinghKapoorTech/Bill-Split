# Bugs & Fixes

Source: Aakaash Kapoor feedback, 2026-05-12 → 2026-05-14

## Privacy / Visibility

- ~~**Draft bills visible to other people**~~ — Drafts should be private to the creator and not show up for other participants until finalized/shared. **Fixed**.

## Mobile UX

- **Pinch-to-zoom on mobile** — Users can accidentally zoom the app in/out. Disable user-scalable zoom on the web view.
- **Numeric keyboard** — Wire `inputMode="decimal"` / `inputMode="numeric"` on all amount, price, tax, tip, and Venmo-ID fields so the right keyboard comes up on mobile.
- **Pull-to-refresh on history** — History list should support pull-down to refresh.
- **Scrolling on empty screens** — Screens with no content should not be scrollable (currently they bounce/scroll).

## Splitting

- ~~**"Split evenly" broken (Airbnb case)**~~ — **Fixed**: (1) `eventBalanceCalculator` had a splitEvenly shortcut that skipped the shared `calculatePersonTotals`, missing `otherFees` and prematurely rounding with `parseFloat(toFixed(2))` — now uses the shared function for both paths. (2) `useBillSplitter` sync effect depended on `billData.items.length` — if Airbnb dates changed (same item count, different IDs), assignments didn't re-sync; now uses item ID key. (3) SimpleTransactionWizard ReviewStep was missing `otherFees` in manually-constructed PersonTotal.

## Friends Tab

- ~~**"Manage Friends ID" should not be shown**~~ — Header changed from "Manage Friends" to "Friends". **Fixed**.
- ~~**Remove "Edit" for actual (real / linked) users**~~ — **Won't fix**: edit removed entirely for all friend types. Friends are saved contacts for quick-add; editing is unnecessary.
- ~~**Edit doesn't work at all in friends tab**~~ — **Won't fix**: edit button removed. Users can remove and re-add if details change.
- ~~**Distinguish manual vs. real users**~~ — **Won't fix**: balances already track all users regardless of friend status; the manual/app distinction is an implementation detail users don't need to see.

## Bills (potential feature)

- **Reject bills** — Add ability to reject a charge (say "no" to a bill someone added you to). Status: *maybe*, needs design.

## Landing Page

- ~~**Landing page color scheme not updated**~~ — Landing page still used old indigo/violet/cyan colors after Gold theme overhaul (commit b09dd6f). **Fixed** (commit f4775af): updated all 6 landing components, parallax background, and gradient blobs to warm gold/amber theme; replaced old SVG icon with divit-icon.png; fixed Use Case badge text visibility bug (className was a regular string instead of template literal).

---

## Triage Notes

| Severity | Items |
|---|---|
| High | ~~Draft bills visible to others~~, ~~Split-evenly broken~~, ~~Edit broken in friends tab~~ |
| Medium | Pinch zoom, numeric keyboard, ~~distinguish manual vs. real (won't fix)~~, ~~remove Edit for real users~~, ~~remove Manage Friends ID~~ |
| Low / UX polish | Pull-to-refresh on history, scroll on empty screens |
| Open question | Reject bills feature |
