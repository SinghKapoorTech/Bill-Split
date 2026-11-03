import { test, expect, Page, Route } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { addItemsToBill, addGuestPeopleToBill } from './helpers/bill';
import { createEventWithMembers } from './helpers/event';

/**
 * Picking an event on a draft (/bill/new, /airbnb/new) used to save with
 * `billId || activeSession?.id`: with no bill yet, that was the user's LATEST
 * bill, which got the new event, billType and people, and the draft page was
 * navigated onto it.
 *
 * The event picker is on step 1, and leaving step 0 JIT-creates the draft, so
 * the draft branch is live while that creation is in flight. These specs hold
 * the createBill call, pick the event mid-creation, then release them: the pick
 * must land on the draft's own new bill and leave the latest bill untouched.
 */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 },
];

type Fields = Record<string, unknown>;

/** Reads a doc from the Firestore emulator with admin rights (no rules). */
async function readDoc(page: Page, projectId: string, path: string): Promise<Fields> {
  const res = await page.request.get(
    `http://localhost:8081/v1/projects/${projectId}/databases/(default)/documents/${path}`,
    { headers: { Authorization: 'Bearer owner' } },
  );
  expect(res.ok(), `read ${path}`).toBeTruthy();
  return ((await res.json()).fields ?? {}) as Fields;
}

/** Holds the createBill callable (bill creation) until release(). */
async function holdWrites(page: Page) {
  const held: Route[] = [];
  let holding = true;
  await page.route('**/createBill', (route) => {
    if (holding) held.push(route);
    else route.continue();
  });
  return {
    heldCount: () => held.length,
    release: async () => {
      holding = false;
      for (const r of held.splice(0)) await r.continue();
    },
  };
}

function captureProjectId(page: Page) {
  const box = { id: '' };
  page.on('request', (req) => {
    const m = /projects(?:%2F|\/)([^%/]+)(?:%2F|\/)databases/.exec(req.url());
    if (m && !box.id) box.id = m[1];
  });
  return box;
}

const billIdFrom = (url: string, base: string) =>
  new RegExp(`${base}/([^/?#]+)`).exec(new URL(url).pathname)?.[1];

/** Mobile opens on the AI Scan tab; manual entry is behind the Manual tab. */
async function addItem(page: Page, name: string, price: string) {
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    await page.getByRole('tab', { name: 'Manual' }).click();
  }
  await addItemsToBill(page, [{ name, price }]);
}

async function pickEvent(page: Page, name: string) {
  await page.getByRole('combobox').filter({ hasText: /Event\.\.\.|None/ }).first().click();
  await page.getByRole('option', { name }).click();
}

type Latest = { billA: string; before: Fields; oldEventId: string; skiEventId: string };

/**
 * Latest bill A — an event bill with an item and a guest (so a people
 * overwrite would show) — then a second event, Ski Trip, to pick on the draft.
 */
