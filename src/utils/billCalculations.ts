import { BillData, BillItem, Person } from '@/types';
import { User } from 'firebase/auth';

/**
 * Calculates the total and subtotal for a bill based on items, tax, and tip
 * @param items - Array of bill items
 * @param tax - Tax amount
 * @param tip - Tip amount
 * @returns Object containing subtotal and total
 */
export function calculateBillTotals(
  items: BillItem[],
  tax: number,
  tip: number
): { subtotal: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const total = subtotal + tax + tip;

  return { subtotal, total };
}

/**
 * Merges new bill data with existing bill data
 * Combines items and updates totals appropriately
 * @param existing - Existing bill data
 * @param newData - New bill data to merge
 * @returns Merged bill data
 */
export function mergeBillData(
  existing: BillData,
  newData: BillData
): BillData {
  const mergedItems = [...existing.items, ...newData.items];
  const subtotal = existing.subtotal + newData.subtotal;

  // Keep existing tax and tip if they exist, otherwise use new values
  const tax = existing.tax || newData.tax;
  const tip = existing.tip || newData.tip;

  // Calculate final total
  const total = subtotal + tax + tip;

  return {
    ...existing,
    items: mergedItems,
    subtotal,
    tax,
    tip,
    total,
    // Keep existing restaurant name if available
    restaurantName: existing.restaurantName || newData.restaurantName,
  };
}

/**
 * Generates a unique ID for a bill item
 * @param index - Optional index for additional uniqueness
 * @returns Unique item ID string
 */
export function generateItemId(index?: number): string {
  const timestamp = Date.now();
  return index !== undefined ? `item-${index}-${timestamp}` : `item-${timestamp}`;
}

/**
 * Generates a unique ID for a person
 * @returns Unique person ID string
 */
export function generatePersonId(): string {
  return `person-${Date.now()}`;
}

/**
 * Generates a unique ID for a user (based on their auth UID)
 * @param uid - User's authentication UID
 * @returns Unique user ID string
 */
export function generateUserId(uid: string): string {
  return `user-${uid}`;
}

/**
 * Ensures the logged-in user exists in the people list
 * If the user is logged in and not in the list, adds them at the beginning
 * If the user exists, updates their venmoId if it changed
 * @param people - Current people array
 * @param user - Current authenticated user (or null)
 * @param profile - User profile with venmoId
 * @returns Updated people array with user guaranteed to be present
 */
export function ensureUserInPeople(
  people: Person[],
  user: User | null,
  profile: { venmoId?: string } | null
): Person[] {
  if (!user || !user.displayName) {
    return people;
  }

  const userId = generateUserId(user.uid);
  const userExists = people.some(person => person.id === userId);
  
  if (userExists) {
    // Update venmoId if it changed
    return people.map(person =>
      person.id === userId
        ? { ...person, venmoId: profile?.venmoId }
        : person
    );
  }

  // Add user at the beginning
  const currentUser: Person = {
    id: userId,
    name: user.displayName,
    venmoId: profile?.venmoId,
  };
  
  return [currentUser, ...people];
}
