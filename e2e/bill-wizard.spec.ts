import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createEventWithMembers, createBillInEvent } from './helpers/event';

/**
 * Bill Wizard — Full Flow
 *
 * Creates an event bill end-to-end:
 *   Bill Entry → People → Assignment → Review
 *
 * Using an event bill avoids the dashboard `isLoadingSessions` spinner entirely.
 * The event guarantees a clean starting state on every test run.
 */
test.describe('Bill Wizard — Full Flow', () => {
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
     */
    test('creates a bill with items, guests, and assignment via the full wizard', async ({ page }) => {
        await loginAsTestUser(page);

        // Create a minimal event to host our bill
        await createEventWithMembers(page, 'Dinner Night', 'Test dinner', ['test@example.com']);

        // createBillInEvent goes end-to-end: Entry → People → Assignment → Review
        await createBillInEvent(page, [
            { name: 'Burger', price: '15.00' },
            { name: 'Fries', price: '6.00' },
        ], ['Alice', 'Bob']);

        // ── Review Step — verify people and totals ──
        // Total $21 split among owner + Alice + Bob = $7 each
        await expect(page.getByText('Split Summary')).toBeVisible();
        await expect(page.getByText('Alice').first()).toBeVisible();
        await expect(page.getByText('Bob').first()).toBeVisible();

        // Each person owes $7.00
        await expect(page.locator('text=$7.00').first()).toBeVisible();
    });
});
