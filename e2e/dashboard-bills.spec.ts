import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * Dashboard — Basic Structure
 *
 * Verifies the dashboard (Balances page) loads correctly after login,
 * and that the Bills page renders its section structure.
 *
 * Current UI: /dashboard renders an h1 "Balances" with a net-balance
 * subtitle and the friend balance preview card; bills live at /bills
 * under an h1 "Your Bills".
 */
test.describe('Dashboard', () => {
    test('shows the dashboard structure after login', async ({ page }) => {
        await loginAsTestUser(page);
        await page.waitForURL(/\/dashboard/, { timeout: 20000 });

        // Dismiss first-run onboarding BEFORE asserting on dashboard content.
        //
        // Every e2e run signs in as a brand-new auto-generated account, and
        // profileSync.ts:40 writes `hasSeenOnboarding: false`, so
        // Dashboard.tsx:22-25 opens OnboardingDialog. That dialog is a Radix
        // MODAL (OnboardingDialog.tsx:58 — `<Dialog open={open}>` with no
        // `modal={false}`), and a Radix modal marks everything outside it
        // aria-hidden. getByRole() queries the accessibility tree, so the
        // "Balances" heading below was genuinely reported as
        // "element(s) not found" — not hidden, not slow — until this is closed.
        // The app is correct here; the spec simply predated onboarding.
        // The dialog opens only once profile sync has written
        // `hasSeenOnboarding: false`, so it can appear LATE. The previous
        // `isVisible({ timeout: 10000 }).catch(() => false)` peek treated "not
        // there yet" as "not needed": on CI the dialog arrived after that
        // window, dismissal was skipped, and the assertion below then burned
        // its full 45s against an aria-hidden tree. That silent-swallow shape
        // is the same one that previously hid a broken Split Evenly selector.
        //
        // Wait for whichever genuinely arrives first, then act on it. No
        // swallowed failure, and no assumption about which one wins.
        // This dialog ALWAYS opens for an e2e run — every run is a brand-new
        // account and profileSync writes `hasSeenOnboarding: false`. What
        // varies is WHEN: it waits on that async write, so it can open after
        // the dashboard has already painted.
        //
        // So it must be WAITED FOR, never raced. Two earlier shapes both
        // failed, in opposite directions:
        //   - `isVisible({timeout:10000}).catch(() => false)` treated "not
        //     there yet" as "not needed", skipped dismissal, and the assertion
        //     below burned 45s against an aria-hidden tree.
        //   - racing it against the Balances heading let the heading win, then
        //     the dialog opened afterwards and aria-hid it anyway. Confirmed
        //     from the failure snapshot: the Balances heading was present in
        //     the DOM but carried no a11y ref while the dialog held focus.
        // Radix marks everything outside the modal aria-hidden, and getByRole
        // queries the accessibility tree, so this is a hard blocker either way.
        const skipOnboarding = page.getByRole('button', { name: 'Skip' });
        const balancesHeading = page.getByRole('heading', { name: 'Balances' });

        await skipOnboarding.waitFor({ state: 'visible', timeout: 30000 });
        await skipOnboarding.click();
        await expect(skipOnboarding).toBeHidden({ timeout: 10000 });

        // The "Balances" heading renders after isLoadingBalances resolves.
        // Use a long timeout for cold emulator.
        await expect(balancesHeading).toBeVisible({ timeout: 45000 });

        // Fresh test user has no balances → settled-up subtitle is deterministic
        await expect(page.getByText("You're all settled up")).toBeVisible({ timeout: 5000 });
    });

    test('shows the Bills page section after login', async ({ page }) => {
        await loginAsTestUser(page);
        await page.waitForURL(/\/dashboard/, { timeout: 15000 });

        // Bills moved from the dashboard to their own /bills page
        await page.goto('/bills');
        await expect(page.getByRole('heading', { name: 'Your Bills' })).toBeVisible({ timeout: 45000 });
    });
});
