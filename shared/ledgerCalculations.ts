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
  /** Firebase UID of the bill owner */
  ownerId: string;
  /** Firebase UID of the person who paid (paidById || ownerId) */
  creditorId: string;
}

/**
 * Calculates the friend ledger footprint for a bill.
 * Returns a Record<friendUid, amountOwed> representing what each linked friend
 * owes (positive) or is owed (negative) relative to the bill owner.
 *
 * This is a pure function — no Firestore, no side effects.
 */
export function calculateFriendFootprint(input: FriendFootprintInput): Record<string, number> {
  const { people, personTotals, settledPersonIds, linkedFriendUids, ownerId, creditorId } = input;

  // Map bill-local person ID → raw Firebase UID (or null if not linked)
  const personIdToUserId: Record<string, string | null> = {};
  for (const person of people) {
    const uid = personIdToFirebaseUid(person.id);
    personIdToUserId[person.id] = linkedFriendUids.has(uid) ? uid : null;
  }

  const footprint: Record<string, number> = {};
  const isOwnerCreditor = creditorId === ownerId;
  const creditorFirebaseUid = personIdToFirebaseUid(creditorId);

  // Calculate owner's share (needed when someone else paid)
  const ownerTotalRecord = personTotals.find(pt => personIdToFirebaseUid(pt.personId) === ownerId);
  const ownerAmountOwed = ownerTotalRecord && !settledPersonIds.includes(ownerTotalRecord.personId)
    ? ownerTotalRecord.total
    : 0;

  for (const total of personTotals) {
    const firebaseUid = personIdToFirebaseUid(total.personId);
    const friendUserId = personIdToUserId[total.personId] ?? null;
    if (!friendUserId) continue; // skip unlinked people

    if (isOwnerCreditor) {
      if (firebaseUid === ownerId) continue; // skip self
      const amountOwed = settledPersonIds.includes(total.personId) ? 0 : total.total;
      footprint[friendUserId] = amountOwed;
    } else {
      if (firebaseUid === creditorFirebaseUid) {
        // This friend paid. The owner owes them the owner's share.
        footprint[friendUserId] = -ownerAmountOwed;
      } else if (firebaseUid !== ownerId) {
        // Another friend. They owe the creditor, not the owner.
        footprint[friendUserId] = 0;
      }
    }
  }

  return footprint;
}

/**
 * Converts an owner-relative amount to the single-balance sign convention
 * used in friend_balances documents.
 *
 * Sign convention:
 *   balance > 0  →  participants[0] (alphabetically smaller UID) is owed money
 *   balance < 0  →  participants[1] (alphabetically larger UID) is owed money
 *
 * @param ownerId - Firebase UID of the bill owner (the creditor)
 * @param friendId - Firebase UID of the friend (the debtor)
 * @param amountFriendOwes - How much the friend owes the owner (positive = owes)
 */
export function toSingleBalance(
  ownerId: string,
  friendId: string,
  amountFriendOwes: number
): number {
  // If owner sorts first, owner being owed = positive balance
  // If owner sorts second, owner being owed = negative balance
  return ownerId < friendId ? amountFriendOwes : -amountFriendOwes;
}
