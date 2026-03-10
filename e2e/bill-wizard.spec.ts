import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createEventWithMembers, createBillInEvent } from './helpers/event';

/**
 * Bill Wizard — Full Flow
 *
 * Creates an event bill end-to-end:
 *   Bill Entry → People → Assignment → Review
 *
 * Using an event bill avoids the dashboard `isLoadingSessions` spinner entirely.
 * The event guarantees a clean starting state on every test run.
 */
test.describe('Bill Wizard — Full Flow', () => {
    test('creates a bill with items, guests, and assignment via the full wizard', async ({ page }) => {
        await loginAsTestUser(page);

        // Create a minimal event to host our bill
        await createEventWithMembers(page, 'Dinner Night', 'Test dinner', ['test@example.com']);

        // createBillInEvent goes end-to-end: Entry → People → Assignment → Review
        await createBillInEvent(page, [
            { name: 'Burger', price: '15.00' },
            { name: 'Fries', price: '6.00' },
        ], ['Alice', 'Bob']);

        // ── Review Step — verify people and totals ──
        // Total $21 split among owner + Alice + Bob = $7 each
        await expect(page.getByText('Split Summary')).toBeVisible();
        await expect(page.getByText('Alice').first()).toBeVisible();
        await expect(page.getByText('Bob').first()).toBeVisible();

        // Each person owes $7.00
        await expect(page.locator('text=$7.00').first()).toBeVisible();
    });
});
