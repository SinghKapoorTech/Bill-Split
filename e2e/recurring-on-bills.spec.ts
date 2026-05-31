import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * Verifies the two requirements of feat/recurring-bills-on-bills-page:
 *   1. A recurring bill set up via the wizard shows up on the Bills page and
 *      tapping it routes to /recurring/:id.
 *   2. Settings -> Recurring no longer offers any way to CREATE a recurring bill.
 */
test.describe('Recurring bills on the Bills page', () => {
  test('recurring bill appears on Bills page and opens its detail page', async ({ page }) => {
    await loginAsTestUser(page);

    // ── Create a recurring bill via the wizard ──
    await page.goto('/recurring/new');
    await page.waitForURL(/\/recurring\/new/, { timeout: 15000 });

    // Pick Quick Expense type
    await page.getByRole('button', { name: /quick expense/i }).click();

    await page.locator('#title').fill('Spotify Family');
    await page.locator('#amount').fill('19.99');
    await page.getByRole('button', { name: 'Next' }).click();

    // The People step hides the name input behind an "Add person" dialog.
    await page.getByRole('button', { name: /add (another person|a person)/i }).click();
    const nameInput = page.locator('#manual-name');
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill('Roommate');
    await nameInput.press('Enter'); // submits manual add (no venmo/email) and closes dialog
    await expect(page.getByText('Roommate').first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Next' }).click();

    // Schedule step → review
    await expect(page.getByText('Monthly')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Next' }).click();

    // Review → submit. The footer button is exactly "Create" (the header's
    // "Create a bill" must not be matched, hence exact).
    await expect(page.getByText(/Schedule/)).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // Creation is async and routes to /dashboard on success — wait for it so the
    // recurring bill is actually persisted before we navigate away.
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // ── Now go to the Bills page and assert the recurring bill is shown ──
    await page.goto('/bills');
    await page.waitForURL(/\/bills/, { timeout: 15000 });

    const recurringRow = page.getByText('Spotify Family');
    await expect(recurringRow.first()).toBeVisible({ timeout: 15000 });

    // Tapping it routes to /recurring/:id (not /bill/:id)
    await recurringRow.first().click();
    await page.waitForURL(/\/recurring\/[^/]+$/, { timeout: 15000 });
    expect(page.url()).toMatch(/\/recurring\/(?!new$)[^/]+$/);
  });

  test('a recurring bill on the Bills page can be deleted via its trash button', async ({ page }) => {
    await loginAsTestUser(page);

    // Create a recurring bill via the wizard.
    await page.goto('/recurring/new');
    await page.waitForURL(/\/recurring\/new/, { timeout: 15000 });
    await page.getByRole('button', { name: /quick expense/i }).click();
    await page.locator('#title').fill('Netflix Premium');
    await page.locator('#amount').fill('22.99');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: /add (another person|a person)/i }).click();
    const nameInput = page.locator('#manual-name');
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill('Sibling');
    await nameInput.press('Enter');
    await expect(page.getByText('Sibling').first()).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // On the Bills page it shows with a delete button.
    await page.goto('/bills');
    await page.waitForURL(/\/bills/, { timeout: 15000 });
    await expect(page.getByText('Netflix Premium', { exact: true })).toHaveCount(1, { timeout: 15000 });

    const deleteBtn = page.getByRole('button', { name: 'Delete recurring bill Netflix Premium' });
    await expect(deleteBtn).toBeVisible({ timeout: 10000 });
    await deleteBtn.click();

    // Confirm in the dialog.
    await page.getByRole('button', { name: 'Delete', exact: true }).click();

    // It disappears from the list (status → completed, dropped by the live subscription).
    await expect(page.getByText('Netflix Premium', { exact: true })).toHaveCount(0, { timeout: 15000 });
  });

  test('Settings → Recurring has no create affordance', async ({ page }) => {
    await loginAsTestUser(page);

    await page.goto('/settings');
    await page.waitForURL(/\/settings/, { timeout: 15000 });

    // Open the Recurring tab
    await page.getByRole('tab', { name: /recurring/i }).click();

    // The Recurring Bills section heading should be present...
    await expect(page.getByRole('heading', { name: 'Recurring Bills', exact: true })).toBeVisible({ timeout: 10000 });

    // ...but there must be NO "Create Recurring Bill" button anywhere in settings.
    await expect(page.getByRole('button', { name: /create recurring bill/i })).toHaveCount(0);
  });
});
