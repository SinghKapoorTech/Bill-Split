import { Page } from '@playwright/test';

/**
 * Completes the Firebase Auth Emulator popup flow.
 * Clicks through: Add new account → Auto-generate → Sign in.
 */
async function completeEmulatorPopup(popup: Page) {
  await popup.waitForLoadState('domcontentloaded');

  const addAccountBtn = popup.getByRole('button', { name: /add new account/i });
  await addAccountBtn.waitFor({ state: 'visible', timeout: 10000 });
  await addAccountBtn.click();

  const autoGenBtn = popup.getByRole('button', { name: /auto-generate/i });
  await autoGenBtn.waitFor({ state: 'visible', timeout: 10000 });
  await autoGenBtn.click();

  const signInBtn = popup.getByRole('button', { name: /sign in/i });
  await signInBtn.waitFor({ state: 'visible', timeout: 10000 });
  await signInBtn.click();
}

/**
 * Signs in via the Firebase Auth Emulator popup flow and navigates to dashboard.
 * The emulator is pre-warmed by global-setup, so this runs in ~2-3s after the
 * first test (which still bears a cold-start the first time it runs).
 */
export async function loginAsTestUser(page: Page) {
  await page.goto('/auth');

  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Sign in with Google' }).click();
  const popup = await popupPromise;
  await completeEmulatorPopup(popup);

  try {
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  } catch {
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  }
}
