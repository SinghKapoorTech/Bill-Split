import { execSync } from 'child_process';
import { chromium } from '@playwright/test';

/**
 * Both emulators the suite needs must be up, not just Firestore.
 *
 * Probing 8081 alone meant a firestore-only emulator left running from another
 * task counted as "ready", so the setup below was skipped and the FUNCTIONS
 * emulator never started — reintroducing exactly the failure this check exists
 * to prevent, and only when someone happened to have an emulator open.
 */
function isEmulatorRunning(): boolean {
  const up = (url: string) => {
    try {
      execSync(`curl -s ${url}`, { timeout: 2000 });
      return true;
    } catch {
      return false;
    }
  };
  // 8081 = firestore, 5001 = functions (callables: createEvent, createBill, …)
  return up('http://localhost:8081') && up('http://localhost:5001');
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

    // FUNCTIONS IS REQUIRED, not optional. Event creation and unarchiving are
    // Cloud Function callables (`createEvent` / `unarchiveEvent`) — firestore.rules
    // denies the direct client writes they replaced — so without the functions
    // emulator every event-creation test fails with an opaque
    // `page.waitForURL` timeout rather than anything naming the real cause.
    // `createBill` and `analyzeBill` are callables too.
    //
    // The emulator serves functions from functions/lib, so the build must be
    // current; a stale lib silently runs yesterday's code.
    execSync('npm --prefix functions run build', {
      cwd: process.cwd(),
      env,
      stdio: 'ignore',
      shell: '/bin/zsh',
    });

    execSync(
      'firebase emulators:start --only auth,firestore,functions &',
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
    const popup = await Promise.race([
      page.waitForEvent('popup', { timeout: 15000 }),
      page.getByRole('button', { name: 'Sign in with Google' }).click().then(() =>
        page.waitForEvent('popup', { timeout: 15000 })
      ),
    ]).catch(() => null);

    if (popup) {
      await completeEmulatorPopup(popup);
      try {
        await page.waitForURL(/\/dashboard/, { timeout: 20000 });
      } catch {
        await page.goto('http://localhost:8080/dashboard');
      }
      console.log('Emulator warm-up complete. Tests will be faster.');
    } else {
      console.warn('Warm-up: popup did not appear (non-fatal, tests will cold-start).');
    }
  } catch (e) {
    console.warn('Warm-up login failed (non-fatal):', (e as Error).message);
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
