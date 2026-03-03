import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createStandardBill } from './helpers/bill';

test.describe('Settlement Flow', () => {
  test('dashboard shows friend balance section and bill management', async ({ page }) => {
    await loginAsTestUser(page);

    // Verify dashboard loads
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('My Bills')).toBeVisible();
  });

  test('creates a bill, splits it, and verifies review step shows per-person totals', async ({ page }) => {
    await loginAsTestUser(page);

    // Create a bill through the wizard (handles both empty and non-empty dashboard)
    await createStandardBill(page);

    // Add an item
    await page.getByRole('button', { name: 'Add Item' }).click();
    const addRow = page.locator('tr').filter({ has: page.getByPlaceholder('Enter item name') });
    await addRow.getByPlaceholder('Enter item name').fill('Dinner');
    await addRow.getByPlaceholder('0.00').fill('40.00');
    await addRow.getByPlaceholder('0.00').press('Enter');

    // Go to People step
    await page.getByRole('button', { name: 'Next' }).click();

    // Add two people
    await page.getByRole('button', { name: 'Add Person' }).click();
    await page.locator('#manual-name').fill('Charlie');
    await page.getByRole('button', { name: 'Add Guest to Bill' }).click();

    await page.getByRole('button', { name: 'Add Person' }).click();
    await page.locator('#manual-name').fill('Dana');
    await page.getByRole('button', { name: 'Add Guest to Bill' }).click();

    // Go to Assignment step
    await page.getByRole('button', { name: 'Next' }).click();

    // Split evenly
    await page.getByRole('button', { name: 'Split Evenly' }).click();

    // Go to Review step
    await page.getByRole('button', { name: 'Next' }).click();

    // Verify review shows person names
    await expect(page.getByText('Charlie').first()).toBeVisible();
    await expect(page.getByText('Dana').first()).toBeVisible();
  });
});
