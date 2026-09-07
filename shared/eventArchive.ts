/**
 * Pure archive predicates for events.
 *
 * WHY THIS PARTITION IS CLIENT-SIDE, AND MUST STAY THAT WAY:
 * Every event document written before this feature existed has NO `archived`
 * field, and a Firestore `where('archived','==',false)` query does NOT match
 * documents that are missing the field. Filtering server-side would therefore
 * make every pre-existing event disappear from every user's list. Event lists
 * are per-user and small, so there is no performance argument for an index —
 * we keep the existing `memberIds array-contains` query and split in memory.
 *
 * NOTE FOR THE GROUP-CAP WORK: a server-side count must avoid the same trap.
 * `count(ownerId == uid)` minus `count(ownerId == uid AND archived == true)` is
 * correct for legacy documents; a naive `archived == false` count silently
 * under-counts and lets a user exceed the cap.
 *
 * No imports: this file is compiled into the Cloud Functions build via the
 * functions tsconfig, and cannot reach into `src/`. That is why the input is a
 * minimal structural type rather than `TripEvent`. Tests live in `tests/`.
 */

/** The only shape this module needs. Deliberately not `TripEvent`. */
export interface ArchivableEvent {
  archived?: boolean;
}

/**
 * Absence means ACTIVE — never archived — and every read path must agree on
 * that. Only a literal `true` archives: a non-boolean truthy value from a bad
 * write must not silently hide an event from its owner.
 */
export function isEventArchived(event: ArchivableEvent): boolean {
  return event.archived === true;
}

/**
 * Splits a list into active and archived buckets, preserving the caller's
 * ordering within each bucket and leaving the input untouched.
 */
export function partitionEvents<T extends ArchivableEvent>(
  events: readonly T[],
): { active: T[]; archived: T[] } {
  const active: T[] = [];
  const archived: T[] = [];

  for (const event of events) {
    if (isEventArchived(event)) {
      archived.push(event);
    } else {
      active.push(event);
    }
  }

  return { active, archived };
}
