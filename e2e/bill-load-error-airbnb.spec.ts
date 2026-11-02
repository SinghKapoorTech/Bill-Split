import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * /airbnb/:billId with an id that doesn't exist must show the bill-load error
 * state (not an endless spinner), and Go back must leave the route in-app.
 * A missing doc reads as not-found or permission-denied under the rules —
 * both render the same "Couldn't open this bill" screen.
 */
const VIEWPORTS = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'desktop', width: 1280, height: 720 },
];

test.describe('Airbnb bill load error', () => {
    for (const vp of VIEWPORTS) {
        test(`missing bill shows the error state and Go back leaves (${vp.name})`, async ({ page }) => {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await loginAsTestUser(page);

            const missingId = `missing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            await page.goto(`/airbnb/${missingId}`);

            await expect(page.getByRole('heading', { name: "Couldn't open this bill" })).toBeVisible({ timeout: 20000 });
            const goBack = page.getByRole('button', { name: /go back/i });
            await expect(goBack).toBeVisible();
            await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
            await expect(page.locator('.loading-spinner')).toHaveCount(0);

            await goBack.click();
            await expect(page).not.toHaveURL(/\/airbnb\//, { timeout: 10000 });
        });
    }
});
