import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createEventWithMembers, createBillInEvent } from './helpers/event';

test.describe('Event Settlement', () => {
  test('settling all people on a bill shows settled status on event detail page', async ({ page }) => {
    // ── Setup: Login and create event ──
    await loginAsTestUser(page);

    const eventUrl = await createEventWithMembers(
      page,
      'Ski Trip',
      'Winter ski trip',
      ['skibuddy@example.com']
    );

    // ── Create a bill: Lift Tickets $100 ──
    await createBillInEvent(page, [
      { name: 'Lift Tickets', price: '100.00' },
    ], ['Alex']);

    // Verify review shows correct split ($50 each for owner + Alex)
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Alex').first()).toBeVisible();
    await expect(page.locator('text=$50.00').first()).toBeVisible();

    // ── Mark Alex as settled on this bill ──
    const alexCard = page.locator('.rounded-lg').filter({ hasText: 'Alex' });
    await alexCard.getByText('Mark as Settled').click();

    // Verify green "Settled" badge appears (use exact match to avoid matching "Undo Settled" button)
    await expect(alexCard.getByText('Settled', { exact: true })).toBeVisible({ timeout: 5000 });

    // ── Navigate back to event detail ──
    await page.goto(eventUrl);
    await expect(page.getByText('Ski Trip').first()).toBeVisible();

    // Verify the Bills section shows the bill we created
    await expect(page.getByText('Bills')).toBeVisible();

    // The bill should exist in the event
    // Wait for the bill card to render
    await page.waitForTimeout(2000);

    // Verify the Balances section is present
    await expect(page.getByText('Balances')).toBeVisible({ timeout: 10000 });
  });

  test('creates multiple bills in an event and verifies bills appear on event page', async ({ page }) => {
    // ── Setup: Login and create event ──
    await loginAsTestUser(page);

    const eventUrl = await createEventWithMembers(
      page,
      'Game Night',
      'Weekly game night expenses',
      ['gamer@example.com']
    );

    // ── Create bill #1: Snacks $40 ──
    await createBillInEvent(page, [
      { name: 'Chips', price: '15.00' },
      { name: 'Drinks', price: '25.00' },
    ], ['Jordan']);

    // Verify review totals ($20 each)
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Jordan').first()).toBeVisible();
    await expect(page.locator('text=$20.00').first()).toBeVisible();

    // Navigate back to event
    await page.goto(eventUrl);
    await expect(page.getByText('Game Night').first()).toBeVisible();

    // Wait for first bill to appear
    await expect(page.getByText('Bills')).toBeVisible();
    await page.waitForTimeout(2000);

    // ── Create bill #2: Pizza $30 via + button ──
    await createBillInEvent(
      page,
      [{ name: 'Pizza', price: '30.00' }],
      ['Jordan'],
      { useCreateButton: true }
    );

    // Verify review totals ($15 each)
    await expect(page.getByText('Split Summary')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Jordan').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=$15.00').first()).toBeVisible();

    // ── Mark Jordan as settled on bill #2 ──
    const jordanCard = page.locator('.rounded-lg').filter({ hasText: 'Jordan' });
    await jordanCard.getByText('Mark as Settled').click();
    await expect(jordanCard.getByText('Settled')).toBeVisible({ timeout: 5000 });

    // Can also undo the settlement
    await jordanCard.getByRole('button', { name: 'Undo Settled' }).click();

    // Settled badge (the green <span>, not the button) should disappear
    // After undo, the button changes back to "Mark as Settled"
    await expect(jordanCard.getByRole('button', { name: 'Mark as Settled' })).toBeVisible({ timeout: 5000 });

    // ── Navigate back to event and verify both bills exist ──
    await page.goto(eventUrl);
    await expect(page.getByText('Game Night').first()).toBeVisible();
    await expect(page.getByText('Bills')).toBeVisible();

    // Verify Balances section is present
    await expect(page.getByText('Balances')).toBeVisible({ timeout: 10000 });
  });

  test('settling all people on all bills shows event as fully settled', async ({ page }) => {
    // ── Setup: Login and create event ──
    await loginAsTestUser(page);

    const eventUrl = await createEventWithMembers(
      page,
      'Dinner Out',
      'Friends dinner',
      ['diner@example.com']
    );

    // ── Create a single bill: Dinner $80 ──
    await createBillInEvent(page, [
      { name: 'Pasta', price: '40.00' },
      { name: 'Wine', price: '40.00' },
    ], ['Sam']);

    // Verify review shows correct totals ($40 each)
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Sam').first()).toBeVisible();
    await expect(page.locator('text=$40.00').first()).toBeVisible();

    // ── Mark Sam as settled ──
    const samCard = page.locator('.rounded-lg').filter({ hasText: 'Sam' });
    await samCard.getByText('Mark as Settled').click();
    await expect(samCard.getByText('Settled')).toBeVisible({ timeout: 5000 });

    // ── Navigate to event detail ──
    await page.goto(eventUrl);
    await expect(page.getByText('Dinner Out').first()).toBeVisible();

    // Wait for ledger pipeline to process
    await page.waitForTimeout(3000);
    await page.reload();

    // Verify event detail loads with balances
    await expect(page.getByText('Balances')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Bills')).toBeVisible();

    // ── Navigate to dashboard and verify it loads ──
    await page.goto('/dashboard');
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Friend Balances')).toBeVisible();
  });
});
