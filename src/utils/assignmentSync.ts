import { personIdToFirebaseUid } from '@shared/ledgerCalculations';
import type { BillItem, ItemAssignment, Person } from '@/types';

/**
 * Does the split-evenly self-heal need to rewrite `itemAssignments`?
 *
 * Extracted because there were THREE copies of this predicate (BillWizard,
 * AirbnbWizard, SimpleTransactionWizard) and they had already diverged — two
 * compared assignee membership while the third still compared only length.
 * A predicate that decides whether to WRITE must be identical everywhere, for
 * a reason that is not obvious:
 *
 * ── THE TWO-CLIENT FIXPOINT ──
 *
 * `ensureUserInPeople` (src/utils/billCalculations.ts) rewrites **only the
 * viewing user's own** entry from a bare `<uid>` to `user-<uid>`, in place, on
 * every load — and the self-heal persists `itemAssignments` WITHOUT the
 * normalized `people`. So two clients looking at one bill hold different
 * rosters for the same set of humans.
 *
 * If this predicate compares ids as raw strings, each client considers the
 * other's normalization foreign and rewrites the assignees, whose snapshot
 * re-triggers the other client — an unbounded write ping-pong, and every round
 * trip re-fires `ledgerProcessor` because `itemAssignments` is in its
 * RELEVANT_FIELDS. That is a real bug that shipped into review once.
 *
 * Comparing NORMALIZED makes an in-place id rewrite a no-op, which is correct:
 * it is the same human either way. The property that must hold is
 * **a common fixpoint** — after either client writes, neither client wants to
 * write again. `tests/assignmentSync.test.ts` asserts exactly that.
 *
 * Still caught, because these are genuine disagreements rather than
 * normalization artifacts:
 *   - an assignee who is not on the bill at all (a ghost left by a removal),
 *   - a count mismatch (someone added or removed),
 *   - a duplicate assignee (right count, wrong distribution: `['a','a']`
 *     against people `[a, b]` means b owes $0 and a is charged twice).
 */
export function needsAssignmentResync(
  items: BillItem[] | undefined | null,
  itemAssignments: ItemAssignment | undefined | null,
  people: Person[] | undefined | null,
): boolean {
  const roster = people ?? [];
  if (roster.length === 0) return false;

  const assignments = itemAssignments ?? {};
  const peopleUids = roster.map((p) => personIdToFirebaseUid(p.id));
  const peopleUidSet = new Set(peopleUids);

  for (const item of items ?? []) {
    const assigned = assignments[item.id];
    if (!assigned) return true;

    const assignedUids = assigned.map(personIdToFirebaseUid);

    if (assigned.length !== roster.length) return true;
    // Distinct-count: catches duplicates, which length + membership cannot.
    if (new Set(assignedUids).size !== peopleUidSet.size) return true;
    if (assignedUids.some((uid) => !peopleUidSet.has(uid))) return true;
  }

  return false;
}
