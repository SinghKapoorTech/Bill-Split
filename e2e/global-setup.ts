import { execSync } from 'child_process';
import { chromium } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

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

async function globalSetup() {
  // ── Step 1: Start emulators if not already running ──
  if (isEmulatorRunning()) {
    console.log('Firebase emulators already running, reusing...');
  } else {
    console.log('Starting Firebase emulators...');
    // Homebrew's JDK, for macOS. On Linux CI the directory simply does not exist
    // and prepending it is a no-op — the JDK there comes from actions/setup-java,
    // which puts java on PATH already. Kept unconditional so local runs need no setup.
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
      // MUST NOT be zsh. GitHub's ubuntu-latest runners do not ship zsh, so this
      // died with `spawnSync /bin/zsh ENOENT` in global setup — the e2e job went
      // red on main without a single test running. bash exists on both macOS and
      // ubuntu-latest; keep it that way.
      shell: '/bin/bash',
    });

    execSync(
      'firebase emulators:start --only auth,firestore,functions &',
      // bash, not zsh — see the note above; absent on ubuntu-latest.
      { cwd: process.cwd(), env, stdio: 'ignore', shell: '/bin/bash' },
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
  // baseURL is REQUIRED here. globalSetup launches its own browser, so it does
  // NOT inherit `use.baseURL` from playwright.config.ts the way tests do — and
  // `loginAsTestUser` navigates to the relative '/auth'. Without this the
  // warm-up dies on "Cannot navigate to invalid URL", and because the warm-up
  // is deliberately non-fatal that failure is a WARNING, not a test failure:
  // the suite still goes green while silently losing the warm-up entirely.
  const context = await browser.newContext({ baseURL: 'http://localhost:8080' });
  const page = await context.newPage();

  try {
    // Warm up through the SAME email/password path the specs use. This used to
    // drive the Google popup, which pulls gapi from https://apis.google.com and
    // put the public internet on the critical path — the exact dependency whose
    // intermittent failure (net::ERR_ABORTED) was breaking logins in CI.
    await loginAsTestUser(page);
    console.log('Emulator warm-up complete. Tests will be faster.');
  } catch (e) {
    // Non-fatal by design: this is a cold-start optimisation, not a gate. Each
    // spec signs in for itself and will fail loudly on its own if auth is broken.
    console.warn('Warm-up login failed (non-fatal, tests will cold-start):', (e as Error).message);
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;
