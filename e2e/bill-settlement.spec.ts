import { test, expect } from '@playwright/test';
import { loginAsTestUser } from './helpers/auth';
import { createEventWithMembers, createBillInEvent } from './helpers/event';

/**
 * Bill Settlement — Compact Settle Button
 *
 * Creates a bill in an event, then marks one person as settled
 * using the compact "Settle" button in the SplitSummary step.
 * Verifies the green Settled badge appears and the Undo flow works.
 */
test.describe('Bill Settlement', () => {
    test('marks a person as settled and shows the Settled badge', async ({ page }) => {
        await loginAsTestUser(page);

        await createEventWithMembers(page, 'Vegas Trip', 'Weekend trip', ['friend@example.com']);

        // Create bill: $90 split between owner + Charlie = $45 each
        await createBillInEvent(page, [
            { name: 'Dinner', price: '60.00' },
            { name: 'Drinks', price: '30.00' },
        ], ['Charlie']);

        // ── Review Step ──
        await expect(page.getByText('Split Summary')).toBeVisible();
        await expect(page.getByText('Charlie').first()).toBeVisible();
        await expect(page.locator('text=$45.00').first()).toBeVisible();

        // Find Charlie's card in the SplitSummary and click the compact "Settle" button
        // Cards use .rounded-xl in the current UI (PersonCompactRow)
        const charlieCard = page.locator('.rounded-xl').filter({ hasText: 'Charlie' }).first();
        const settleBtn = charlieCard.getByRole('button', { name: 'Settle' });
        await settleBtn.scrollIntoViewIfNeeded();
        await settleBtn.click();

        // Verify the green "Settled" badge appears
        await expect(charlieCard.getByText('Settled')).toBeVisible({ timeout: 5000 });

        // Verify the "Undo Settle" button is now visible
        await expect(charlieCard.getByRole('button', { name: 'Undo Settle' })).toBeVisible();
    });

    test('can undo a settlement on a person', async ({ page }) => {
        await loginAsTestUser(page);

        await createEventWithMembers(page, 'Game Night', 'Friends dinner', ['pal@example.com']);

        // Create bill: $60 split between owner + Sam = $30 each
        await createBillInEvent(page, [
            { name: 'Pizza', price: '60.00' },
        ], ['Sam']);

        await expect(page.getByText('Split Summary')).toBeVisible();

        // Mark Sam as settled
        const samCard = page.locator('.rounded-xl').filter({ hasText: 'Sam' }).first();
        const settleBtn = samCard.getByRole('button', { name: 'Settle' });
        await settleBtn.scrollIntoViewIfNeeded();
        await settleBtn.click();
        await expect(samCard.getByText('Settled')).toBeVisible({ timeout: 5000 });

        // Undo the settlement
        const undoBtn = samCard.getByRole('button', { name: 'Undo Settle' });
        await expect(undoBtn).toBeVisible();
        await undoBtn.click();

        // Settled badge should disappear, Settle button should return
        await expect(samCard.getByText('Settled')).not.toBeVisible({ timeout: 5000 });
        await expect(samCard.getByRole('button', { name: 'Settle' })).toBeVisible();
    });
});