async function seedLatestBillAndEvent(page: Page, projectId: () => string): Promise<Latest> {
  await createEventWithMembers(page, 'Old Trip', '', ['old@example.com']);
  await page.getByText('Start First Bill').click();
  await page.waitForURL(/\/bill\//, { timeout: 15000 });
  await addItem(page, 'Steak', '30.00');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.waitForURL(/\/bill\/(?!new)[^/]+$/, { timeout: 15000 });
  const billA = billIdFrom(page.url(), '/bill')!;
  await addGuestPeopleToBill(page, ['Carol']);
  await expect
    .poll(async () => JSON.stringify((await readDoc(page, projectId(), `bills/${billA}`)).people), {
      timeout: 15000,
    })
    .toContain('Carol');
  const before = await readDoc(page, projectId(), `bills/${billA}`);
  expect(before.eventId).toBeTruthy();
  const oldEventId = (before.eventId as { stringValue: string }).stringValue;

  await createEventWithMembers(page, 'Ski Trip', '', ['ski@example.com']);
  const skiEventId = billIdFrom(page.url(), '/events')!;
  return { billA, before, oldEventId, skiEventId };
}

/** The draft's new bill has the event + its content; A is unchanged. */
async function expectDraftCreatedAndLatestUntouched(
  page: Page,
  projectId: string,
  base: string,
  latest: Latest,
  draftContent: string,
) {
  await page.waitForURL(new RegExp(`${base}/(?!new)[^/]+$`), { timeout: 20000 });
  const draftId = billIdFrom(page.url(), base)!;
  expect(draftId).not.toBe(latest.billA);

  await expect
    .poll(async () => (await readDoc(page, projectId, `bills/${draftId}`)).eventId, { timeout: 15000 })
    .toEqual({ stringValue: latest.skiEventId });
  const created = await readDoc(page, projectId, `bills/${draftId}`);
  expect(created.billType).toEqual({ stringValue: 'event' });
  expect(JSON.stringify(created.billData)).toContain(draftContent);

  // Latest bill A kept its own event, type, people (incl. Carol), assignments and items.
  const { before } = latest;
  const after = await readDoc(page, projectId, `bills/${latest.billA}`);
  expect(after.eventId).toEqual({ stringValue: latest.oldEventId });
  expect(after.billType).toEqual({ stringValue: 'event' });
  expect(JSON.stringify(after.people)).toContain('Carol');
  expect(after.people).toEqual(before.people);
  expect(after.itemAssignments).toEqual(before.itemAssignments);
  expect(JSON.stringify(after.billData)).toContain('Steak');
  expect(JSON.stringify(after.billData)).not.toContain(draftContent);
  return created;
}

for (const vp of VIEWPORTS) {
  test(`bill draft: picking an event mid-creation lands on the new bill, latest bill unchanged (${vp.name})`, async ({ page }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const project = captureProjectId(page);
    await loginAsTestUser(page);
    const latest = await seedLatestBillAndEvent(page, () => project.id);

    // Draft: adding an item starts the JIT creation; hold it, go to the people
    // step and pick the event while it is still in flight.
    await page.goto('/bill/new');
    const writes = await holdWrites(page);
    await addItem(page, 'Lift pass', '80.00');
    await expect.poll(writes.heldCount).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Next' }).click();
    await pickEvent(page, 'Ski Trip');
    await writes.release();

    await expectDraftCreatedAndLatestUntouched(page, project.id, '/bill', latest, 'Lift pass');

    // Same page instance: the draft's item is still on screen. (Back is
    // disabled until the people step is valid, so add a guest first.)
    await addGuestPeopleToBill(page, ['Dana']);
    await page.getByRole('button', { name: /back/i }).first().click();
    if (vp.width < 768) await page.getByRole('tab', { name: 'Manual' }).click();
    await expect(page.getByText('Lift pass').first()).toBeVisible();
  });

  test(`airbnb draft: picking an event mid-creation lands on the new bill, latest bill unchanged (${vp.name})`, async ({ page }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const project = captureProjectId(page);
    await loginAsTestUser(page);
    const latest = await seedLatestBillAndEvent(page, () => project.id);

    // Draft: dates + cost; blurring the cost starts the JIT creation. Hold it,
    // go to the guests step and pick the event while it is still in flight.
    await page.goto('/airbnb/new');
    const writes = await holdWrites(page);
    await page.getByRole('button', { name: /check-in and check-out/i }).click();
    await page.getByRole('gridcell', { name: '10', exact: true }).first().click();
    await page.getByRole('gridcell', { name: '12', exact: true }).first().click();
    await page.keyboard.press('Escape');
    await page.locator('#totalCost').fill('300');
    await page.locator('#totalCost').blur();
    await expect.poll(writes.heldCount).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await pickEvent(page, 'Ski Trip');
    await writes.release();

    const created = await expectDraftCreatedAndLatestUntouched(page, project.id, '/airbnb', latest, 'Night of');
    expect(created.isAirbnb).toEqual({ booleanValue: true });

    // Same page instance: the stay is still on screen.
    await addGuestPeopleToBill(page, ['Dana']);
    await page.getByRole('button', { name: /back/i }).first().click();
    await expect(page.locator('#totalCost')).toHaveValue('300');
  });
}
