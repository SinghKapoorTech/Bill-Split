import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * Recurring Bill Wizard — Full Flow
 *
 * Tests the 4-step recurring bill creation wizard:
 *   Details → People → Schedule → Review
 */
test.describe('Recurring Bill Wizard', () => {
  test('creates a recurring bill through the full wizard flow', async ({ page }) => {
    await loginAsTestUser(page);

    // Navigate directly to the recurring bill wizard
    await page.goto('/recurring/new');
    await page.waitForURL(/\/recurring\/new/, { timeout: 15000 });

    // ── Step 1: Details ──
    // Fill in the title
    const titleInput = page.locator('#title');
    await titleInput.waitFor({ state: 'visible', timeout: 10000 });
    await titleInput.fill('Phone Bill');

    // Fill in the amount
    const amountInput = page.locator('#amount');
    await amountInput.fill('60.00');

    // Go to next step
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 2: People ──
    // Owner should already be in the list. Add another person.
    const personNameInput = page.getByPlaceholder(/name/i);
    await personNameInput.waitFor({ state: 'visible', timeout: 10000 });
    await personNameInput.fill('Brother');

    // Click add
    const addPersonButton = page.getByRole('button', { name: /^add$/i }).or(
      page.locator('button').filter({ has: page.locator('.lucide-user-plus') })
    );
    await addPersonButton.click();

    // Verify person was added
    await expect(page.getByText('Brother').first()).toBeVisible({ timeout: 5000 });

    // Go to next step
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 3: Schedule ──
    // Monthly should be the default frequency
    await expect(page.getByText('Monthly')).toBeVisible({ timeout: 10000 });

    // Verify the frequency buttons are visible
    await expect(page.getByText('Weekly')).toBeVisible();
    await expect(page.getByText('Biweekly')).toBeVisible();

    // The day of month input should be visible (since Monthly is default)
    const dayOfMonthInput = page.locator('#dayOfMonth');
    await expect(dayOfMonthInput).toBeVisible();

    // Start date should be pre-filled with today
    const startDateInput = page.locator('#startDate');
    await expect(startDateInput).toBeVisible();

    // Go to review
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 4: Review ──
    // Verify schedule info is displayed
    await expect(page.getByText(/Schedule/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Every month/)).toBeVisible();
    await expect(page.getByText(/Next bills/)).toBeVisible();

    // Verify the split summary is shown
    await expect(page.getByText('Brother').first()).toBeVisible();
  });

  test('weekly frequency shows day-of-week picker', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/recurring/new');
    await page.waitForURL(/\/recurring\/new/, { timeout: 15000 });

    // Fill required details step
    await page.locator('#title').fill('Rent');
    await page.locator('#amount').fill('500');
    await page.getByRole('button', { name: 'Next' }).click();

    // Add a person
    const personInput = page.getByPlaceholder(/name/i);
    await personInput.waitFor({ state: 'visible', timeout: 10000 });
    await personInput.fill('Roommate');
    const addBtn = page.getByRole('button', { name: /^add$/i }).or(
      page.locator('button').filter({ has: page.locator('.lucide-user-plus') })
    );
    await addBtn.click();
    await page.getByRole('button', { name: 'Next' }).click();

    // Now on Schedule step — click Weekly
    await page.getByText('Weekly').click();

    // Day-of-week buttons should appear
    await expect(page.getByText('Mon')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Tue')).toBeVisible();
    await expect(page.getByText('Wed')).toBeVisible();
    await expect(page.getByText('Thu')).toBeVisible();
    await expect(page.getByText('Fri')).toBeVisible();
    await expect(page.getByText('Sat')).toBeVisible();
    await expect(page.getByText('Sun')).toBeVisible();

    // Day of month input should NOT be visible
    await expect(page.locator('#dayOfMonth')).not.toBeVisible();
  });
});
