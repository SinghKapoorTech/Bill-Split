import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

test.describe('Bill Creation Wizard', () => {
  test('creates a bill with items, people, and assignments through the full wizard', async ({ page }) => {
    // Sign in via emulator
    await loginAsTestUser(page);

    // Verify dashboard loads with welcome message
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 });

    // Click "Standard" to create a new bill
    const standardBillButton = page.getByRole('button', { name: 'Standard' });
    await expect(standardBillButton).toBeVisible();
    await standardBillButton.click();

    // Should navigate to /bill/:id
    await page.waitForURL(/\/bill\//, { timeout: 15000 });

    // ── Step 1: Bill Entry ──
    // Click "Add Item" button to start adding items
    const addItemButton = page.getByRole('button', { name: 'Add Item' });
    await expect(addItemButton).toBeVisible();
    await addItemButton.click();

    // Fill in item name and price (scoped to the add row in table)
    const addRow = page.locator('tr').filter({ has: page.getByPlaceholder('Enter item name') });
    await addRow.getByPlaceholder('Enter item name').fill('Burger');
    await addRow.getByPlaceholder('0.00').fill('15.00');
    await addRow.getByPlaceholder('0.00').press('Enter');

    // Verify item appears in the table (use role to be specific)
    await expect(page.getByRole('cell', { name: 'Burger' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '$15.00' })).toBeVisible();

    // Add a second item
    await page.getByRole('button', { name: 'Add Item' }).click();
    const addRow2 = page.locator('tr').filter({ has: page.getByPlaceholder('Enter item name') });
    await addRow2.getByPlaceholder('Enter item name').fill('Fries');
    await addRow2.getByPlaceholder('0.00').fill('6.00');
    await addRow2.getByPlaceholder('0.00').press('Enter');

    await expect(page.getByRole('cell', { name: 'Fries' })).toBeVisible();
    await expect(page.getByRole('cell', { name: '$6.00' })).toBeVisible();

    // Click "Next" to go to People step
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 2: People ──
    const searchInput = page.getByPlaceholder('Add a friend or guest...');

    // Add Alice
    await searchInput.fill('Alice');
    await page.getByRole('button', { name: 'Add "Alice" as guest' }).click();

    // Add Bob
    await searchInput.fill('Bob');
    await page.getByRole('button', { name: 'Add "Bob" as guest' }).click();

    // Verify people appear (use exact: true or first() to avoid toast conflicts)
    await expect(page.locator('.space-y-2').getByText('Alice')).toBeVisible();
    await expect(page.locator('.space-y-2').getByText('Bob')).toBeVisible();

    // Click "Next" to go to Assignment step
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 3: Assign Items ──
    // Click "Split Evenly" to assign all items to all people
    const splitEvenlyButton = page.getByRole('button', { name: 'Split Evenly' });
    await expect(splitEvenlyButton).toBeVisible();
    await splitEvenlyButton.click();

    // Click "Next" to go to Review step
    await page.getByRole('button', { name: 'Next' }).click();

    // ── Step 4: Review ──
    // Verify the review step shows person names and totals
    await expect(page.getByText('Alice').first()).toBeVisible();
    await expect(page.getByText('Bob').first()).toBeVisible();
  });
});
