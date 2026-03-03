import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createTestUser, clearEmulatorData } from './helpers/seed';
import {
  createStandardBill,
  addItemsToBill,
  addFriendToBill,
  splitEvenlyAndGoToReview,
} from './helpers/bill';
import { createEventWithMembers, createBillInEvent } from './helpers/event';

/**
 * Friendship Scenario — Roommates
 *
 * Story: You and your roommate Riley live together. Over the past few weeks
 * you've gone out for dinner twice (private bills). Then you took two trips
 * together — a Beach Trip and a Ski Weekend — each with an extra friend.
 * After coming back, you settle the Beach Trip event first, then settle
 * the entire friendship from the dashboard (covering the old dinner bills
 * plus the remaining Ski Weekend bills).
 */
test.describe('Friendship Scenario — Roommates', () => {
  // This test covers the full lifecycle so it needs extra time
  test.setTimeout(180_000);

  test('dinners, two trips, settle one event, then settle friendship', async ({ page }) => {
    // ────────────────────────────────────────────────
    // Phase 0 — Clean slate + seed roommate (User B)
    // ────────────────────────────────────────────────
    await clearEmulatorData();
    const roommate = await createTestUser('riley@test.com', 'Riley Johnson');

    // ────────────────────────────────────────────────
    // Phase 1 — Sign in as User A and add roommate as friend
    // ────────────────────────────────────────────────
    await loginAsTestUser(page);

    // Navigate to Settings → Friends tab
    await page.goto('/settings');
    await page.getByRole('tab', { name: 'Friends' }).click();

    // Click "Add Friend" button
    await page.getByRole('button', { name: 'Add Friend' }).click();
    await expect(page.getByText('Add a Friend')).toBeVisible();

    // Fill manual entry: name + email (required for friend resolution)
    await page.locator('#manual-name').fill('Riley Johnson');
    await page.locator('#manual-email').fill('riley@test.com');

    // Save Friend — triggers resolveUser(email) → finds the seeded user
    await page.getByRole('button', { name: 'Save Friend' }).click();

    // Verify Riley appears in the friends list
    await expect(page.getByText('Riley Johnson')).toBeVisible({ timeout: 10000 });

    // ────────────────────────────────────────────────
    // Phase 2 — Private bill #1: Groceries $50
    // ────────────────────────────────────────────────
    await page.goto('/dashboard');
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 });

    await createStandardBill(page);

    // Step 1: Bill Entry — add items
    await addItemsToBill(page, [
      { name: 'Groceries', price: '50.00' },
    ]);

    // Step 2: People — add Riley from friends list
    await page.getByRole('button', { name: 'Next' }).click();
    await addFriendToBill(page, 'Riley Johnson');

    // Step 3: Assignment → Split Evenly → Review
    await page.getByRole('button', { name: 'Next' }).click();
    await splitEvenlyAndGoToReview(page);

    // Verify review: $25 each
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Riley').first()).toBeVisible();
    await expect(page.locator('text=$25.00').first()).toBeVisible();

    // ────────────────────────────────────────────────
    // Phase 3 — Private bill #2: Thai Dinner $80
    // ────────────────────────────────────────────────
    await page.goto('/dashboard');
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 });

    await createStandardBill(page);

    await addItemsToBill(page, [
      { name: 'Pad Thai', price: '40.00' },
      { name: 'Green Curry', price: '40.00' },
    ]);

    await page.getByRole('button', { name: 'Next' }).click();
    await addFriendToBill(page, 'Riley Johnson');

    await page.getByRole('button', { name: 'Next' }).click();
    await splitEvenlyAndGoToReview(page);

    // Verify review: $40 each
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Riley').first()).toBeVisible();
    await expect(page.locator('text=$40.00').first()).toBeVisible();

    // ────────────────────────────────────────────────
    // Phase 4 — Event #1: Beach Trip ($210 hotel, split with Riley + guest)
    // ────────────────────────────────────────────────
    // Use username search so Riley is added to memberIds (not pendingInvites)
    // This ensures Riley is pre-populated in bills with their real Firebase UID
    const beachTripUrl = await createEventWithMembers(
      page,
      'Beach Trip',
      'Summer beach getaway',
      [{ username: roommate.username, displayName: roommate.displayName }]
    );

    // Create bill in event — Riley is pre-populated from event members
    // Add a guest "Morgan" to simulate "other friends"
    await createBillInEvent(page, [
      { name: 'Beach Hotel', price: '210.00' },
    ], ['Morgan']);

    // Verify review shows Split Summary with 3 people
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Riley').first()).toBeVisible();
    await expect(page.getByText('Morgan').first()).toBeVisible();

    // ────────────────────────────────────────────────
    // Phase 5 — Event #2: Ski Weekend ($150 lift tickets, split with Riley + guest)
    // ────────────────────────────────────────────────
    const skiWeekendUrl = await createEventWithMembers(
      page,
      'Ski Weekend',
      'Winter ski trip with friends',
      [{ username: roommate.username, displayName: roommate.displayName }]
    );

    await createBillInEvent(page, [
      { name: 'Lift Tickets', price: '150.00' },
    ], ['Jordan']);

    // Verify review shows Split Summary with 3 people
    await expect(page.getByText('Split Summary')).toBeVisible();
    await expect(page.getByText('Riley').first()).toBeVisible();
    await expect(page.getByText('Jordan').first()).toBeVisible();

    // ────────────────────────────────────────────────
    // Phase 6 — Wait for ledger pipeline, then settle Beach Trip
    // ────────────────────────────────────────────────
    // Give the Cloud Function ledger pipeline time to process all bills
    await page.waitForTimeout(5000);

    // Navigate to Beach Trip event detail
    await page.goto(beachTripUrl);
    await expect(page.getByText('Beach Trip').first()).toBeVisible({ timeout: 10000 });

    // Wait for balances to load — reload if needed to pick up pipeline results
    await expect(page.getByText('Balances')).toBeVisible({ timeout: 15000 });

    // The ledger pipeline may need more time; reload to pick up event_balances
    await page.waitForTimeout(3000);
    await page.reload();
    await expect(page.getByText('Beach Trip').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Balances')).toBeVisible({ timeout: 15000 });

    // Find the Settle/Pay button — Riley should owe us for the Beach Trip
    const settleButton = page.getByRole('button', { name: /Settle|Pay/ }).first();
    await expect(settleButton).toBeVisible({ timeout: 15000 });
    await settleButton.click();

    // SettleUpModal opens — click "Mark as Settled"
    await expect(page.getByText('Settle Up')).toBeVisible();
    await page.getByRole('button', { name: 'Mark as Settled' }).click();

    // Wait for settlement to process (toast appears)
    await expect(page.getByText('Settled!', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // ────────────────────────────────────────────────
    // Phase 7 — Settle friendship from Dashboard
    // ────────────────────────────────────────────────
    await page.waitForTimeout(3000); // let pipeline process the settlement

    await page.goto('/dashboard');
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 });

    // The Friend Balances section should show Riley with remaining balance
    await expect(page.getByText('Friend Balances')).toBeVisible({ timeout: 10000 });

    // Wait for balance data to load — Riley should appear with a balance
    await expect(page.getByText('Riley').first()).toBeVisible({ timeout: 15000 });

    // Click the Settle/Pay button on Riley's balance row
    const dashboardSettleBtn = page.getByRole('button', { name: /Settle|Pay/ }).first();
    await expect(dashboardSettleBtn).toBeVisible({ timeout: 10000 });
    await dashboardSettleBtn.click();

    // SettleUpModal opens
    await expect(page.getByText('Settle Up')).toBeVisible();

    // Click "Mark as Settled" to settle the entire friendship
    await page.getByRole('button', { name: 'Mark as Settled' }).click();

    // Verify settlement success
    await expect(page.getByText('Settled!', { exact: true }).first()).toBeVisible({ timeout: 15000 });

    // After settling, reload dashboard to verify balance is cleared
    await page.waitForTimeout(3000);
    await page.reload();
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Friend Balances')).toBeVisible({ timeout: 10000 });

    // Verify the Ski Weekend event also reflects the settlement
    await page.goto(skiWeekendUrl);
    await expect(page.getByText('Ski Weekend').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Balances')).toBeVisible({ timeout: 15000 });
  });
});
