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
