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

  await waitForAuthPersisted(page);
}

/**
 * Blocks until Firebase has written the signed-in session to IndexedDB.
 *
 * Reaching /dashboard only proves auth exists IN MEMORY. Firebase flushes the
 * session to IndexedDB asynchronously, and any test that then calls
 * `page.goto(...)` does a FULL RELOAD — if the write has not landed, the
 * restored session is empty, ProtectedRoute resolves to "no user" and bounces
 * to the marketing page. The spec then waits its full timeout on a landing
 * page that will never show the element.
 *
 * That is exactly how it failed in CI: `dashboard-bills`, `create-options` and
 * `recurring-bill` are precisely the specs that `goto` after logging in, and
 * every one of their failure snapshots is the landing page with a "Sign In"
 * button still on it. Locally the write always won the race; on CI's slower
 * disk it did not.
 */
async function waitForAuthPersisted(page: Page, timeout = 15000) {
  await page.waitForFunction(
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
    undefined,
    { timeout, polling: 100 },
  );
}
