import { Bill, BillData } from '@/types/bill.types';
import { Timestamp } from 'firebase/firestore';

/**
 * Helper to create default bill data for a new session
 */
export function getSessionDefaults(): Partial<Bill> {
  const defaultBillData: BillData = {
    items: [],
    subtotal: 0,
    tax: 0,
    tip: 0,
    total: 0
  };

  return {
    billData: defaultBillData,
    itemAssignments: {},
    people: [],
    customTip: '',
    customTax: '',
    assignmentMode: 'checkboxes',
    splitEvenly: false,
  };
}

/**
 * Helper to create a Bill object from partial session data
 * @param sessionData - Partial bill data from the UI
 * @param userId - Owner's user ID
 * @param userName - Owner's display name
 * @returns Partial Bill object ready to be saved
 */
export function createBillFromSession(
  sessionData: Partial<Bill>,
  userId: string,
  userName: string
): Partial<Bill> {
  const defaults = getSessionDefaults();
  
  return {
    ...defaults,
    ...sessionData,
    billType: 'private',
    ownerId: userId,
    status: 'active',
  };
}

/**
 * Validates that a bill has the required fields
 * @param bill - Bill to validate
 * @returns true if valid, throws error if invalid
 */
export function validateBillData(bill: Partial<Bill>): boolean {
  if (!bill.billData) {
    throw new Error('Bill data is required');
  }

  if (!bill.ownerId) {
    throw new Error('Owner ID is required');
  }

  if (!bill.billType) {
    throw new Error('Bill type is required');
  }

  if (bill.billType === 'group' && !bill.groupId) {
    throw new Error('Group ID is required for group bills');
  }

  return true;
}

/**
 * Checks if a bill is expired based on share code expiration
 * @param bill - Bill to check
 * @returns true if expired, false otherwise
 */
export function isBillShareCodeExpired(bill: Bill): boolean {
  if (!bill.shareCode || !bill.shareCodeExpiresAt) {
    return false;
  }

  return bill.shareCodeExpiresAt.toMillis() < Date.now();
}

/**
 * Gets a human-readable expiration date string
 * @param expiresAt - Timestamp of expiration
 * @returns Formatted date string
 */
export function getExpirationDateString(expiresAt: Timestamp): string {
  const date = expiresAt.toDate();
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}
