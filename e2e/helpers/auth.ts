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
 * Signs in via the Firebase Auth Emulator popup flow.
 * When the app is connected to the Auth Emulator, clicking "Sign in with Google"
 * opens the emulator's auth popup where we can create/select a test account.
 *
 * Includes a retry mechanism: if the popup flow doesn't redirect to /dashboard
 * within 15s, navigates to /dashboard directly (auth state is already set).
 *
 * Must be called when the page is on the /auth route.
 */
export async function signInWithEmulator(page: Page) {
  // Start listening for the popup BEFORE clicking (avoids race with slowMo)
  const popupPromise = page.waitForEvent('popup');

  // Click the Google sign-in button
  const googleButton = page.getByRole('button', { name: 'Sign in with Google' });
  await googleButton.click();

  // Wait for the emulator auth popup and complete the flow
  const popup = await popupPromise;
  await completeEmulatorPopup(popup);

  // Wait for redirect to dashboard — if it doesn't happen, the auth state
  // is likely already set so we can navigate directly
  try {
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  } catch {
    // Auth state is set but redirect didn't fire — navigate manually
    await page.goto('/dashboard');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
  }
}

/**
 * Navigates to the auth page and signs in using the emulator.
 * Use this as the entry point for authenticated test flows.
 */
export async function loginAsTestUser(page: Page) {
  await page.goto('/auth');
  await signInWithEmulator(page);
}
