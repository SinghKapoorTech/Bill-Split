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

    // Scoped by test id, NOT by placeholder: the bill page has four `0.00`
    // inputs (item price, plus tax/tip/otherFees in BillSummary), and matching
    // on the placeholder raised a strict-mode violation that failed 8 specs.
    const priceInput = page.getByTestId('item-price-input');
    await priceInput.fill(item.price);

    // Confirm the item.
    //
    // Scoped by test id, NOT by role+name. The desktop TABLE layout renders this
    // as an icon-only button with no accessible name, so
    // `getByRole('button', { name: /add$/i })` resolved to ZERO elements and the
    // click hung until the 90s test timeout — it took bill-wizard,
    // bill-settlement (x2) and settle-bill down with it. The card layout's
    // visible "Add" text made the old selector look correct on mobile only.
    const confirmButton = page.getByTestId('item-confirm-button');
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
    // The People step has NO inline name field. PeopleManager.tsx:227 renders
    // "Add a person" / "Add another person", which opens AddPersonDialog; the
    // name input (#manual-name) lives INSIDE that dialog.
    //
    // The previous `getByPlaceholder(/name/i).fill(...)` therefore matched
    // nothing on this step and hung until the 90s test timeout — it was the
    // SECOND rotted selector in this flow, hidden behind the confirm-button one
    // above, and took bill-wizard, bill-settlement (x2) and settle-bill with it.
    //
    // This is the same sequence recurring-bill.spec.ts:36-40 uses, which passes.
    await page.getByRole('button', { name: /add (another person|a person)/i }).click();

    const nameInput = page.locator('#manual-name');
    await nameInput.waitFor({ state: 'visible', timeout: 10000 });
    await nameInput.fill(name);
    // Enter submits a manual add (no venmo/email) and closes the dialog.
    await nameInput.press('Enter');

    // Verify person was added
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Toggles "Split Evenly" and navigates to the Review step.
 * Assumes we're on the Assignment step of the BillWizard.
 */
export async function splitEvenlyAndGoToReview(page: Page) {
  // "Split Evenly" is a BUTTON (BillItemsTable.tsx:81, BillItemCard.tsx:82) —
  // not a switch. The previous locator
  //   getByRole('switch', { name: /split even/i }).or(getByText(/split even/i))
  // found no switch, and the getByText fallback matched BOTH the button and its
  // inner text node — a strict-mode violation that was then silently swallowed
  // by `.isVisible(...).catch(() => false)`. So the toggle was NEVER clicked, no
  // item ever got an assignee, and the wizard's canProceedFromStep(2) ->
  // areAllItemsAssigned() (shared/calculations.ts:153) left "Next" DISABLED —
  // hanging the click below for the full 90s test timeout. That swallowed
  // violation is why this looked like a mysterious disabled button rather than a
  // bad selector: the helper reported nothing at all.
  //
  // Assert visibility FIRST so a future rename fails in 10s with a named
  // locator, instead of hanging for 90s on a click that can never resolve.
  const splitEvenlyBtn = page.getByRole('button', { name: 'Split Evenly' });
  await expect(splitEvenlyBtn).toBeVisible({ timeout: 10000 });
  await splitEvenlyBtn.click();

  // The button relabels itself to "Deselect All" once the split is applied, so
  // this asserts the click actually took effect rather than merely landing.
  await expect(page.getByRole('button', { name: 'Deselect All' })).toBeVisible({
    timeout: 5000,
  });

  // Navigate to Review step. Next is gated on every item having an assignee, so
  // wait for it to become enabled rather than clicking into a disabled button.
  const nextButton = page.getByRole('button', { name: 'Next' });
  await expect(nextButton).toBeEnabled({ timeout: 10000 });
  await nextButton.click();
}
