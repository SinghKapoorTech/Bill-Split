/**
 * Shared ledger calculation logic.
 * Pure functions used by both the client app and Cloud Functions.
 * No Firebase, no browser APIs — just math.
 */

import type { PersonTotal } from './types.js';

/**
 * Normalizes "user-{uid}" format to a raw Firebase UID.
 * If the ID doesn't have the prefix, returns it as-is.
 */
export function personIdToFirebaseUid(personId: string): string {
  return personId.startsWith('user-') ? personId.slice(5) : personId;
}

/**
 * Returns the sorted deterministic document ID for a friend-balance pair.
 * Always produces the same ID regardless of argument order.
 */
export function getFriendBalanceId(userId1: string, userId2: string): string {
  return [userId1, userId2].sort().join('_');
}

/**
 * Returns the deterministic document ID for an event pair balance.
 * Format: "{eventId}_{sortedUid1}_{sortedUid2}"
 */
export function getEventBalanceId(eventId: string, uid1: string, uid2: string): string {
  return `${eventId}_${[uid1, uid2].sort().join('_')}`;
}

/**
 * Input for calculating the friend ledger footprint of a bill.
 */
export interface FriendFootprintInput {
  /** All people in the bill */
  people: { id: string }[];
  /** Calculated totals per person */
  personTotals: PersonTotal[];
  /** Person IDs who have been marked as settled */
  settledPersonIds: string[];
  /** Set of Firebase UIDs that are linked friends (resolvable to balance docs) */
  linkedFriendUids: Set<string>;
  /** Firebase UID of the bill owner (kept for context, but no longer the balance anchor) */
  ownerId: string;
  /** Firebase UID of the person who paid (paidById || ownerId) - this is the new anchor */
  creditorId: string;
}

/**
 * Calculates the friend ledger footprint for a bill.
 * Returns a Record<debtorUid, amountOwed> representing what each linked friend
 * owes to the creditor. (A positive amount means they owe the creditor).
 *
 * This is a pure function — no Firestore, no side effects.
 */
export function calculateFriendFootprint(input: FriendFootprintInput): Record<string, number> {
  const { people, personTotals, settledPersonIds, linkedFriendUids, creditorId } = input;

  const creditorFirebaseUid = personIdToFirebaseUid(creditorId);

  // Map bill-local person ID → raw Firebase UID (or null if not linked)
  const personIdToUserId: Record<string, string | null> = {};
  for (const person of people) {
    const uid = personIdToFirebaseUid(person.id);
    personIdToUserId[person.id] = linkedFriendUids.has(uid) ? uid : null;
  }

  const footprint: Record<string, number> = {};

  for (const total of personTotals) {
    const firebaseUid = personIdToFirebaseUid(total.personId);
    const friendUserId = personIdToUserId[total.personId] ?? null;
    
    if (!friendUserId) continue; // skip unlinked people
    if (firebaseUid === creditorFirebaseUid) continue; // creditor doesn't owe themselves

    const amountOwed = settledPersonIds.includes(total.personId) ? 0 : total.total;
    // Only record if they owe money (amountOwed > 0 matches previous behavior for debtors)
    if (amountOwed >= 0) {
      footprint[friendUserId] = amountOwed;
    }
  }

  return footprint;
}

/**
 * Converts an anchor-relative amount to the single-balance sign convention
 * used in friend_balances documents.
 *
 * Sign convention:
 *   balance > 0  →  participants[0] (alphabetically smaller UID) is owed money
 *   balance < 0  →  participants[1] (alphabetically larger UID) is owed money
 *
 * @param anchorId - Firebase UID of the anchor (the creditor)
 * @param otherId - Firebase UID of the other person (the debtor)
 * @param amountOwedToAnchor - How much the other person owes the anchor
 */
export function toSingleBalance(
  anchorId: string,
  otherId: string,
  amountOwedToAnchor: number
): number {
  // If anchor sorts first, anchor being owed = positive balance
  // If anchor sorts second, anchor being owed = negative balance
  return anchorId < otherId ? amountOwedToAnchor : -amountOwedToAnchor;
}
