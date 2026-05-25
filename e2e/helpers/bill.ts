import { Page, expect } from '@playwright/test';

export interface BillItem {
  name: string;
  price: string;
}

/**
 * Adds items to the bill on the Bill Entry step.
 * Assumes we're already on the Bill Entry step of the BillWizard.
 */
export async function addItemsToBill(page: Page, items: BillItem[]) {
  for (const item of items) {
    // Click "Add Item" button
    const addButton = page.getByRole('button', { name: /add item/i });
    await addButton.click();

    // Fill in item name and price in the add form
    const nameInput = page.getByPlaceholder('Item name');
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill(item.name);

    const priceInput = page.getByPlaceholder('0.00');
    await priceInput.fill(item.price);

    // Confirm the item
    const confirmButton = page.getByRole('button', { name: /add$/i }).or(
      page.getByRole('button', { name: /confirm/i })
    );
    await confirmButton.click();

    // Verify the item was added
    await expect(page.getByText(item.name).first()).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Adds guest people to the bill on the People step.
 * Assumes we're on the People step of the BillWizard.
 */
export async function addGuestPeopleToBill(page: Page, guestNames: string[]) {
  for (const name of guestNames) {
    const nameInput = page.getByPlaceholder(/name/i);
    await nameInput.fill(name);

    // Click the add button (could be "Add" or the + icon)
    const addButton = page.getByRole('button', { name: /^add$/i }).or(
      page.locator('button').filter({ has: page.locator('.lucide-plus') }).first()
    );
    await addButton.click();

    // Verify person was added
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Toggles "Split Evenly" and navigates to the Review step.
 * Assumes we're on the Assignment step of the BillWizard.
 */
export async function splitEvenlyAndGoToReview(page: Page) {
  // Look for the split evenly toggle/switch
  const splitToggle = page.getByRole('switch', { name: /split even/i }).or(
    page.getByText(/split even/i)
  );

  // Click it if it's not already checked
  if (await splitToggle.isVisible({ timeout: 3000 }).catch(() => false)) {
    await splitToggle.click();
  }

  // Navigate to Review step
  await page.getByRole('button', { name: 'Next' }).click();
}
