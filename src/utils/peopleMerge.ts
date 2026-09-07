import { Person } from "@/types";

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
