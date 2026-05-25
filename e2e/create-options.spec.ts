import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * CreateOptionsDialog — All Bill Types
 *
 * Verifies that the create dialog shows all 4 bill type options
 * and navigates correctly when each is clicked.
 */
test.describe('CreateOptionsDialog', () => {
  test('shows all four bill creation options', async ({ page }) => {
    await loginAsTestUser(page);
    await page.waitForURL(/\/dashboard/, { timeout: 20000 });
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 45000 });

    // Open the create dialog via the + button on the Bills section
    // Navigate to the bills tab first
    await page.goto('/bills');
    await page.waitForURL(/\/bills/, { timeout: 15000 });

    // Click the + button to open CreateOptionsDialog
    const plusButton = page.locator('button.rounded-full').filter({ has: page.locator('.lucide-plus') });
    await plusButton.click();

    // Verify all 4 options are visible
    await expect(page.getByText('New Bill')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Quick Expense')).toBeVisible();
    await expect(page.getByText('Airbnb / House')).toBeVisible();
    await expect(page.getByText('Recurring Bill')).toBeVisible();
  });

  test('clicking Recurring Bill navigates to /recurring/new', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/bills');
    await page.waitForURL(/\/bills/, { timeout: 15000 });

    // Wait for page to load
    const plusButton = page.locator('button.rounded-full').filter({ has: page.locator('.lucide-plus') });
    await expect(plusButton).toBeVisible({ timeout: 30000 });
    await plusButton.click();

    // Click the Recurring Bill option
    await page.getByText('Recurring Bill').click();

    // Verify navigation
    await page.waitForURL(/\/recurring\/new/, { timeout: 10000 });
  });
});
