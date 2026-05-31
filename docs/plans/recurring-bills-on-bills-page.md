# Plan: Show recurring bills on the Bills page; make Settings manage-only

## Problem

1. **Recurring bills don't show up on the bills page.** Recurring-bill *templates* live in the `recurring_bills` collection and are only surfaced in **Settings → Recurring**. The Bills page (`BillsView.tsx`) only lists concrete bills from the `bills` collection, so a user who sets up a recurring bill never sees it where they expect — on "Your Bills".
2. **Settings does double duty.** The Settings → Recurring tab both *creates* recurring bills (a `+` button and an empty-state "Create Recurring Bill" button) and *manages* them. The task asks Settings to only let the user **control the settings of recurring bills that are already set up** — i.e. management only, no creation.

## Decisions (confirmed with user)

- **Bills page display:** recurring bills appear **inline, mixed** with regular bills (tagged with a recurring icon), **view + tap-to-open** only — no pause/edit/delete controls there. Tapping opens `/recurring/:id`.
- **Management stays in Settings:** pause/resume/edit/delete remain in Settings → Recurring. Only the **create** affordance is removed from Settings (creation already lives in the Bills page "+" → Create New → "Recurring Bill" dialog).

## Acceptance criteria

- Setting up a recurring bill makes it visible in the "Your Bills" list, mixed in with regular bills, marked as recurring.
- Tapping a recurring bill on the Bills page opens its detail/edit page (`/recurring/:id`).
- Completed recurring bills are hidden on the Bills page (consistent with Settings).
- The Bills page recurring rows show **no** management buttons (no delete/pause).
- Settings → Recurring no longer offers any way to create a recurring bill (no `+`, no empty-state create button), but still lists existing ones with pause/resume/edit/delete.
- Empty states are correct: Bills page shows "No bills yet" only when there are neither regular nor recurring bills; Settings empty state points the user to the Bills page to create one.
- `npm run build`, `npm run lint`, typecheck pass.

## Steps (file-level, in order)

### 1. Create `src/components/dashboard/MobileRecurringBillCard.tsx`
A compact, view-only card mirroring `MobileBillCard`'s look (72px glass-card row) so it sits naturally inline with regular bills.
- Props: `{ bill: RecurringBill; onView: (id: string) => void }`.
- Avatar: `Repeat` icon, `bg-success/10 text-success` (matches the "Recurring Bill" option color in `CreateOptionsDialog`).
- Title: `bill.title`; status pill: Active/Paused using `statusStyles` (`settled`/`partial` colors), matching `RecurringBillList`.
- Subtitle: `formatCurrency(bill.amount)` + frequency word (Weekly/Biweekly/Monthly).
- Whole row clickable → `onView(bill.id)`; keyboard accessible (`role="button"`, Enter handler), like `MobileBillCard`.
- No action buttons.

### 2. Modify `src/pages/BillsView.tsx`
- Import `useRecurringBills`, `MobileRecurringBillCard`, and `RecurringBill`.
- Pull `{ recurringBills, isLoading: isLoadingRecurring }` from `useRecurringBills()`.
- `const visibleRecurring = recurringBills.filter(b => b.status !== 'completed')`.
- Build a unified, date-sorted feed so they interleave:
  ```ts
  const feed = [
    ...allBills.map(b => ({ kind: 'bill' as const, data: b, sortKey: b.updatedAt?.toMillis?.() ?? 0 })),
    ...visibleRecurring.map(r => ({ kind: 'recurring' as const, data: r, sortKey: r.updatedAt?.toMillis?.() ?? 0 })),
  ].sort((a, b) => b.sortKey - a.sortKey);
  ```
- Render `feed` instead of `allBills`: `kind === 'recurring'` → `MobileRecurringBillCard` (onView → `navigate('/recurring/' + id)`); else existing `MobileBillCard`.
- Empty state: show the "No bills yet" card only when `feed.length === 0` (i.e. both empty) **and** not still loading recurring (`!isLoadingRecurring`) to avoid a flash.
- Leave the stale-empty-bill cleanup effect untouched (it only concerns `bills`, not recurring templates).

### 3. Modify `src/components/settings/RecurringBillsSettingsCard.tsx`
- Remove the header `+` create `Button` (and the now-unused `Plus` import).
- Remove the empty-state "Create Recurring Bill" button; reword the empty-state copy to direct the user to the Bills page (e.g. "Create one from the **Bills** page using the **+** button.").
- Keep the list, pause/resume, edit (`/recurring/:id`), and delete intact.

## Verification

- `npm run lint`, typecheck (`tsc`/build), `npm run build`.
- Playwright (emulators): set up a recurring bill via `/recurring/new`, then assert it appears in "Your Bills" tagged recurring and that tapping it routes to `/recurring/:id`; assert Settings → Recurring has no create button. Existing `e2e/recurring-bill.spec.ts` (direct `/recurring/new`) still passes.
- Reviewer subagent on the diff vs. this plan.

## Out of scope / notes

- No changes to the Cloud Function, Firestore rules/indexes, or the recurring data model.
- No new desktop-specific card — `BillsView` uses one card style across viewports today.
