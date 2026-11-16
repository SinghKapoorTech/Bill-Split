import { test, expect, type Page } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { dismissOnboarding } from './helpers/onboarding';

/**
 * Email/password signup writes ONE valid profile.
 *
 * Before the fix, useUserProfile created users/{uid} itself the moment the
 * Dashboard mounted — publishing the typed, UNVERIFIED email with no username
 * — and both userService.syncUserProfile calls that followed were then
 * permission-denied (two console errors per signup). The new user had no
 * username (unfindable by search) and hasSeenOnboarding was never written.
 *
 * Checked at phone and desktop width, through the real UI + emulators.
 */

// The Firestore emulator only (global-setup starts it on 8081 with the
// .firebaserc default project, which is the project the app's config names).
const FIRESTORE_EMULATOR = 'http://localhost:8081';
const EMULATOR_PROJECT = process.env.VITE_FIREBASE_PROJECT_ID || 'divit-6d217';

type Fields = Record<string, { stringValue?: string; booleanValue?: boolean }>;

/** Reads the profile straight from the emulator (rules bypassed with the emulator's owner token). */
async function readProfileByName(displayName: string): Promise<Fields | null> {
  const res = await fetch(
    `${FIRESTORE_EMULATOR}/v1/projects/${EMULATOR_PROJECT}/databases/(default)/documents:runQuery`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: { field: { fieldPath: 'displayName' }, op: 'EQUAL', value: { stringValue: displayName } },
          },
          limit: 5,
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`emulator query failed: ${res.status} ${await res.text()}`);
  const rows = (await res.json()) as Array<{ document?: { fields: Fields } }>;
  const docs = rows.filter((r) => r.document).map((r) => r.document!.fields);
  if (docs.length > 1) throw new Error(`expected one profile named ${displayName}, found ${docs.length}`);
  return docs[0] ?? null;
}

/** Every console error/warning that reports a Firestore permission failure. */
function collectPermissionErrors(page: Page): string[] {
  const seen: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (/PERMISSION_DENIED|permission-denied|insufficient permissions/i.test(text)) seen.push(text);
  });
  return seen;
}

/** "Test User 1731-abc" → "test-user-1731-abc", the way generateUniqueUsername slugs it. */
const expectedUsername = (name: string) =>
  name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
]) {
  test.describe(`Signup profile @ ${viewport.width}px`, () => {
    test.use({ viewport });

    test('creates one profile with a username, logs no permission errors, and Skip persists', async ({ page, browser }) => {
      const denied = collectPermissionErrors(page);
      // Slow updateProfile (Auth emulator accounts:update) so the background
      // profile sync — started by onAuthStateChanged with displayName still
      // null — always wins the create. That is the ordering that used to seed
      // the public username from the email's local part.
      await page.route('**/identitytoolkit.googleapis.com/v1/accounts:update*', async (route) => {
        await new Promise((r) => setTimeout(r, 1500));
        await route.continue();
      });
      const account = await loginAsTestUser(page);

      // Onboarding opens because the profile carries hasSeenOnboarding:false.
      await dismissOnboarding(page);

      // The profile on the server: typed name, a username, email withheld
      // (the address is not verified yet), and Skip recorded. The username
      // must come from the TYPED name — never the unverified email's local
      // part — whichever profile sync wins the create.
      const username = expectedUsername(account.name);
      await expect
        .poll(async () => {
          const p = await readProfileByName(account.name);
          return p && {
            username: p.username?.stringValue,
            email: p.email?.stringValue,
            hasSeenOnboarding: p.hasSeenOnboarding?.booleanValue,
          };
        }, { timeout: 15000 })
        .toEqual({ username, email: '', hasSeenOnboarding: true });

      // After a reload onboarding stays closed.
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible({ timeout: 45000 });
      // The dialog opens as soon as the profile snapshot lands; give that
      // listener time to fire before asserting it did not reopen.
      await page.waitForTimeout(3000);
      await expect(page.getByRole('button', { name: 'Skip' })).toHaveCount(0);

      expect(denied).toEqual([]);

      // Searchable: a second, separate user finds the new account by username.
      const other = await browser.newContext({ viewport });
      try {
        const page2 = await other.newPage();
        const denied2 = collectPermissionErrors(page2);
        await loginAsTestUser(page2);
        await dismissOnboarding(page2);
        await page2.goto('/events');
        const create = page2.getByRole('button', { name: 'Create Event' });
        await expect(create.first()).toBeVisible({ timeout: 30000 });
        await create.first().click();
        await expect(page2.getByRole('heading', { name: 'Create New Event' })).toBeVisible();
        await page2.getByRole('button', { name: 'Add Member' }).click();
        await page2.getByPlaceholder('Name, @username, or email...').fill(username);
        const result = page2.getByRole('button').filter({ hasText: `@${username}` });
        await expect(result).toBeVisible({ timeout: 15000 });
        await expect(result).toContainText(account.name);
        expect(denied2).toEqual([]);
      } finally {
        await other.close();
      }
    });
  });
}
