import { Page, expect } from '@playwright/test';

export interface BillItem {
  name: string;
  price: string;
}

/**
 * Creates a standard bill from the dashboard.
 * Handles both empty state ("Standard" button) and
 * existing bills ("Create a bill" → "New Bill" dialog flow).
 * Waits for the /bill/ URL to load.
 */
export async function createStandardBill(page: Page) {
  // Empty state shows a compact "Standard" button after isLoadingSessions resolves.
  // Give it 45s since the Firestore emulator can be slow on cold starts.
  const standardBillBtn = page.getByRole('button', { name: 'Standard' });
  const createBillBtn = page.getByRole('button', { name: 'Create a bill' });

  if (await standardBillBtn.isVisible({ timeout: 45000 }).catch(() => false)) {
    await standardBillBtn.click();
  } else {
    await createBillBtn.click();
    await page.getByText('New Bill').click();
  }

  await page.waitForURL(/\/bill\//, { timeout: 20000 });
}

/**
 * Adds items to a bill using the Add Item button and table row form.
 * Must be on the Bill Entry step.
 */
export async function addItemsToBill(page: Page, items: BillItem[]) {
  for (const item of items) {
    const addItemBtn = page.getByRole('button', { name: 'Add Item' });
    // Scroll into view to avoid sticky header interception
    await addItemBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    await addItemBtn.click();
    const addRow = page.locator('tr').filter({ has: page.getByPlaceholder('Enter item name') });
    await addRow.getByPlaceholder('Enter item name').fill(item.name);
    await addRow.getByPlaceholder('0.00').fill(item.price);
    await addRow.getByPlaceholder('0.00').press('Enter');

    // Verify item appears
    await expect(page.getByRole('cell', { name: item.name })).toBeVisible();
  }
}

/**
 * Adds guest people to a bill using the AddPersonDialog.
 * Must be on the People step.
 * Opens the "Add Person" dialog, fills in the name, and submits.
 */
export async function addGuestPeopleToBill(page: Page, names: string[]) {
  for (const name of names) {
    // Open the Add Person dialog
    await page.getByRole('button', { name: 'Add Person' }).click();
    // Fill in the name field
    await page.getByPlaceholder('Name').fill(name);
    // Submit
    await page.getByRole('button', { name: 'Add Guest to Bill' }).click();
    // Verify the person was added
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Clicks Split Evenly on the Assignment step, then Next to go to Review.
 */
export async function splitEvenlyAndGoToReview(page: Page) {
  const splitEvenlyButton = page.getByRole('button', { name: 'Split Evenly' });
  await expect(splitEvenlyButton).toBeVisible();
  await splitEvenlyButton.click();

  await page.getByRole('button', { name: 'Next' }).click();
}

/**
 * Adds a saved friend to a bill via the "Friends" dialog on the People step.
 * Opens the dialog, finds the friend by name, clicks "Add", dialog auto-closes.
 */
export async function addFriendToBill(page: Page, friendName: string) {
  await page.getByRole('button', { name: 'Friends' }).click();
  await expect(page.getByRole('heading', { name: 'Add from Friends' })).toBeVisible();

  // Each friend row has their name and an "Add" button
  const friendRow = page.locator('.rounded-lg').filter({ hasText: friendName });
  await friendRow.getByRole('button', { name: 'Add' }).click();

  // Dialog closes automatically after adding
}

/**
 * Full bill wizard flow from Bill Entry through Review.
 * Starts from the bill page (/bill/:id), ends on the Review step.
 */
export async function completeBillWizard(
  page: Page,
  items: BillItem[],
  guestNames: string[]
) {
  // Step 1: Bill Entry — add items
  await addItemsToBill(page, items);

  // Go to People step
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: People — add guests
  await addGuestPeopleToBill(page, guestNames);

  // Go to Assignment step
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: Assignment — split evenly, go to Review
  await splitEvenlyAndGoToReview(page);
}
