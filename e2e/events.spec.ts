import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';

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

    // Click "Create Event" button in the dialog footer
    await page.getByRole('button', { name: 'Create Event' }).last().click();

    // Wait for toast to appear and dismiss, then verify event heading
    await expect(page.getByRole('heading', { name: 'Vegas Weekend' })).toBeVisible({ timeout: 10000 });

    // Click on the event card to navigate to detail view
    await page.getByRole('heading', { name: 'Vegas Weekend' }).click();

    // Should navigate to /events/:id
    await page.waitForURL(/\/events\//, { timeout: 10000 });

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
    await page.getByRole('button', { name: 'Create Event' }).last().click();

    // Verify created
    await expect(page.getByRole('heading', { name: 'Ski Trip 2026' })).toBeVisible({ timeout: 10000 });
  });
});
