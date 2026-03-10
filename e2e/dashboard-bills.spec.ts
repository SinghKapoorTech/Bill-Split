import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * Dashboard — Basic Structure
 *
 * Verifies the dashboard loads correctly after login.
 *
 * We test the structural elements that are ALWAYS visible regardless of
 * bill loading state — avoiding the `isLoadingSessions` spinner timing issue.
 * The dashboard always shows "My Bills" and "Friend Balances" headers.
 */
test.describe('Dashboard', () => {
    test('shows the dashboard structure after login', async ({ page }) => {
        await loginAsTestUser(page);
        await page.waitForURL(/\/dashboard/, { timeout: 20000 });

        // "Welcome back" is rendered before isLoadingSessions resolves.
        // It's inside the return block AFTER the spinner, so this verifies
        // the full dashboard rendered. Use a long timeout for cold emulator.
        await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 45000 });

        // Friend Balances is also always rendered once loading completes
        await expect(page.getByText('Friend Balances')).toBeVisible({ timeout: 5000 });
    });

    test('shows the My Bills section and the friend balances section', async ({ page }) => {
        await loginAsTestUser(page);
        await page.waitForURL(/\/dashboard/, { timeout: 15000 });

        // "My Bills" section heading is rendered after isLoadingSessions resolves
        await expect(page.getByText('My Bills')).toBeVisible({ timeout: 45000 });

        // Friend Balances is always rendered regardless of data
        await expect(page.getByText('Friend Balances')).toBeVisible({ timeout: 5000 });
    });
});
