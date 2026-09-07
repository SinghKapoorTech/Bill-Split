/**
 * reconcileBalances.ts — pure ledger-rebuild core.
 *
 * Rebuilds the authoritative `balances` and `event_balances` aggregates from the
 * source-of-truth bills, so accumulated delta-drift and missing anchors can be
 * repaired. This is the productionized form of scripts/reconcile-balances.mjs —
 * that script encodes the validated algorithm; this file is the pure, testable
 * heart of it.
 *
 * NO Firebase, NO I/O — just math over in-memory bill fixtures. All Firestore
 * reads/writes, eligibility resolution against real user/event docs, and the
 * patch/zero/delete decision live in the cloud-side wrapper
 * (functions/src/reconciliation/reconcileLedger.ts).
 */

import { computeBillPersonTotals } from './calculations.js';
import { validateBillAmounts } from './billAmountValidation.js';
import {
  calculateFriendFootprint,
  getFriendBalanceId,
  getEventBalanceId,
  toSingleBalance,
  isWritableBalancePair,
  personIdToFirebaseUid,
  BALANCE_THRESHOLD,
} from './ledgerCalculations.js';
import type { BillData, ItemAssignment, Person } from './types.js';

/**
 * The subset of a bill document needed to recompute its ledger footprint.
 * Structurally compatible with the Firestore `bills/{billId}` document.
 */
export interface BillLike {
  id: string;
  ownerId: string;
  paidById?: string;
  billData: BillData;
  people: Person[];
  itemAssignments?: ItemAssignment;
  splitEvenly?: boolean;
  settledPersonIds?: string[];
  eventId?: string;
}

/**
 * A rebuilt aggregate for a single balance pair (friend or event).
 * Mirrors the persisted `balances` / `event_balances` doc shape.
 */
export interface PairAgg {
  id: string;
  participants: [string, string];
  balance: number;
  unsettledBillIds: string[];
  /** Present only for event pairs. */
  eventId?: string;
}

export interface RebuildInput {
  bills: BillLike[];
  /** Eligible linked-friend UIDs for a bill (mirrors resolveEligibleFriends). */
  resolveFriendUids: (bill: BillLike) => Set<string>;
  /** Eligible event-participant UIDs for a bill (mirrors resolveEventParticipants). */
  resolveEventUids: (bill: BillLike) => Set<string>;
}

export interface RebuildResult {
  friend: Map<string, PairAgg>;
  event: Map<string, PairAgg>;
}

/**
 * Internal accumulator — collects billIds in a Set to dedupe before we sort
 * them into the final array.
 */
interface PairAcc {
  id: string;
  participants: [string, string];
  balance: number;
  unsettledBillIds: Set<string>;
  eventId?: string;
}

function accumulate(
  map: Map<string, PairAcc>,
  id: string,
  participants: [string, string],
  signedBalance: number,
  billId: string,
  amountOwedToAnchor: number,
  eventId?: string,
): void {
  let entry = map.get(id);
  if (!entry) {
    entry = {
      id,
      participants,
      balance: 0,
      unsettledBillIds: new Set(),
      ...(eventId && { eventId }),
    };
    map.set(id, entry);
  }
  entry.balance += signedBalance;
  // A bill contributes to a pair's unsettled list only when it moves the
  // balance by a meaningful (super-threshold) amount — settled debtors and
  // sub-cent noise are excluded, matching the pipeline's arrayUnion behavior.
  if (Math.abs(amountOwedToAnchor) > BALANCE_THRESHOLD) {
    entry.unsettledBillIds.add(billId);
  }
}

function finalize(map: Map<string, PairAcc>): Map<string, PairAgg> {
  const out = new Map<string, PairAgg>();
  for (const [id, acc] of map) {
    out.set(id, {
      id: acc.id,
      participants: acc.participants,
      // Full precision — matches the live pipeline (balance += delta, never
      // rounded). Rounding happens at the report boundary in reconcileLedger.ts.
      balance: acc.balance,
      unsettledBillIds: [...acc.unsettledBillIds].sort(),
      ...(acc.eventId && { eventId: acc.eventId }),
    });
  }
  return out;
}

