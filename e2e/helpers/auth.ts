import { Page } from '@playwright/test';

/**
 * Signs in via the Firebase Auth Emulator popup flow.
 * When the app is connected to the Auth Emulator, clicking "Sign in with Google"
 * opens the emulator's auth popup where we can create/select a test account.
 *
 * Must be called when the page is on the /auth route.
 */
export async function signInWithEmulator(page: Page) {
  // Start listening for the popup BEFORE clicking (avoids race with slowMo)
  const popupPromise = page.waitForEvent('popup');

  // Click the Google sign-in button
  const googleButton = page.getByRole('button', { name: 'Sign in with Google' });
  await googleButton.click();

  // Wait for the emulator auth popup
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');

  // In the emulator popup: click "Add new account" then "Auto-generate" then "Sign in"
  const addAccountBtn = popup.getByRole('button', { name: /add new account/i });
  await addAccountBtn.waitFor({ state: 'visible', timeout: 10000 });
  await addAccountBtn.click();

  // Auto-generate user credentials
  const autoGenBtn = popup.getByRole('button', { name: /auto-generate/i });
  await autoGenBtn.waitFor({ state: 'visible', timeout: 10000 });
  await autoGenBtn.click();

  // Click "Sign in with Google.com"
  const signInBtn = popup.getByRole('button', { name: /sign in/i });
  await signInBtn.waitFor({ state: 'visible', timeout: 10000 });
  await signInBtn.click();

  // Wait for the popup to close and the app to redirect to dashboard
  // Extra time needed when running with slowMo
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
}

/**
 * Navigates to the auth page and signs in using the emulator.
 * Use this as the entry point for authenticated test flows.
 */
export async function loginAsTestUser(page: Page) {
  await page.goto('/auth');
  await signInWithEmulator(page);
}
