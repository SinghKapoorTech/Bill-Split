import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * /transaction/:billId with an id that doesn't exist must show the bill-load
 * error state (not an endless spinner or a blank Quick Expense form), and
 * Go back must leave the route.
 */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 },
];

for (const vp of VIEWPORTS) {
  test(`missing quick expense shows "Couldn't open this bill" (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loginAsTestUser(page);

    const missingId = `missing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(`/transaction/${missingId}`);

    await expect(page.getByRole('heading', { name: "Couldn't open this bill" })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    const back = page.getByRole('button', { name: /go back/i });
    await expect(back).toBeVisible();
    // A missing doc is "unavailable", not the offline variant.
    await expect(page.getByRole('heading', { name: "You're offline" })).toHaveCount(0);

    await back.click();
    await expect(page).not.toHaveURL(new RegExp(`/transaction/${missingId}`), { timeout: 10000 });
  });
}
