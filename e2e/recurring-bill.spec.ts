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

    // ── Step 0: Type ── pick Quick Expense
    await page.getByRole('button', { name: /quick expense/i }).click();

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
    // Owner is already in the list. Add another person via the add dialog.
    await page.getByRole('button', { name: /add (another person|a person)/i }).click();
    const personNameInput = page.locator('#manual-name');
    await personNameInput.waitFor({ state: 'visible', timeout: 10000 });
    await personNameInput.fill('Brother');
    await personNameInput.press('Enter');

    // Verify person was added
    await expect(page.getByText('Brother').first()).toBeVisible({ timeout: 5000 });

    // Go to next step
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 3: Schedule ──
    // Frequency buttons are visible (exact, since "Weekly" is a substring of "Biweekly").
    await expect(page.getByRole('button', { name: 'Monthly', exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Weekly', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Biweekly', exact: true })).toBeVisible();

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

    // Pick Quick Expense type, then fill required details step
    await page.getByRole('button', { name: /quick expense/i }).click();
    await page.locator('#title').fill('Rent');
    await page.locator('#amount').fill('500');
    await page.getByRole('button', { name: 'Next' }).click();

    // Add a person via the add dialog
    await page.getByRole('button', { name: /add (another person|a person)/i }).click();
    const personInput = page.locator('#manual-name');
    await personInput.waitFor({ state: 'visible', timeout: 10000 });
    await personInput.fill('Roommate');
    await personInput.press('Enter');
    await expect(page.getByText('Roommate').first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Next' }).click();

    // Now on Schedule step — click Weekly (exact: "Weekly" is a substring of "Biweekly")
    await page.getByRole('button', { name: 'Weekly', exact: true }).click();

    // Day-of-week buttons should appear (exact: "Mon" is a substring of "Monthly")
    await expect(page.getByRole('button', { name: 'Mon', exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'Tue', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wed', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Thu', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Fri', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sat', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sun', exact: true })).toBeVisible();

    // Day of month input should NOT be visible
    await expect(page.locator('#dayOfMonth')).not.toBeVisible();
  });
});
