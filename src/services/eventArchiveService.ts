import { doc, Timestamp, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';

const EVENTS_COLLECTION = 'events';

/**
 * The archive mutations, in ONE place.
 *
 * They live here rather than only inside useEventManager because two screens
 * need them — the events list and the event detail view — and the detail view
 * must not mount a second real-time listener over the whole events collection
 * just to reach a one-line write. Duplicating the writes instead would be worse
 * still: the unarchive path has a detail (removing `archivedAt`) that is easy to
 * forget in a copy, and a copy that forgets it leaves a stale timestamp behind
 * claiming the event is still archived.
 *
 * Archiving is a flag on the event document and NOTHING else. It must not touch
 * bills, `balances` or `event_balances`: no Cloud Function triggers on event
 * updates (eventDeleteProcessor is delete-only), so an archived event keeps
 * every balance it had. That is the whole point — archive is the
 * non-destructive alternative to delete, and settling up keeps working while an
 * event is archived. If a change here ever seems to require touching a balance,
 * the design is wrong.
 *
 * Owner-only, enforced by firestore.rules (members are confined to
 * memberIds/pendingInvites/updatedAt). Callers hide the control for non-owners
 * rather than surfacing a write that would be denied.
 */
export async function archiveEventDoc(eventId: string): Promise<void> {
  // One timestamp for both fields — two calls to now() would make archivedAt
  // and updatedAt disagree by a hair for no reason.
  const now = Timestamp.now();
  await updateDoc(doc(db, EVENTS_COLLECTION, eventId), {
    archived: true,
    archivedAt: now,
    updatedAt: now,
  });
}

/**
 * Unarchiving is a CALLABLE, while archiving above is a direct write. That
 * asymmetry is deliberate and is the whole shape of the free-tier group cap:
 *
 *   archiving   frees a slot → never gated, never blocked, stays client-side.
 *   unarchiving consumes a slot → gated by the same cap as creation, because
 *               archive → create → unarchive would otherwise bypass it in
 *               three taps (spec §4.2.1).
 *
 * A cap needs a COUNT of the owner's active events, and a Firestore rule cannot
 * run an aggregation query — it only ever sees the document at hand. So the
 * check lives in the `unarchiveEvent` Cloud Function, and firestore.rules now
 * DENIES a client write that clears `archived` (by value or by field deletion),
 * making the callable the only way in.
 *
 * The function still removes `archivedAt` rather than setting it false, for the
 * original reason: a stale timestamp left behind would keep claiming the event
 * is archived to anything that reads it.
 */
export async function unarchiveEventDoc(eventId: string): Promise<void> {
  const fn = httpsCallable<{ eventId: string }, { eventId: string; alreadyActive: boolean }>(
    functions,
    'unarchiveEvent',
  );
  await fn({ eventId });
}
