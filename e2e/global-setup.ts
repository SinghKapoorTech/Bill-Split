import { execSync } from 'child_process';
import { chromium } from '@playwright/test';

function isEmulatorRunning(): boolean {
  try {
    execSync('curl -s http://localhost:8081', { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Completes the Firebase Auth Emulator popup flow.
 */
async function completeEmulatorPopup(popup: import('@playwright/test').Page) {
  await popup.waitForLoadState('domcontentloaded');

  const addAccountBtn = popup.getByRole('button', { name: /add new account/i });
  await addAccountBtn.waitFor({ state: 'visible', timeout: 15000 });
  await addAccountBtn.click();

  const autoGenBtn = popup.getByRole('button', { name: /auto-generate/i });
  await autoGenBtn.waitFor({ state: 'visible', timeout: 10000 });
  await autoGenBtn.click();

  const signInBtn = popup.getByRole('button', { name: /sign in/i });
  await signInBtn.waitFor({ state: 'visible', timeout: 10000 });
  await signInBtn.click();
}

async function globalSetup() {
  // ── Step 1: Start emulators if not already running ──
  if (isEmulatorRunning()) {
    console.log('Firebase emulators already running, reusing...');
  } else {
    console.log('Starting Firebase emulators...');
    const env = { ...process.env, PATH: `/opt/homebrew/opt/openjdk/bin:${process.env.PATH}` };
    execSync(
      'firebase emulators:start --only auth,firestore &',
      { cwd: process.cwd(), env, stdio: 'ignore', shell: '/bin/zsh' }
    );

    const startTime = Date.now();
    while (Date.now() - startTime < 30000) {
      if (isEmulatorRunning()) {
        console.log('Firebase emulators ready!');
        break;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // ── Step 2: Warm up the emulator with a login flow ──
  // This pre-warms the Firebase Auth emulator and Firestore connections so
  // the first actual test doesn't bear the full cold-start cost (~20-40s).
  console.log('Warming up emulator with a test login...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto('http://localhost:8080/auth');
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Sign in with Google' }).click();
    const popup = await popupPromise;
    await completeEmulatorPopup(popup);

    try {
      await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    } catch {
      await page.goto('http://localhost:8080/dashboard');
    }
    console.log('Emulator warm-up complete. Tests will be faster.');
  } catch (e) {
    // Non-fatal: warm-up failed but tests can still run with cold start
    console.warn('Warm-up login failed (non-fatal):', e);
  } finally {
    await browser.close();
  }
}

export default globalSetup;
