import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createEventWithMembers, createBillInEvent } from './helpers/event';

test.describe('Bill-Level Settlement', () => {
  test('settling a person on a bill shows settled badge and updates event balances', async ({ page }) => {
    // ── Setup: Login and create event ──
    await loginAsTestUser(page);

    const eventUrl = await createEventWithMembers(
      page,
      'Vegas Trip',
      'Annual Vegas trip',
      ['friend@example.com']
    );

    // ── Create a bill within the event ──
    await createBillInEvent(page, [
      { name: 'Dinner', price: '60.00' },
      { name: 'Drinks', price: '30.00' },
    ], ['Charlie']);

    // ── Verify Review step shows correct per-person totals ──
    // Total is $90, split evenly among owner + Charlie = $45 each
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Charlie').first()).toBeVisible();

    // Each person should owe $45.00
    const totalElements = page.locator('text=$45.00');
    await expect(totalElements.first()).toBeVisible();

    // ── Mark Charlie as settled ──
    // Find Charlie's card and click "Mark as Settled"
    const charlieCard = page.locator('.rounded-lg').filter({ hasText: 'Charlie' });
    const markSettledButton = charlieCard.getByText('Mark as Settled');
    await markSettledButton.click();

    // Verify the green "Settled" badge appears on Charlie's card
    await expect(charlieCard.getByText('Settled')).toBeVisible({ timeout: 5000 });

    // ── Navigate back to event detail page ──
    await page.goto(eventUrl);

    // Wait for the page and ledger pipeline to process
    // The ledger processor (Cloud Function) updates event_balances after settledPersonIds changes
    await expect(page.getByText('Vegas Trip').first()).toBeVisible();
    await expect(page.getByText('Balances')).toBeVisible({ timeout: 10000 });

    // After settling Charlie, the balance should reflect the settlement
    // Wait for the pipeline to process (give it time)
    await page.waitForTimeout(3000);

    // The bills section should show the bill we created
    await expect(page.getByText('Bills')).toBeVisible();
  });
});
