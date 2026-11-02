import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * /bill/:id for a bill that doesn't exist (or isn't readable) used to spin
 * forever. It must show the "Couldn't open this bill" state, and Go back must
 * leave the route in-app.
 */
const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 720 },
];

for (const vp of VIEWPORTS) {
  test(`missing bill shows the load error state (${vp.name})`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await loginAsTestUser(page);

    const missingId = `missing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await page.goto(`/bill/${missingId}`);

    await expect(page.getByRole('heading', { name: "Couldn't open this bill" })).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    const back = page.getByRole('button', { name: /go back/i });
    await expect(back).toBeVisible();

    await back.click();

    await expect(page).not.toHaveURL(new RegExp(`/bill/${missingId}`));
    await expect(page.getByRole('heading', { name: "Couldn't open this bill" })).toHaveCount(0);
  });
}
