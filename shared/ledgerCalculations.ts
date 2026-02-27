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
 * Computes the delta between an old footprint and a new footprint.
 * Returns only non-zero deltas (friends whose balance actually changed).
 */
export function computeFootprintDeltas(
  newFootprint: Record<string, number>,
  previousFootprint: Record<string, number>
): Record<string, number> {
  const allFriendIds = new Set([
    ...Object.keys(previousFootprint),
    ...Object.keys(newFootprint),
  ]);

  const deltas: Record<string, number> = {};

  for (const friendId of allFriendIds) {
    const prevAmount = previousFootprint[friendId] || 0;
    const newAmount = newFootprint[friendId] || 0;
    const delta = newAmount - prevAmount;

    if (Math.abs(delta) > 0.001) {
      deltas[friendId] = delta;
    }
  }

  return deltas;
}

/**
 * Strips zero-value entries from a footprint to produce the processedBalances
 * that gets saved on the bill document.
 */
export function toProcessedBalances(footprint: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [friendId, amount] of Object.entries(footprint)) {
    if (amount !== 0) {
      result[friendId] = amount;
    }
  }
  return result;
}
