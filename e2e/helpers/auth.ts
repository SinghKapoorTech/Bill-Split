import { Page, expect } from '@playwright/test';

export interface TestAccount {
  name: string;
  email: string;
  password: string;
}

/**
 * Builds a fresh, unique account for one test.
 *
 * Deliberately NOT a single shared account. The emulators start once in
 * global-setup and live for the whole run, so a shared login would accumulate
 * bills and events across specs — and several specs assert first-run empty
 * states (`events.spec.ts` expects "No events yet", `dashboard-bills` expects
 * the onboarding dialog). A per-test account preserves exactly the isolation
 * the old auto-generated emulator user gave us.
 */
export function newTestAccount(): TestAccount {
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    // The name MUST be unique, not a constant. `generateUniqueUsername`
    // (src/services/userService.ts:42-58) probes `test-user`, `test-user-1`,
    // `test-user-2` … one Firestore query at a time, and the local emulator is
    // reused across runs (global-setup.ts), so a constant name grows that chain
    // by ~16-18 every suite run and never resets. Measured: 150 seeded
    // `test-user-N` profiles took dashboard-bills.spec.ts from 4.6s to 17.9s
    // (~44ms per probe). CI is unaffected (fresh emulator); local iteration rots.
    name: `Test User ${unique}`,
    email: `e2e-${unique}@divit.test`,
    password: 'e2e-test-password',
  };
}

/**
 * Signs in by creating a fresh email/password account through the real UI.
 *
 * WHY NOT THE GOOGLE POPUP: `signInWithPopup` uses `browserPopupRedirectResolver`,
 * which loads gapi from https://apis.google.com to build the iframe channel that
 * carries the popup result back to the app — even when everything else is
 * emulated. That put the PUBLIC INTERNET on the critical path of every single
 * test, and it is what was failing in CI. Run 34180371036 correlated perfectly
 * across all six captured traces:
 *
 *   api.js 200,200 -> accounts:signInWithIdp fired  -> login worked  (3 traces)
 *   api.js 200,-1  -> accounts:signInWithIdp NEVER  -> no session    (3 traces)
 *
 * (-1 is net::ERR_ABORTED.) With no session, the next `page.goto(...)` landed on
 * the marketing page and the spec burned its whole timeout looking for an
 * element that was never going to render. That looked like "the events page is
 * slow"; it was never slow, it was logged out.
 *
 * Email/password is a plain REST call to the Auth emulator: no popup, no gapi,
 * no apis.google.com, nothing outside localhost.
 *
 * NOTE: there is deliberately no try/catch fallback here. The previous version
 * caught a `waitForURL` timeout and did `page.goto('/dashboard')` anyway, which
 * converted a hard auth failure into a confusing assertion failure 15s later in
 * whatever spec happened to be running. If sign-up breaks, it must fail HERE.
 */
export async function loginAsTestUser(page: Page): Promise<TestAccount> {
  const account = newTestAccount();

  await page.goto('/auth');

  // The form (EmailPasswordForm.tsx:29) mounts in 'signin' mode; the name field
  // only exists in 'signup'. This toggle is `Create an account` — distinct from
  // the submit button `Create account`.
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();

  await page.getByLabel('Name', { exact: true }).fill(account.name);
  await page.getByLabel('Email', { exact: true }).fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);

  // `exact` matters for the same reason as the toggle above: without it this
  // would be ambiguous against `Create an account`. (It is NOT about the
  // provider buttons — only `Sign in with Google` renders on web, and role-name
  // matching is substring-based, so it could never collide with this.)
  await page.getByRole('button', { name: 'Create account', exact: true }).click();

  // Auth.tsx:57 navigates on the `user` effect, not in the submit handler.
  // 20s, not 30s: a healthy login lands in well under 2s, and this timeout is
  // paid on EVERY login on a genuine auth break — at retries:2 across ~16
  // logins, 30s is ~24min of CI before it goes red.
  await page.waitForURL(/\/dashboard/, { timeout: 20000 });

  await waitForAuthPersisted(page);

  return account;
}

/**
 * Blocks until Firebase has written the signed-in session to IndexedDB.
 *
 * Reaching /dashboard only proves auth exists IN MEMORY. Firebase flushes the
 * session to IndexedDB asynchronously, and any test that then calls
 * `page.goto(...)` does a FULL RELOAD — if the write has not landed, the
 * restored session is empty, ProtectedRoute resolves to "no user" and bounces
 * to the marketing page.
 *
 * MUST NOT USE `page.waitForFunction`. It does not await a returned promise, so
 * an async predicate resolves on the very first poll because a Promise OBJECT is
 * truthy. The previous version of this function did exactly that and therefore
 * verified NOTHING — measured:
 *
 *   polling:100 + Promise<false>     -> RESOLVED (vacuous) after 26ms
 *   default polling + Promise<false> -> RESOLVED (vacuous) after 1ms
 *   polling:100 + plain false        -> timed out (correct) after 3017ms
 *
 * `page.evaluate` DOES await promises, so poll that instead.
 */
export async function waitForAuthPersisted(page: Page, timeout = 15000) {
  await expect
    .poll(
      () =>
        // The `.catch(() => false)` below is REQUIRED, and is not the usual
        // swallow-a-failure antipattern this suite bans. `expect.poll` awaits
        // its generator OUTSIDE its own try/catch (playwright/lib/matchers/
        // expect.js, `pollMatcher`), so it retries a FALSY result but NOT a
        // REJECTION — `goto()` racing this would hard-fail with "Execution
        // context was destroyed" instead of polling. Mapping that transient
        // navigation error to "not persisted yet" is the correct reading, and
        // it cannot hide a real failure: the outer `.toBe(true)` still has to
        // be satisfied before the deadline or the whole call rejects.
        page
          .evaluate(
            () =>
              new Promise<boolean>((resolve) => {
                let req: IDBOpenDBRequest;
                try {
                  req = indexedDB.open('firebaseLocalStorageDb');
                } catch {
                  resolve(false);
                  return;
                }
                req.onerror = () => resolve(false);
                req.onsuccess = () => {
                  const db = req.result;
                  if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
                    db.close();
                    resolve(false);
                    return;
                  }
                  const keysReq = db
                    .transaction('firebaseLocalStorage', 'readonly')
                    .objectStore('firebaseLocalStorage')
                    .getAllKeys();
                  keysReq.onerror = () => {
                    db.close();
                    resolve(false);
                  };
                  keysReq.onsuccess = () => {
                    const persisted = (keysReq.result as IDBValidKey[]).some((k) =>
                      String(k).startsWith('firebase:authUser:'),
                    );
                    db.close();
                    resolve(persisted);
                  };
                };
              }),
          )
          .catch(() => false),
      {
        timeout,
        intervals: [100],
        message: 'Firebase never flushed the signed-in session to IndexedDB',
      },
    )
    .toBe(true);
}
