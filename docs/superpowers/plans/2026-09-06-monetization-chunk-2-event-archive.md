# Monetization Chunk 2 — Event Archive Implementation Plan

**Goal:** Let an event owner archive a finished event so it leaves the active list, without deleting it and without touching any balance. This is the escape hatch the chunk-3 group cap depends on — a cap with no exit is a trap.

**Spec:** `docs/superpowers/specs/2026-09-06-monetization-design.md` §4.2.1

**Depends on:** nothing. Ships alone as a useful feature even if billing is never built.

---

## Findings that shape the design

Established by reading the code before planning:

1. **The list query is `where('memberIds','array-contains',uid)`** (`src/hooks/useEventManager.ts:23-26`) — **not** `ownerId ==`. The list shows events other people created. The chunk-3 cap counts events you _own_; these are different sets and must not be conflated.
2. **The rules already enforce owner-only archive, for free.** `firestore.rules` events `allow update` gives the owner unrestricted access, while members and invitees are confined to `onlyUpdating(['memberIds','pendingInvites','updatedAt'])`. A member writing `archived` is denied by construction. **No rules change is needed — but this needs a test**, because it is a security property nothing currently asserts.
3. **No Cloud Function triggers on event writes.** `eventDeleteProcessor` fires on _delete_ only. Archiving is an update, so it structurally cannot reverse a ledger footprint. This is what makes "archive preserves balances" true by construction rather than by care.
4. **Existing events have no `archived` field**, and Firestore `where('archived','==',false)` **does not match documents missing the field**. A server-side filter would make every pre-existing event vanish from every user's list.

### Consequences

- **Do not filter server-side, and do not migrate.** Keep the existing query and partition client-side, treating a missing `archived` as _not archived_. Event lists are per-user and small; there is no performance argument for an index here, and no migration risk.
- **No composite index is added in this chunk.**
- **Note for chunk 3:** the server-side owned-active count must avoid the same trap. `count(ownerId == uid)` minus `count(ownerId == uid AND archived == true)` is correct for legacy documents, because `archived == true` only ever matches explicitly-archived ones. A naive `archived == false` count would silently under-count and let a user exceed the cap.

---

## File structure

| File                                      | Responsibility                                                | Action |
| ----------------------------------------- | ------------------------------------------------------------- | ------ |
| `shared/eventArchive.ts`                  | Pure archive predicates + partition. Zero imports.            | Create |
| `tests/eventArchive.test.ts`              | Unit tests for the above                                      | Create |
| `src/types/event.types.ts`                | `archived?: boolean`, `archivedAt?: Timestamp` on `TripEvent` | Modify |
| `src/hooks/useEventManager.ts`            | `archiveEvent` / `unarchiveEvent`                             | Modify |
| `src/pages/EventsView.tsx`                | Active list + collapsible Archived section                    | Modify |
| `src/components/events/EventSelector.tsx` | Exclude archived from the picker                              | Modify |
| `tests/rules/events.rules.test.ts`        | Member cannot archive; owner can                              | Create |

---

## Task 1: Pure archive helpers

**Files:** create `shared/eventArchive.ts`, `tests/eventArchive.test.ts`

Must stay import-free (`shared/` compiles into the Cloud Functions build) and must use a **minimal structural type**, not `TripEvent` — `shared/` cannot import from `src/`.

```ts
export interface ArchivableEvent {
  archived?: boolean;
}

/**
 * A document written before the archive feature existed has no `archived`
 * field. Absence means ACTIVE — never archived — and every read path must
 * agree on that, or pre-existing events disappear from the UI.
 */
export function isEventArchived(event: ArchivableEvent): boolean {
  return event.archived === true;
}

export function partitionEvents<T extends ArchivableEvent>(
  events: readonly T[],
): { active: T[]; archived: T[] } { ... }
```

Tests must cover: `archived` missing, `undefined`, `false`, `true`, and a non-boolean truthy value (`archived: 'yes'` must **not** count as archived — only a literal `true`). `partitionEvents` must preserve input order within each bucket and never mutate its input.

## Task 2: Type + mutations

**Files:** `src/types/event.types.ts`, `src/hooks/useEventManager.ts`

Add `archived?: boolean` and `archivedAt?: Timestamp` (both optional — existing docs lack them).

Add `archiveEvent(eventId)` and `unarchiveEvent(eventId)` alongside `createEvent`/`deleteEvent`. Archive sets `archived: true` + `archivedAt` + `updatedAt`; unarchive sets `archived: false` and **removes** `archivedAt` (`deleteField()`), so a stale timestamp cannot linger.

**Never write `undefined` to Firestore** — the repo rule. Use conditional spreading or `deleteField()`.

Do **not** touch any bill, balance, or `event_balances` document. Archiving is a flag on the event and nothing else. If a change here seems to require touching balances, stop — the design is wrong.

## Task 3: UI

**Files:** `src/pages/EventsView.tsx`, `src/components/events/EventSelector.tsx`

`EventsView` (list renders at `:137`, empty state at `:122`): partition with `partitionEvents`. Active events render as today. Archived render in a **collapsed-by-default** section that is hidden entirely when empty, each with an Unarchive action.

The empty state at `:122` currently triggers on `events.length === 0`. It must key off **active** events, and when there are archived-but-no-active events it must not claim the user has no events.

**Archive is owner-only in the UI**, matching the rules. A member viewing someone else's event sees no archive control — the write would be denied anyway, and offering a button that fails is worse than not offering it.

`EventSelector` (`:79`): exclude archived events from the picker — an archived event is finished, so it should not be a target for a new bill. Exception: if the currently-selected event is archived, keep it visible so the selection does not silently change under the user.

## Task 4: Security-property test

**Files:** create `tests/rules/events.rules.test.ts`

Use its **own `projectId`** (e.g. `demo-bill-split-rules-events`) — `tests/rules/*.test.ts` share an emulator and each calls `clearFirestore()`; sharing an id is safe only while `fileParallelism: false` holds. Follow `tests/rules/entitlements.rules.test.ts`.

Must assert:

- **BLOCKS** a member archiving an event they do not own
- **BLOCKS** a member setting `archived` alongside an allowed field (proving `onlyUpdating` is not bypassable by bundling)
- **BLOCKS** a pending invitee archiving
- **BLOCKS** a non-member entirely
- **ALLOWS** the owner archiving and unarchiving

## Task 5: Verify

Baseline to beat: `npm test` **480 passed / 0 failed**, `npm run test:integration` **124**, `npm run test:rules` **32**, typecheck **36 errors**, lint **29 errors / 42 warnings**, functions + vite builds clean.

Report deltas, not exit codes. Then a manual-QA checklist — no browser driving.

---

## Out of scope

Enforcing the 2-group cap (chunk 3), the composite index and count query (chunk 3), bulk archive, auto-archive on settle, and any migration or backfill of `archived` onto existing documents.
