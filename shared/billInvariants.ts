/**
 * Bill money invariants — I1..I8 from docs/plans/bill-money-invariants.md.
 *
 * WHY THIS FILE EXISTS: a bill's money is determined by six INDEPENDENT fields
 * (`people`, `itemAssignments`, `billData`, `paidById`, `settledPersonIds`,
 * `splitEvenly`) that must agree, written by ~30 different paths, with the
 * agreement enforced nowhere. Five consecutive review rounds on one data-loss
 * fix each found a different money bug, and every one of them was two of those
 * fields disagreeing. Defending 30 call sites individually is unwinnable; this
 * states the invariant once so it can be checked at the choke points.
 *
 * THE LOAD-BEARING MECHANISM (shared/calculations.ts:26-34):
 *
 *     const splitPrice = item.price / assignedPeople.length;   // RAW length
 *     assignedPeople.forEach((personId) => {
 *       if (personSubtotals[personId] !== undefined) { ... }   // ghost DISCARDED
 *     });
 *
 * An assignee who is not in `people` still takes a share of the divisor and
 * then has that share thrown away. Money leaves the bill silently and the
 * payer absorbs it.
 *
 * Pure — no Firebase, no browser APIs — so both the client choke point
 * (`billService.updateBill`) and the server backstop (`ledgerProcessor`) can
 * use the same definition. Detection only: this module never mutates and never
 * throws. Callers decide what to do, per the failure-policy table in the spec
 * (which is FAIL SAFE: repair or drop a key, never reject a whole payload,
 * because every caller swallows errors and would lose the entire write).
 */

import type { BillData, ItemAssignment, Person } from './types.js';
import { personIdToFirebaseUid } from './ledgerCalculations.js';

/** Money tolerance: one cent. */
export const INVARIANT_EPSILON = 0.01;

export type InvariantCode = 'I1' | 'I2' | 'I3' | 'I4' | 'I5' | 'I6' | 'I7' | 'I8';

export interface InvariantViolation {
  code: InvariantCode;
  /** Human-readable, safe to log. Includes the offending ids/amounts. */
  detail: string;
  /** Ids implicated, where applicable — lets a caller repair precisely. */
  ids?: string[];
}

/**
 * The subset of a bill document the invariants are defined over. Deliberately
 * structural and all-optional: callers pass a stored document, an incoming
 * patch merged onto a stored document, or a partially built draft.
 */
export interface BillInvariantSubject {
  people?: Person[] | null;
  itemAssignments?: ItemAssignment | null;
  billData?: BillData | null;
  paidById?: string | null;
  ownerId?: string | null;
  settledPersonIds?: string[] | null;
  unsettledParticipantIds?: string[] | null;
  isSimpleTransaction?: boolean | null;
  splitEvenly?: boolean | null;
}

const uid = (id: string): string => personIdToFirebaseUid(id);

/**
 * Array fields can arrive as a Firestore FieldValue SENTINEL
 * (`arrayUnion(...)`) — an opaque object, not an array. Callers should strip
 * sentinels first, but this module must NEVER THROW: it runs inside a
 * Firestore transaction on the client and inside the ledger trigger on the
 * server, and an exception in either fails the whole operation. Settling
 * broke outright once on `settled.filter is not a function`. So anything
 * non-array means "nothing to check here".
 */
const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

const sumItemPrices = (billData: BillData | null | undefined): number =>
  asArray<BillData['items'][number]>(billData?.items).reduce(
    (sum, item) => sum + (Number.isFinite(item?.price) ? item.price : 0),
    0,
  );

/**
 * Checks I1..I8 and returns every violation found (not just the first), so a
 * caller can repair in one pass and a test can assert the full set.
 *
 * Returns `[]` for a bill with no people — there is nothing to be inconsistent
 * with yet, and a draft mid-creation legitimately looks like that.
 */
