import { Page } from '@playwright/test';

/**
 * Signs in via the Firebase Auth Emulator popup flow.
 * When the app is connected to the Auth Emulator, clicking "Sign in with Google"
 * opens the emulator's auth popup where we can create/select a test account.
 *
 * Must be called when the page is on the /auth route.
 */
export async function signInWithEmulator(page: Page) {
  // Click the Google sign-in button
  const googleButton = page.getByRole('button', { name: 'Sign in with Google' });
  await googleButton.click();

  // Wait for the emulator auth popup
  const popup = await page.waitForEvent('popup');
  await popup.waitForLoadState('networkidle');

  // In the emulator popup: click "Add new account" then "Auto-generate" then "Sign in"
  await popup.getByRole('button', { name: /add new account/i }).click();
  await popup.waitForLoadState('networkidle');

  // Auto-generate user credentials
  await popup.getByRole('button', { name: /auto-generate/i }).click();

  // Click "Sign in with Google.com"
  await popup.getByRole('button', { name: /sign in/i }).click();

  // Wait for the popup to close and the app to redirect to dashboard
  await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

/**
 * Navigates to the auth page and signs in using the emulator.
 * Use this as the entry point for authenticated test flows.
 */
export async function loginAsTestUser(page: Page) {
  await page.goto('/auth');
  await signInWithEmulator(page);
}