/**
 * Rebuilds the friend and event balance aggregates from a list of bills.
 *
 * For each bill:
 *   1. Compute personTotals (computeBillPersonTotals — the shared calc engine).
 *   2. Compute the friend footprint (calculateFriendFootprint) using the
 *      caller-resolved eligible-friend set, with creditorId = paidById||ownerId.
 *   3. For each (debtor, amount) in the footprint, key the pair with
 *      getFriendBalanceId(anchor, debtor) and accumulate the single-balance
 *      contribution via toSingleBalance(anchor, debtor, amount). Pairs that are
 *      not writable (self-pair, synthetic ids, "anonymous") are skipped.
 *   4. If the bill has an eventId, repeat with the event-participant set and
 *      getEventBalanceId.
 *
 * Pure and deterministic: same input → same output. Balances are full-precision
 * (unrounded), matching the live pipeline; callers round only for display.
 */
export function rebuildLedgerFromBills(input: RebuildInput): RebuildResult {
  const { bills, resolveFriendUids, resolveEventUids } = input;

  const friend = new Map<string, PairAcc>();
  const event = new Map<string, PairAcc>();

  for (const bill of bills) {
    const ownerId = personIdToFirebaseUid(bill.ownerId);
    const anchorId = personIdToFirebaseUid(bill.paidById || bill.ownerId);
    const people = bill.people || [];

    // Skip incomplete bills — nothing to attribute.
    if (!bill.billData?.items?.length || !ownerId || people.length === 0) continue;

    // C-01: the reconciler is the repair tool with the widest blast radius —
    // one `dryRun:false` pass can rewrite every balance doc. It MUST refuse the
    // same documents the live pipeline refuses, or it re-applies exactly what
    // the pipeline just declined to write. (D-03 makes this sharp: negatives are
    // now recorded rather than dropped by the old `amountOwed >= 0` predicate.)
    if (validateBillAmounts(bill.billData)) continue;

    const personTotals = computeBillPersonTotals(
      bill.billData,
      people,
      bill.itemAssignments || {},
      Boolean(bill.splitEvenly),
    );

    // ── Friend footprint ──
    const linkedFriendUids = resolveFriendUids(bill);
    const friendFootprint = calculateFriendFootprint({
      people,
      personTotals,
      settledPersonIds: bill.settledPersonIds || [],
      linkedFriendUids,
      ownerId,
      creditorId: anchorId,
    });

    for (const [debtor, amount] of Object.entries(friendFootprint)) {
      if (!isWritableBalancePair(anchorId, debtor)) continue;
      const pairId = getFriendBalanceId(anchorId, debtor);
      accumulate(
        friend,
        pairId,
        [anchorId, debtor].sort() as [string, string],
        toSingleBalance(anchorId, debtor, amount),
        bill.id,
        amount,
      );
    }

    // ── Event footprint (only for event bills) ──
    if (bill.eventId) {
      const eventUids = resolveEventUids(bill);
      const eventFootprint = calculateFriendFootprint({
        people,
        personTotals,
        settledPersonIds: bill.settledPersonIds || [],
        linkedFriendUids: eventUids,
        ownerId,
        creditorId: anchorId,
      });

      for (const [debtor, amount] of Object.entries(eventFootprint)) {
        if (!isWritableBalancePair(anchorId, debtor)) continue;
        const pairId = getEventBalanceId(bill.eventId, anchorId, debtor);
        accumulate(
          event,
          pairId,
          [anchorId, debtor].sort() as [string, string],
          toSingleBalance(anchorId, debtor, amount),
          bill.id,
          amount,
          bill.eventId,
        );
      }
    }
  }

  return { friend: finalize(friend), event: finalize(event) };
}
