import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createEventWithMembers, createBillInEvent } from './helpers/event';

test.describe('Bill-Level Settlement', () => {
  /**
   * RESOLVED 2026-09-08 — UN-QUARANTINED. Everything below is kept as the
   * investigation record; it is HISTORY, not current state.
   *
   * The remaining flake was never in this spec or in the settle step. It was
   * the LOGIN: `signInWithPopup` loads gapi from https://apis.google.com to
   * carry the popup result back, so the public internet sat on the critical
   * path of every test. When that script aborted (net::ERR_ABORTED) no session
   * was ever created and the spec failed downstream on a logged-out page.
   * Correlation in CI run 34180371036 was 6/6. `e2e/helpers/auth.ts` now signs
   * in with email/password against the Auth emulator — no popup, no gapi.
   *
   * Evidence for un-quarantining: 12/12 passes each at `--repeat-each=12`,
   * `--retries=0`, at 1-min load 4-10. Against the previously measured ~25%
   * failure rate that is a ~3% fluke, so this is a real fix, not a lucky run.
   *
   * ORIGINAL QUARANTINE RECORD FOLLOWS
   * ----------------------------------
   *
   * QUARANTINED (flaky) — 2026-09-07. NOT rotted. Read this before re-enabling.
   *
   * THIS TEST WAS RIGHT. It caught a REAL bug, and quarantining it earlier in the
   * day masked one. The history matters:
   *
   * 1. FIXED — ledger bail on draft bills. `validateBillAmounts(after.billData)`
   *    in ledgerProcessor Stage 1 returns an error for MISSING billData, and every
   *    bill starts as a draft with none. The bail therefore fired on every early
   *    wizard write and killed the ledger pipeline. Proven by controlled
   *    experiment, both directions: with the unscoped bail these tests fail 3/3
   *    deterministically; with it scoped they pass 3/3 in ~5s. Shipped in
   *    0e7915a and deployed to prod.
   *
   * 2. OPEN — people-loss race. This is why the test is still flaky, and it is a
   *    USER-VISIBLE BUG, not a test problem: add a person to a bill and they can
   *    silently vanish, with no error.
   *      - AIScanView.tsx:128 re-derives `people` from EVERY activeSession
   *        snapshot, and the effect is keyed on user/profile identity too.
   *      - BillWizard.tsx mirrors that into local state.
   *      - The three add paths persisted `[...people, newPerson]` from the RENDER
   *        CLOSURE after an await, so a snapshot landing mid-await caused the
   *        write to re-persist the pre-clobber array — dropping an earlier guest.
   *        This is why adding two guests loses the FIRST one.
   *      - canProceedFromStep(1) has already accepted people.length > 1 by then,
   *        so the wizard advances and Review shows the owner holding the full
   *        total. That is the "contradiction" that stalled the first investigation.
   *
   * PARTIAL FIX ALREADY LANDED in BillWizard.tsx: `peopleRef` (persist current
   * state, never the closure) and `pendingPersonIdsRef` (a snapshot may not drop
   * additions whose write is in flight), both routed through
   * `persistPeopleAddition`. That removes a defect verified by inspection, but
   * REVERTING IT CHANGED NOTHING for these tests — so it is NOT proven to fix the
   * flake. Do not assume the race is closed.
   *
   * DO NOT REDO — already ruled out:
   *   - AddPersonDialog.tsx:84 `showEmailField` gate: only ManageFriendsCard.tsx:67
   *     sets it, so it is false here.
   *   - A custom step validator: BillWizard passes none to useBillWizard.
   *   - Item count: splitting 1 item into 2 with the same total still passed.
   *   - Guest count: two 1-guest tests fail while another 1-guest test passes.
   *
   * ALSO NOTE: this suite is sensitive to CPU contention AND cold emulator start.
   * A full run while a build/test/review is running, or against a just-started
   * emulator, produces failures that vanish when re-run idle and warm. Measure on
   * an idle machine before concluding anything.
   *
   * 2026-09-07 (session 3) — TWO MORE REAL DEFECTS FIXED. NEITHER CLOSED THIS FLAKE.
   * Do not re-attempt either; both are already in the tree with unit tests:
   *   a) usePeopleManager wrote state from the render closure captured BEFORE
   *      `await resolveShadowUserByName`, clobbering a snapshot that landed
   *      mid-await. Now functional updates.
   *      Test: tests/react/usePeopleManager.race.test.tsx
   *   b) BillWizard guarded the persist with a bare `if (id)` and no else, so an
   *      add made before the JIT draft existed was DISCARDED silently. Now queued
   *      and flushed via usePeopleAdditionQueue.
   *      Test: tests/react/usePeopleAdditionQueue.test.tsx
   * Controlled A/B, 12 runs per side at matched load (~7.3): baseline 3 failed /
   * 9 passed; with both fixes 5 failed / 7 passed. No improvement — within noise,
   * but enough to say the remaining flake is NOT either of those defects.
   *
   * PROVEN about the failure, by direct observation (do not re-derive):
   *   - The loss is ON WRITE, not on render. Emulator query after a failing run:
   *     the bill doc itself held `people: 1` (owner only) with total $90. So
   *     "the test is rotted" is dead as a hypothesis, permanently.
   *   - In one captured failure `persistPeopleAddition` was never called at all.
   *     That was defect (b), now fixed.
   *   - These specs ALSO fail from pure CPU starvation with the data fully
   *     CORRECT. Confirmed by instrumenting every people write: under 10 busy
   *     cores the doc read ["Owner","Charlie"] throughout and the test still
   *     failed on getByText('Charlie') at Review. Measure at 1-min load < 3 or
   *     conclude nothing.
   *
   * Next step: instrument the SETTLE half — all three now fail at or after the
   * settle step, not at the add step — and get a clean idle measurement first.
   *
   * 2026-10-08 — THE PEOPLE-LOSS BUG IS CONFIRMED AND DETERMINISTIC HERE (5/5).
   * This spec is NOT flaky on this machine; it is correct and the product is
   * wrong. Do not quarantine it and do not raise its timeouts.
   *
   * The failure point MOVED, which is why it reads as a new flake: line 130
   * `getByText('Charlie')` PASSES, then line 131 `text=$45.00` fails. The
   * historical starvation signature was the opposite (failing ON 'Charlie').
   * Starvation delays everything; it does not drop one string while the
   * assertion above it resolves.
   *
   * PROOF it is people-loss and not assignment-loss, from the captured
   * `test-results/settle-bill-<run>/error-context.md` page snapshot: the Split
   * Summary holds exactly ONE row — owner "Test (Created, Paid) Me — $90.00".
   * Charlie is absent entirely. He cannot be merely unassigned, because
   * `calculatePersonTotals` (shared/calculations.ts:42) maps over `people` and
   * emits a row for EVERY person including unassigned ones at 0, and
   * SplitSummary.tsx:143 renders all of them with no zero-total filter. An
   * assignment-only loss would show Charlie at $0.00. So `people` itself lacks
   * him — matching the earlier emulator observation of `people: 1` server-side.
   *
   * A 20s timeout was tried on the three ADD-half assertions (the Split Summary
   * checks above) and REVERTED: they failed identically at 20s. Waiting longer
   * for a guest who was deleted is not a fix, and shipping it would have buried
   * this bug behind a slower test. NOTE: the SETTLE-half assertions near the end
   * of this test do carry `timeout: 20_000`, which is not the same thing and not
   * a contradiction -- those wait on the ledger pipeline actually quiescing,
   * which is genuinely slow rather than never-arriving.
   *
   * RULED OUT as the trigger (do not re-check): `persistPeopleAddition`
   * (BillWizard.tsx:398) builds from `peopleRef.current` via
   * `mergePeopleAdditions`, so it INCLUDES Charlie; `handleRemovePerson`
   * (BillWizard.tsx:491) is the only other `people:` write and this test never
   * removes anyone; the sync effect (BillWizard.tsx:185-199) is sound.
   *
   * STRUCTURAL WEAKNESS worth knowing: `reconcilePeopleWithServer`
   * (src/utils/peopleMerge.ts) protects an id only until the server FIRST
   * confirms it — `stillInFlight` drops confirmed ids — so any LATER snapshot
   * missing that person is adopted verbatim with no defence. That is the
   * mechanism by which a bad write becomes visible loss. Do not harden it
   * before the write bug is found, or it will mask wrong server state.
   *
   * ROOT CAUSE FOUND AND FIXED 2026-10-08 (the hypothesis that stood here --
   * an "initialization write" -- was WRONG; do not chase it again).
   *
   * It was `useBillSession.executeSave`
   * (src/components/bill-wizard/hooks/useBillSession.ts). The auto-save payload
   * included `people` and `status` under `isDraft`, which is evaluated when the
   * payload is CAPTURED. `performSaveAndSwap` then awaits
   * `pendingDraftCreation.current` and writes arbitrarily later, and `people`
   * is a whole-array REPLACE -- so a payload captured while the bill was still
   * a draft committed ~1.3s later, after Charlie had been added, and erased
   * him. `ledgerProcessor` then reversed his $45.
   *
   * It never showed up in a grep for `people:` in BillWizard.tsx because the
   * write reaches Firestore via saveSession -> useBills.ts -> updateBill, which
   * is why four prior sessions missed it.
   *
   * Fixed in two layers, each with its own killing test:
   *   1. the payload re-decides `people`/`status` at WRITE time from
   *      `actualTargetId`  -> tests/react/useBillSession.peopleLoss.test.tsx
   *   2. `billService.updateBill` refuses a `people` write that drops a person
   *      without `allowPeopleRemoval` -> tests/billServicePeopleGuard.test.ts
   *
   * Those two run in CI in ~1s. THIS spec is corroboration, not the regression
   * test -- a 90s browser run cannot pin which write lost the guest.
   */
  test('settling a person on a bill shows settled badge and updates event balances', async ({ page }) => {
    // ── Setup: Login and create event ──
    await loginAsTestUser(page);

    const eventUrl = await createEventWithMembers(
      page,
      'Vegas Trip',
      'Annual Vegas trip',
      ['friend@example.com']
    );

    // ── Create a bill within the event ──
    await createBillInEvent(page, [
      { name: 'Dinner', price: '60.00' },
      { name: 'Drinks', price: '30.00' },
    ], ['Charlie']);

    // ── Verify Review step shows correct per-person totals ──
    // Total is $90, split evenly among owner + Charlie = $45 each
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Charlie').first()).toBeVisible();

    // Each person should owe $45.00
    const totalElements = page.locator('text=$45.00');
    await expect(totalElements.first()).toBeVisible();

    // ── Mark Charlie as settled ──
    // Find Charlie's card and click the compact "Settle" button
    const charlieCard = page.locator('.rounded-xl').filter({ hasText: 'Charlie' }).first();
    const settleButton = charlieCard.getByRole('button', { name: 'Settle' });
    await settleButton.scrollIntoViewIfNeeded();
    await settleButton.click();

    // Verify the green "Settled" badge appears on Charlie's card
    await expect(charlieCard.getByText('Settled')).toBeVisible({ timeout: 5000 });

    // ── Navigate back to event detail page ──
    await page.goto(eventUrl);

    // Wait for the page and ledger pipeline to process
    // The ledger processor (Cloud Function) updates event_balances after settledPersonIds changes
    await expect(page.getByText('Vegas Trip').first()).toBeVisible();
    // Role-scoped, NOT getByText: getByText does case-insensitive SUBSTRING
    // matching, so 'Balances' also matched the "other balances" toggle
    // (EventDetailView.tsx:202) alongside the <h2> heading — 2 elements, strict
    // mode violation. The heading is what this assertion means.
    await expect(
      page.getByRole('heading', { name: 'Balances' }),
    ).toBeVisible({ timeout: 10000 });

    // ── The point of THIS spec: the settlement reached the event ledger ──
    // What was here before was `waitForTimeout(3000)` followed by
    // `expect(getByText('Bills')).toBeVisible()` -- a hard sleep and then an
    // assertion that cannot fail, on a test whose name promises it checks
    // event balances. It never checked them.
    //
    // Charlie is a SHADOW USER with a real uid (usePeopleManager ->
    // userService.resolveShadowUserByName), not a `person-`/`guest-` id, so he
    // survives the prefix filters in extractParticipantIds and in
    // ledgerProcessor's resolveEligibleFriends -- which is why an
    // event_balances pair doc exists for owner<->Charlie at all. Settling him
    // zeroes it (shared/ledgerCalculations.ts: settledPersonIds -> 0), and
    // useEventLedger drops pairs under |0.01|.
    //
    // The $90 assertion is a PRECONDITION, not decoration: `ledgerLoading`
    // clears as soon as the event_balances snapshot returns, but `eventBills`
    // is a separate subscription. On a half-loaded page optimizedDebts is []
    // and the "all settled up" copy renders even if nothing was settled.
    // Pinning the bill total first closes that window, so the assertion below
    // is about the settlement rather than about load order.
    await expect(page.getByText('$90.00')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('balance-list-row')).toHaveCount(0, { timeout: 20_000 });
    await expect(
      page.getByText('All settled up! No outstanding balances.'),
    ).toBeVisible();
  });
});
