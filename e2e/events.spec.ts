import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

/**
 * Helper to add a member by email invite in the AddAppUserDialog.
 * The dialog must already be open.
 */
async function addMemberByEmail(page: import('@playwright/test').Page, email: string) {
  // Type the email in the search input
  const searchInput = page.getByPlaceholder('Name, @username, or email...');
  await searchInput.fill(email);

  // Wait for the "Invite" button to appear (debounce + no results → email invite UI)
  const inviteButton = page.getByRole('button', { name: 'Invite' });
  await inviteButton.waitFor({ state: 'visible', timeout: 10000 });
  await inviteButton.click();
}

test.describe('Event Management', () => {
  test('creates an event and views the event detail page', async ({ page }) => {
    await loginAsTestUser(page);

    // Navigate to events page
    await page.goto('/events');
    await expect(page.getByRole('heading', { name: 'Your Events' })).toBeVisible();

    // Should show empty state initially (for new emulator user)
    await expect(page.getByText('No events yet')).toBeVisible();

    // Click "Create Event" button in the empty state card
    await page.getByRole('button', { name: 'Create Event' }).click();

    // The CreateEventDialog should be open
    await expect(page.getByRole('heading', { name: 'Create New Event' })).toBeVisible();

    // Fill in event name
    await page.locator('#event-name').fill('Vegas Weekend');

    // Fill in description
    await page.locator('#description').fill('Annual Vegas trip with the crew');

    // Add a member by email (required before creating)
    await page.getByRole('button', { name: 'Add Member' }).click();
    await expect(page.getByRole('heading', { name: 'Add Member' })).toBeVisible();
    await addMemberByEmail(page, 'friend@example.com');

    // Verify member was added to the list
    await expect(page.getByText('friend@example.com')).toBeVisible();

    // Click "Create Event" button in the dialog footer
    await page.getByRole('button', { name: 'Create Event' }).click();

    // Wait for navigation to event detail page
    await page.waitForURL(/\/events\//, { timeout: 15000 });

    // Verify event detail page shows the event name
    await expect(page.getByText('Vegas Weekend').first()).toBeVisible();
  });

  test('creates an event via the + icon button in header', async ({ page }) => {
    await loginAsTestUser(page);
    await page.goto('/events');

    await expect(page.getByRole('heading', { name: 'Your Events' })).toBeVisible();

    // Click the round + icon button in the events header (rounded-full distinguishes it)
    const plusButton = page.locator('button.rounded-full').filter({ has: page.locator('.lucide-plus') });
    await plusButton.click();

    // Wait for dialog to appear
    await expect(page.getByRole('heading', { name: 'Create New Event' })).toBeVisible({ timeout: 5000 });

    await page.locator('#event-name').fill('Ski Trip 2026');

    // Add a member by email (required before creating)
    await page.getByRole('button', { name: 'Add Member' }).click();
    await expect(page.getByRole('heading', { name: 'Add Member' })).toBeVisible();
    await addMemberByEmail(page, 'skibuddy@example.com');

    // Verify member appeared
    await expect(page.getByText('skibuddy@example.com')).toBeVisible();

    // Create the event
    await page.getByRole('button', { name: 'Create Event' }).click();

    // Should navigate to event detail
    await page.waitForURL(/\/events\//, { timeout: 15000 });
    await expect(page.getByText('Ski Trip 2026').first()).toBeVisible();
  });
});
