/**
 * Shared ledger calculation logic.
 * Pure functions used by both the client app and Cloud Functions.
 * No Firebase, no browser APIs — just math.
 */

import type { PersonTotal } from './types.js';

/**
 * Threshold below which a balance is considered zero.
 * Sub-cent amounts are rounding noise and should not create balance entries
 * or block settlements. Used consistently across ledger pipeline and settlement processors.
 */
export const BALANCE_THRESHOLD = 0.005;

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
    // D-03: record on FINITENESS, not sign. The old `amountOwed >= 0` dropped a
    // negative total from the footprint entirely; on the next edit computeDeltas
    // sees the key vanish and reverses the prior amount, destroying value.
    // toSingleBalance carries the sign correctly, so a negative is representable.
    //
    // That predicate was also, by accident, the only NaN filter in the ledger
    // path (`NaN >= 0` is false) — but NOT an Infinity filter (`Infinity >= 0`
    // is true). C-01 (`validateBillAmounts`, enforced in processLedgerWrite and
    // createBillCore) is now the real gate; this check is the last line of
    // defence keeping a non-finite value out of a balance doc, where it would
    // brick the pair permanently.
    if (Number.isFinite(amountOwed)) {
      footprint[friendUserId] = amountOwed;
    }
  }

  return footprint;
}

/**
 * Returns true only when `a` and `b` form a writable balance pair.
 *
 * A pair is writable iff:
 * - `a !== b` (no self-pair)
 * - Both are non-empty strings
 * - Neither is the literal `"anonymous"`
 * - Neither starts with `"user-"`, `"guest-"`, or `"person-"` (those are
 *   bill-local person IDs, not raw Firebase UIDs)
 */
export function isWritableBalancePair(a: string, b: string): boolean {
  if (a === b) return false;
  const INVALID_PREFIXES = ['user-', 'guest-', 'person-'];
  const isValidUid = (id: string): boolean => {
    if (!id || id === 'anonymous') return false;
    return !INVALID_PREFIXES.some((prefix) => id.startsWith(prefix));
  };
  return isValidUid(a) && isValidUid(b);
}

/**
 * Checks whether a balance document satisfies the ledger invariant:
 * a near-zero balance MUST have zero unsettled bills, and a non-zero balance
 * MUST have at least one unsettled bill.
 *
 * Returns true iff the document is consistent.
 */
export function isBalanceSettledConsistent(balance: number, unsettledBillIds: string[]): boolean {
  const isNearZero = Math.abs(balance) < BALANCE_THRESHOLD;
  const hasNoBills = unsettledBillIds.length === 0;
  return isNearZero === hasNoBills;
}

/**
 * Returns a sanitized copy of a footprint, dropping entries that must never be
 * written to a balance doc:
 * - The anchor's own key (the creditor does not owe themselves).
 * - Any key that fails `isWritableBalancePair(anchorId, key)` (self-pairs,
 *   synthetic person IDs, "anonymous", etc.).
 *
 * Does NOT mutate the input.
 */
export function sanitizeFootprint(
  footprint: Record<string, number>,
  anchorId: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(footprint)) {
    if (key === anchorId) continue;
    if (!isWritableBalancePair(anchorId, key)) continue;
    result[key] = value;
  }
  return result;
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
  amountOwedToAnchor: number,
): number {
  // If anchor sorts first, anchor being owed = positive balance
  // If anchor sorts second, anchor being owed = negative balance
  return anchorId < otherId ? amountOwedToAnchor : -amountOwedToAnchor;
}
