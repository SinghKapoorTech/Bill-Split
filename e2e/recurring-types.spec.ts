import { test, expect } from "@playwright/test";
import { loginAsTestUser } from "./helpers/auth";

// Add an item via the desktop item table: Add Item → name → price → Enter.
// Scope the price input to the editing row (the bill summary's tax/tip/fees
// inputs also use the "0.00" placeholder).
async function addItem(page, name: string, price: string) {
  await page.getByRole("button", { name: "Add Item" }).click();
  const nameInput = page.getByPlaceholder("Enter item name");
  await nameInput.fill(name);
  const editingRow = page.locator("tr").filter({ has: nameInput });
  const priceInput = editingRow.getByRole("spinbutton");
  await priceInput.fill(price);
  await priceInput.press("Enter");
  // Once committed the row shows the formatted price as plain text.
  await expect(page.getByRole("cell", { name: `$${price}` })).toBeVisible({
    timeout: 5000,
  });
}

/**
 * Recurring bill types: a new recurring template can be Quick or Detailed.
 * Airbnb is no longer offered for new templates — the type is retired from the
 * Type step, though pre-existing 'airbnb' templates stay editable and keep
 * generating. Verifies the Type step plus the Detailed path end to end: the
 * created template shows up on the Bills page tagged with its type and opens
 * its /recurring/:id detail page.
 */

// Add a guest via the People-step "Add another person" dialog (works for both
// the simple and bill-wizard PeopleStep, which share AddPersonDialog).
async function addGuest(page, name: string) {
  await page
    .getByRole("button", { name: /add (another person|a person)/i })
    .click();
  const nameInput = page.locator("#manual-name");
  await nameInput.waitFor({ state: "visible", timeout: 10000 });
  await nameInput.fill(name);
  await nameInput.press("Enter");
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 5000 });
}

test.describe("Recurring bill types", () => {
  test("Type step offers Quick / Detailed and no longer Airbnb", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await page.goto("/recurring/new");
    await page.waitForURL(/\/recurring\/new/, { timeout: 15000 });

    await expect(
      page.getByRole("button", { name: /quick expense/i }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: /detailed bill/i }),
    ).toBeVisible();
    // Airbnb / House is retired as a choice for new recurring templates.
    await expect(
      page.getByRole("button", { name: /airbnb|house/i }),
    ).toHaveCount(0);
  });

  test("creates a Detailed recurring bill that appears on the Bills page", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await page.goto("/recurring/new");
    await page.waitForURL(/\/recurring\/new/, { timeout: 15000 });

    // Type → Detailed
    await page.getByRole("button", { name: /detailed bill/i }).click();

    // Title comes from the hero input
    await page.getByPlaceholder("Recurring Expense").fill("Monthly Supplies");

    // Items step (manual)
    await addItem(page, "Paper", "10.00");
    await addItem(page, "Ink", "20.00");
    await page.getByRole("button", { name: "Next" }).click();

    // People step → add a guest
    await addGuest(page, "Coworker");
    await page.getByRole("button", { name: "Next" }).click();

    // Assignment step → "Split Evenly" assigns everyone to every item
    await page.getByRole("button", { name: "Split Evenly" }).click();
    await expect(page.getByRole("button", { name: "Next" })).toBeEnabled({
      timeout: 5000,
    });
    await page.getByRole("button", { name: "Next" }).click();

    // Schedule step (Monthly default) → Next
    await expect(page.getByText("Monthly")).toBeVisible({ timeout: 10000 });
    await page.getByRole("button", { name: "Next" }).click();

    // Review → Create
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });

    // Bills page shows it, tagged Detailed
    await page.goto("/bills");
    await page.waitForURL(/\/bills/, { timeout: 15000 });
    const row = page.getByText("Monthly Supplies");
    await expect(row.first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Detailed/).first()).toBeVisible();

    // Opens its recurring detail page
    await row.first().click();
    await page.waitForURL(/\/recurring\/(?!new$)[^/]+$/, { timeout: 15000 });
  });
});
