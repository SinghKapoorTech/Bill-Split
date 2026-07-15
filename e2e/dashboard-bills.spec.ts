import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * Dashboard — Basic Structure
 *
 * Verifies the dashboard (Balances page) loads correctly after login,
 * and that the Bills page renders its section structure.
 *
 * Current UI: /dashboard renders an h1 "Balances" with a net-balance
 * subtitle and the friend balance preview card; bills live at /bills
 * under an h1 "Your Bills".
 */
test.describe('Dashboard', () => {
    test('shows the dashboard structure after login', async ({ page }) => {
        await loginAsTestUser(page);
        await page.waitForURL(/\/dashboard/, { timeout: 20000 });

        // The "Balances" heading renders after isLoadingBalances resolves.
        // Use a long timeout for cold emulator.
        await expect(page.getByRole('heading', { name: 'Balances' })).toBeVisible({ timeout: 45000 });

        // Fresh test user has no balances → settled-up subtitle is deterministic
        await expect(page.getByText("You're all settled up")).toBeVisible({ timeout: 5000 });
    });

    test('shows the Bills page section after login', async ({ page }) => {
        await loginAsTestUser(page);
        await page.waitForURL(/\/dashboard/, { timeout: 15000 });

        // Bills moved from the dashboard to their own /bills page
        await page.goto('/bills');
        await expect(page.getByRole('heading', { name: 'Your Bills' })).toBeVisible({ timeout: 45000 });
    });
});
