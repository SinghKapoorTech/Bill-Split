import { test, expect, Page } from '@playwright/test';
import { loginAsTestUser, TestAccount } from './helpers/auth';

/**
 * An OLDER bill (not the user's latest) on /bill, /airbnb and /transaction.
 *
 * - Offline (C3/C4): the listener already holds the bill (savedSessions), so
 *   it must render from there even though getDoc fails offline. Before, the
 *   Airbnb and quick-expense pages only accepted activeSession (the LATEST
 *   bill) and showed "You're offline" instead.
 * - Online smoke (C1/C2): editing the title of an older bill sticks once the
 *   page's own fetch has settled, and is saved to THAT bill on leaving. The fetch-vs-edit race itself is pinned by
 *   the RTL tests; it can't be timed here (listener and getDoc share a channel).
 *
 * Bills are seeded straight into the Firestore emulator (admin bearer), then
 * reached by in-app navigation from /bills, as a user would.
 */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 },
];

type Kind = 'scan' | 'airbnb' | 'transaction';
const ROUTE: Record<Kind, string> = { scan: '/bill', airbnb: '/airbnb', transaction: '/transaction' };

function captureProjectId(page: Page) {
  const box = { id: '' };
  page.on('request', (req) => {
    const m = /projects(?:%2F|\/)([^%/]+)(?:%2F|\/)databases/.exec(req.url());
    if (m && !box.id) box.id = m[1];
  });
  return box;
}

/** The signed-in user's uid, from the Auth emulator. */
async function uidOf(page: Page, account: TestAccount): Promise<string> {
  const res = await page.request.post(
    'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { data: { email: account.email, password: account.password, returnSecureToken: true } },
  );
  expect(res.ok(), 'auth emulator sign-in').toBeTruthy();
  return (await res.json()).localId as string;
}

const str = (v: string) => ({ stringValue: v });
const ts = (d: Date) => ({ timestampValue: d.toISOString() });

/** Writes a bill doc the user's listener will pick up (admin, bypasses rules). */
async function seedBill(
  page: Page,
  projectId: string,
  uid: string,
  id: string,
  title: string,
  kind: Kind,
  updatedAt: Date,
) {
  const person = { mapValue: { fields: { id: str(`user-${uid}`), name: str('Me') } } };
  const fields: Record<string, unknown> = {
    id: str(id),
    ownerId: str(uid),
    billType: str('private'),
    participantIds: { arrayValue: { values: [str(uid)] } },
    title: str(title),
    paidById: str(uid),
    splitEvenly: { booleanValue: true },
    people: { arrayValue: { values: [person] } },
    itemAssignments: { mapValue: { fields: {} } },
    billData: {
      mapValue: {
        fields: {
          items: {
            arrayValue: {
              values: [
                {
                  mapValue: {
                    fields: { id: str('item-1'), name: str(title), price: { doubleValue: 20 } },
                  },
                },
              ],
            },
          },
          subtotal: { doubleValue: 20 },
          tax: { doubleValue: 0 },
          tip: { doubleValue: 0 },
          total: { doubleValue: 20 },
        },
      },
    },
    createdAt: ts(updatedAt),
    updatedAt: ts(updatedAt),
    lastActivity: ts(updatedAt),
    ...(kind === 'airbnb' ? { isAirbnb: { booleanValue: true } } : {}),
    ...(kind === 'transaction' ? { isSimpleTransaction: { booleanValue: true } } : {}),
  };
  const res = await page.request.patch(
    `http://localhost:8081/v1/projects/${projectId}/databases/(default)/documents/bills/${id}`,
    { headers: { Authorization: 'Bearer owner' }, data: { fields } },
  );
  expect(res.ok(), `seed bills/${id}: ${await res.text()}`).toBeTruthy();
}

/** Seeds a latest + an older bill of `kind`, then waits on /bills for both. */
async function seedLatestAndOlder(page: Page, account: TestAccount, kind: Kind, tag: string) {
  const project = captureProjectId(page);
  await page.goto('/bills');
  await expect.poll(() => project.id, { timeout: 15000 }).not.toBe('');
  const uid = await uidOf(page, account);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const olderId = `older-${unique}`;
  const olderTitle = `Older ${kind} ${tag} ${unique}`;
  const latestTitle = `Latest ${kind} ${tag} ${unique}`;
  await seedBill(page, project.id, uid, olderId, olderTitle, kind, new Date(Date.now() - 86_400_000));
  await seedBill(page, project.id, uid, `latest-${unique}`, latestTitle, kind, new Date());

  // Both arrive through the listener: the latest is activeSession, the older
  // one a savedSessions entry.
  await expect(page.getByText(latestTitle)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(olderTitle)).toBeVisible({ timeout: 20000 });
  return { olderId, olderTitle, projectId: project.id };
}

const heroTitle = (page: Page) => page.locator('#hero-bill-title');

for (const vp of VIEWPORTS) {
  for (const kind of ['airbnb', 'transaction'] as const) {
    test(`offline: an older ${kind} bill renders from the listener cache (${vp.name})`, async ({
      page,
      context,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const account = await loginAsTestUser(page);
      const { olderId, olderTitle } = await seedLatestAndOlder(page, account, kind, 'offline');

      await context.setOffline(true);
      await page.getByText(olderTitle).click();
      await expect(page).toHaveURL(new RegExp(`${ROUTE[kind]}/${olderId}$`));

      await expect(heroTitle(page)).toHaveValue(olderTitle, { timeout: 20000 });
      // Give the offline getDoc time to fail: the bill must stay, no error card.
      await page.waitForTimeout(3000);
      await expect(heroTitle(page)).toHaveValue(olderTitle);
      await expect(page.getByRole('heading', { name: "You're offline" })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: "Couldn't open this bill" })).toHaveCount(0);
      await page.screenshot({
        path: `test-results/older-${kind}-offline-${vp.name}.png`,
      });
      await context.setOffline(false);
    });
  }

  for (const kind of ['scan', 'airbnb'] as const) {
    test(`online: an edited title on an older ${kind} bill survives the page's fetch (${vp.name})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const account = await loginAsTestUser(page);
      const { olderId, olderTitle, projectId } = await seedLatestAndOlder(page, account, kind, 'edit');

      await page.getByText(olderTitle).click();
      await expect(page).toHaveURL(new RegExp(`${ROUTE[kind]}/${olderId}$`));
      await expect(heroTitle(page)).toHaveValue(olderTitle, { timeout: 20000 });

      await heroTitle(page).fill('My edit');
      // The page's own fetch resolves well within this online; the listener
      // channel never goes network-idle, so wait it out instead.
      await page.waitForTimeout(3000);
      await expect(heroTitle(page)).toHaveValue('My edit');

      // Leaving flushes the wizard's save (it saves on step change / unmount):
      // the edit lands on THIS bill.
      await page.goBack();
      await expect(page).toHaveURL(/\/bills/);
      await expect
        .poll(
          async () => {
            const res = await page.request.get(
              `http://localhost:8081/v1/projects/${projectId}/databases/(default)/documents/bills/${olderId}`,
              { headers: { Authorization: 'Bearer owner' } },
            );
            return (await res.json()).fields?.title?.stringValue;
          },
          { timeout: 20000 },
        )
        .toBe('My edit');
    });
  }
}