export function checkBillInvariants(bill: BillInvariantSubject): InvariantViolation[] {
  const violations: InvariantViolation[] = [];

  const people = asArray<Person>(bill.people);
  if (people.length === 0) return violations;

  const peopleUids = people.map((p) => uid(p.id));
  const peopleUidSet = new Set(peopleUids);
  const assignments = bill.itemAssignments ?? {};
  const itemsTotal = sumItemPrices(bill.billData);

  // ── I1: every assignee is a person on the bill ──
  // The ghost-assignee leak. Normalized, because `people[].id` mixes
  // `user-<uid>` with bare `<uid>` (59% of production bills carry a bare id)
  // and `ensureUserInPeople` rewrites the viewing user's entry in place.
  const ghosts = new Set<string>();
  for (const [, assignees] of Object.entries(assignments)) {
    for (const a of assignees ?? []) {
      if (!peopleUidSet.has(uid(a))) ghosts.add(a);
    }
  }
  if (ghosts.size > 0) {
    violations.push({
      code: 'I1',
      detail:
        `${ghosts.size} assignee(s) are not on the bill: ` +
        `${[...ghosts].join(', ')}. Their share of each item is divided out ` +
        `and then discarded, so that money is charged to nobody.`,
      ids: [...ghosts],
    });
  }

  // ── I2a: participants are distinct under normalization ──
  if (peopleUidSet.size !== people.length) {
    const seen = new Set<string>();
    const dupes = peopleUids.filter((u) => (seen.has(u) ? true : (seen.add(u), false)));
    violations.push({
      code: 'I2',
      detail:
        `people contains ${people.length - peopleUidSet.size} duplicate ` +
        `participant(s) under normalization: ${[...new Set(dupes)].join(', ')}. ` +
        `calculateFriendFootprint ASSIGNS rather than accumulates, so one of ` +
        `the duplicate's shares is silently dropped.`,
      ids: [...new Set(dupes)],
    });
  }

  // ── I2b: assignees within one item are distinct ──
  // Measured: item $30, {i1:['a','a']}, people [a,b] => a owes $30, b owes $0,
  // with I1 and participant-distinctness both intact.
  for (const [itemId, assignees] of Object.entries(assignments)) {
    const list = assignees ?? [];
    const uids = list.map(uid);
    if (new Set(uids).size !== uids.length) {
      violations.push({
        code: 'I2',
        detail:
          `item ${itemId} lists a duplicate assignee ` +
          `(${list.join(', ')}), which over-charges them and under-charges ` +
          `everyone else on that item.`,
        ids: [itemId],
      });
    }
  }

  // ── I3: the payer is a participant ──
  // A wrong anchor inverts the DIRECTION of every debt on the bill.
  const anchor = bill.paidById ?? bill.ownerId ?? undefined;
  if (anchor) {
    const allowed = new Set(peopleUidSet);
    if (bill.ownerId) allowed.add(uid(bill.ownerId));
    if (!allowed.has(uid(anchor))) {
      violations.push({
        code: 'I3',
        detail:
          `paidById "${anchor}" is not a participant. The ledger anchors on ` +
          `it, so every debt on this bill points the wrong way.`,
        ids: [anchor],
      });
    }
  }

  // ── I4: settled ids, and the second settledness record, are participants ──
  const settled = asArray<string>(bill.settledPersonIds);
  const strayers = settled.filter((s) => !peopleUidSet.has(uid(s)));
  if (strayers.length > 0) {
    violations.push({
      code: 'I4',
      detail:
        `settledPersonIds references ${strayers.length} non-participant(s): ` +
        `${strayers.join(', ')}. Usually an id-FORM mismatch (legacy claimShadowUser ` +
        `writes a bare uid into settledPersonIds but user-<uid> into people), ` +
        `which un-settles a paid debt and lets the pipeline re-create it.`,
      ids: strayers,
    });
  }
  if (Array.isArray(bill.unsettledParticipantIds)) {
    const settledUids = new Set(settled.map(uid));
    const contradictory = bill.unsettledParticipantIds.filter((u) => settledUids.has(uid(u)));
    if (contradictory.length > 0) {
      violations.push({
        code: 'I4',
        detail:
          `${contradictory.length} uid(s) appear in BOTH settledPersonIds and ` +
          `unsettledParticipantIds: ${contradictory.join(', ')}. These are two ` +
          `independent records of settledness and the debtor's UI reads the ` +
          `second one.`,
        ids: contradictory,
      });
    }
  }

  // ── I5 / I6: derived-split coherence (simple transactions only) ──
  // Keyed on `isSimpleTransaction` + `splitEvenly`, NOT on `splitMethod` —
  // which is React state and is persisted nowhere, so no server-side or
  // transactional check could ever evaluate it.
  if (bill.isSimpleTransaction && bill.billData) {
    if (!bill.splitEvenly) {
      const items = bill.billData.items ?? [];
      if (items.length !== peopleUidSet.size) {
        violations.push({
          code: 'I5',
          detail:
            `derived split has ${items.length} item(s) for ` +
            `${peopleUidSet.size} participant(s). One per person is expected, ` +
            `so a share is missing or orphaned.`,
        });
      }
      const multi = items.filter((i) => (assignments[i.id] ?? []).length !== 1);
      if (multi.length > 0) {
        violations.push({
          code: 'I5',
          detail:
            `${multi.length} derived item(s) do not have exactly one ` +
            `assignee: ${multi.map((i) => i.id).join(', ')}.`,
          ids: multi.map((i) => i.id),
        });
      }
    }

    // I6 — the invariant whose ABSENCE caused round 5. A removal rebuilt the
    // items from the new roster but the OLD per-person amount map, so a $30
    // bill persisted items summing to $20 and collected $20. Nothing noticed:
    // validateBillAmounts range-checks each field and never compares the sum.
    const subtotal = bill.billData.subtotal;
    if (Number.isFinite(subtotal) && Math.abs(itemsTotal - subtotal) > INVARIANT_EPSILON) {
      violations.push({
        code: 'I6',
        detail:
          `derived items sum to ${itemsTotal.toFixed(2)} but subtotal is ` +
          `${Number(subtotal).toFixed(2)}. The difference is charged to nobody.`,
      });
    }
  }

  // ── I7: a usable total ──
  // splitEvenly's discount branch treats billData.total as AUTHORITATIVE, so a
  // zero total there makes every person owe $0 and the ledger reverses the
  // whole footprint. validateBillAmounts passes it, because 0 is non-negative.
  if (bill.billData && itemsTotal > 0) {
    const total = bill.billData.total;
    if (!Number.isFinite(total) || (total as number) <= 0) {
      violations.push({
        code: 'I7',
        detail:
          `items sum to ${itemsTotal.toFixed(2)} but billData.total is ` +
          `${String(total)}. Under splitEvenly the total is authoritative, so ` +
          `this collects nothing.`,
      });
    }
  }

  // ── I8: a non-degenerate basis ──
  // Every proportion is `personSubtotal / totalItemsSubtotal`, guarded
  // `> 0 ? ... : 0`. Items [+20, -20] with tax+tip therefore collect $0.00
  // against a $5.00 declared total — tax and tip charged to nobody.
  const anyAssigned = Object.values(assignments).some((a) => (a ?? []).length > 0);
  if (anyAssigned && itemsTotal <= 0) {
    violations.push({
      code: 'I8',
      detail:
        `items are assigned but their prices sum to ${itemsTotal.toFixed(2)}. ` +
        `Every proportion collapses to zero, so tax, tip and fees are charged ` +
        `to nobody.`,
    });
  }

  return violations;
}

/** Convenience: does this bill satisfy every invariant? */
export function isBillConsistent(bill: BillInvariantSubject): boolean {
  return checkBillInvariants(bill).length === 0;
}

/** Groups violations by code, for logging without dumping a whole document. */
export function summarizeViolations(violations: InvariantViolation[]): string {
  if (violations.length === 0) return 'none';
  return violations.map((v) => `${v.code}: ${v.detail}`).join(' | ');
}
