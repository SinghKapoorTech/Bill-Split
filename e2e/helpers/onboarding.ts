import { Page, expect } from '@playwright/test';

/**
 * Dismiss first-run onboarding BEFORE asserting on dashboard content.
 *
 * Call it right after `loginAsTestUser` (a brand-new account), before any
 * assertion or action on /dashboard. It waits for the dialog, so calling it
 * for an account that has already seen onboarding fails after 30s.
 *
 * Every e2e run signs in as a brand-new auto-generated account, and
 * profileSync.ts:62 writes `hasSeenOnboarding: false`, so
 * Dashboard.tsx:25-29 opens OnboardingDialog. That dialog is a Radix
 * MODAL (OnboardingDialog.tsx:58 — `<Dialog open={open}>` with no
 * `modal={false}`), and a Radix modal marks everything outside it
 * aria-hidden. getByRole() queries the accessibility tree, so the
 * "Balances" heading the caller asserts next was genuinely reported as
 * "element(s) not found" — not hidden, not slow — until this is closed.
 * The app is correct here; the spec simply predated onboarding.
 * The dialog opens only once profile sync has written
 * `hasSeenOnboarding: false`, so it can appear LATE. The previous
 * `isVisible({ timeout: 10000 }).catch(() => false)` peek treated "not
 * there yet" as "not needed": on CI the dialog arrived after that
 * window, dismissal was skipped, and the caller's next assertion then burned
 * its full 45s against an aria-hidden tree. That silent-swallow shape
 * is the same one that previously hid a broken Split Evenly selector.
 *
 * Wait for whichever genuinely arrives first, then act on it. No
 * swallowed failure, and no assumption about which one wins.
 * This dialog ALWAYS opens for an e2e run — every run is a brand-new
 * account and profileSync writes `hasSeenOnboarding: false`. What
 * varies is WHEN: it waits on that async write, so it can open after
 * the dashboard has already painted.
 *
 * So it must be WAITED FOR, never raced. Two earlier shapes both
 * failed, in opposite directions:
 *   - `isVisible({timeout:10000}).catch(() => false)` treated "not
 *     there yet" as "not needed", skipped dismissal, and the next assertion
 *     burned 45s against an aria-hidden tree.
 *   - racing it against the Balances heading let the heading win, then
 *     the dialog opened afterwards and aria-hid it anyway. Confirmed
 *     from the failure snapshot: the Balances heading was present in
 *     the DOM but carried no a11y ref while the dialog held focus.
 * Radix marks everything outside the modal aria-hidden, and getByRole
 * queries the accessibility tree, so this is a hard blocker either way.
 */
export async function dismissOnboarding(page: Page) {
  const skipOnboarding = page.getByRole('button', { name: 'Skip' });

  await skipOnboarding.waitFor({ state: 'visible', timeout: 30000 });
  await skipOnboarding.click();
  await expect(skipOnboarding).toBeHidden({ timeout: 10000 });
}
