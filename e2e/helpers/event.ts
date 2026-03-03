import { Page, expect } from '@playwright/test';
import { BillItem, addItemsToBill, addGuestPeopleToBill, splitEvenlyAndGoToReview } from './bill';

/**
 * Adds a member by email invite in the AddAppUserDialog.
 * The CreateEventDialog must already be open.
 * Note: Email invites go to pendingInvites, NOT memberIds —
 * invited users won't be pre-populated in bills.
 */
async function addMemberByEmail(page: Page, email: string) {
  await page.getByRole('button', { name: 'Add Member' }).click();
  await expect(page.getByRole('heading', { name: 'Add Member' })).toBeVisible();

  const searchInput = page.getByPlaceholder('Name, @username, or email...');
  await searchInput.fill(email);

  // Wait for the "Invite" button (debounce + search → no results → email invite UI)
  const inviteButton = page.getByRole('button', { name: 'Invite' });
  await inviteButton.waitFor({ state: 'visible', timeout: 10000 });
  await inviteButton.click();
}

/**
 * Adds a member by searching for them by username in the AddAppUserDialog.
 * The CreateEventDialog must already be open.
 * This adds the user to memberIds (not pendingInvites), so they'll be
 * pre-populated in event bills with their real Firebase UID.
 */
async function addMemberByUsername(page: Page, username: string, displayName: string) {
  await page.getByRole('button', { name: 'Add Member' }).click();
  await expect(page.getByRole('heading', { name: 'Add Member' })).toBeVisible();

  const searchInput = page.getByPlaceholder('Name, @username, or email...');
  await searchInput.fill(username);

  // Wait for search results (500ms debounce + query)
  const userResult = page.locator('button').filter({ hasText: displayName });
  await userResult.waitFor({ state: 'visible', timeout: 10000 });
  await userResult.click();

  // Dialog auto-closes after selecting
}

export type MemberInput =
  | string                                          // email invite (legacy)
  | { username: string; displayName: string };      // username search (adds to memberIds)

/**
 * Creates an event with members from the /events page.
 * Navigates to event detail page after creation.
 * Returns the event URL for later navigation.
 *
 * Members can be:
 *  - A string (email) → invited via email (goes to pendingInvites)
 *  - An object { username, displayName } → searched by username (goes to memberIds,
 *    so they'll be pre-populated in event bills with their real Firebase UID)
 */
export async function createEventWithMembers(
  page: Page,
  name: string,
  description: string,
  members: MemberInput[]
) {
  await page.goto('/events');
  await expect(page.getByRole('heading', { name: 'Your Events' })).toBeVisible({ timeout: 10000 });

  // Click Create Event (empty state or + button)
  const createButton = page.getByRole('button', { name: 'Create Event' });
  if (await createButton.isVisible()) {
    await createButton.click();
  } else {
    const plusButton = page.locator('button.rounded-full').filter({ has: page.locator('.lucide-plus') });
    await plusButton.click();
  }

  await expect(page.getByRole('heading', { name: 'Create New Event' })).toBeVisible();

  // Fill event details
  await page.locator('#event-name').fill(name);
  if (description) {
    await page.locator('#description').fill(description);
  }

  // Add members
  for (const member of members) {
    if (typeof member === 'string') {
      // Legacy: email invite
      await addMemberByEmail(page, member);
      await expect(page.getByText(member)).toBeVisible();
    } else {
      // Username search: adds with real UID
      await addMemberByUsername(page, member.username, member.displayName);
      await expect(page.getByText(member.displayName)).toBeVisible();
    }
  }

  // Create the event
  await page.getByRole('button', { name: 'Create Event' }).click();

  // Wait for navigation to event detail
  await page.waitForURL(/\/events\//, { timeout: 15000 });

  // Verify event name is visible
  await expect(page.getByText(name).first()).toBeVisible();

  // Return the event detail URL for later navigation
  return page.url();
}

/**
 * Creates a bill from an event's detail page using "Start First Bill" or the + button.
 * Assumes we're on the event detail page.
 * Navigates through the full bill wizard and returns to event detail.
 *
 * @param page - Playwright page
 * @param items - Bill items to add
 * @param guestNames - Guest people to add (owner is auto-populated from event)
 * @param options - Optional: useCreateButton to use the + button instead of "Start First Bill"
 */
export async function createBillInEvent(
  page: Page,
  items: BillItem[],
  guestNames: string[],
  options?: { useCreateButton?: boolean }
) {
  const eventUrl = page.url();

  if (options?.useCreateButton) {
    // Use the + button in event header → opens CreateOptionsDialog
    const plusButton = page.locator('button.rounded-full').filter({ has: page.locator('.lucide-plus') });
    await plusButton.click();

    // Click "New Bill" option in the dialog
    await page.getByText('New Bill').click();
  } else {
    // Click "Start First Bill" in empty state
    await page.getByText('Start First Bill').click();
  }

  // Wait for bill page to load
  await page.waitForURL(/\/bill\//, { timeout: 15000 });

  // Step 1: Bill Entry — add items
  await addItemsToBill(page, items);

  // Go to People step
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 2: People — add guests (owner already pre-populated from event)
  await addGuestPeopleToBill(page, guestNames);

  // Go to Assignment step
  await page.getByRole('button', { name: 'Next' }).click();

  // Step 3: Assignment — split evenly
  await splitEvenlyAndGoToReview(page);

  // Now on Review step — return so the test can verify and interact
}
