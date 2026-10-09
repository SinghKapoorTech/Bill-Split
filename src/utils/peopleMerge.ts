import { ItemAssignment, Person } from "@/types";

/**
 * Appends newly-added people to the current array, skipping anyone already
 * present.
 *
 * Deduplicates against `current` AND within `added` itself. The second half
 * matters: additions can now be BATCHED (a queue flush, a squad add), and a
 * batch can legitimately contain the same id twice — `addPerson` clears the
 * name field only after its `resolveShadowUserByName` await, so a double-tap
 * resolves to the same shadow id twice. Writing that person twice is a money
 * bug, not a cosmetic one: split-evenly would divide each item three ways for
 * two people, and `calculatePersonTotals` emits one row per entry, so the
 * duplicate is double-counted in the review total and in the ledger footprint.
 */
export function mergePeopleAdditions(
  current: Person[],
  added: Person[],
): Person[] {
  const seen = new Set(current.map((p) => p.id));
  const next = [...current];

  for (const person of added) {
    if (seen.has(person.id)) continue;
    seen.add(person.id);
    next.push(person);
  }

  return next;
}

/**
 * Reconciles a Firestore snapshot's people array against local state.
 *
 * The snapshot is authoritative, with one exception: an addition whose write
 * has not round-tripped yet. A snapshot that predates that write carries the
 * OLD array, and adopting it wholesale silently drops the just-added person —
 * with no error, after the wizard has already accepted `people.length > 1`.
 *
 * When nothing is in flight the server array is adopted VERBATIM rather than
 * merged by id. That is deliberate: a blanket merge would resurrect anyone
 * deleted elsewhere, which trades data loss for data resurrection. Removals
 * must keep working, which is why only still-pending ids are re-attached.
 *
 * Pure so both wizards can share it — the logic is subtle enough that a second
 * copy would drift.
 */
export function reconcilePeopleWithServer(
  current: Person[],
  server: Person[],
  pendingIds: ReadonlySet<string>,
): { people: Person[]; pendingIds: Set<string> } {
  const serverIds = new Set(server.map((p) => p.id));

  // Anything the server now confirms is no longer in flight.
  const stillInFlight = new Set<string>();
  for (const id of pendingIds) {
    if (!serverIds.has(id)) stillInFlight.add(id);
  }

  if (stillInFlight.size === 0) {
    return { people: server, pendingIds: stillInFlight };
  }

  const reattach = current.filter(
    (p) => stillInFlight.has(p.id) && !serverIds.has(p.id),
  );

  return {
    people: reattach.length > 0 ? [...server, ...reattach] : server,
    pendingIds: stillInFlight,
  };
}

/**
 * Strips a person out of every item's assignee list.
 *
 * MUST be persisted in the SAME write as the `people` shrink. `people` and
 * `itemAssignments` are independent whole-value fields, and
 * `calculatePersonTotals` divides each item by the RAW assignee-list length
 * (`shared/calculations.ts:28`) before discarding shares belonging to anyone
 * absent from `people`. So a person left behind in `itemAssignments` after
 * being removed from `people` is a GHOST: a $30 item assigned to
 * [alice, bob, ghost] charges alice and bob $10 each and the remaining $10 is
 * charged to NOBODY, with tax/tip under-collecting against the full-bill
 * denominator. The payer silently absorbs the difference, and the wizard's
 * local state looks correct the whole time.
 *
 * The split-evenly self-heal does NOT rescue this: it is gated on
 * `splitEvenly`, so a manually-assigned bill is never repaired.
 *
 * Returns a new object; empty assignee lists are preserved rather than
 * deleted, because an item key that disappears is indistinguishable from an
 * item nobody has claimed yet.
 */
export function purgePersonFromAssignments(
  itemAssignments: ItemAssignment,
  personId: string,
): ItemAssignment {
  const next: ItemAssignment = {};

  for (const [itemId, assignees] of Object.entries(itemAssignments)) {
    next[itemId] = (assignees ?? []).filter((id) => id !== personId);
  }

  return next;
}
