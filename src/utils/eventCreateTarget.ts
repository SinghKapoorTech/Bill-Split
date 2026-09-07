import { isEventArchived } from '@shared/eventArchive';

/**
 * "Which event, if any, does the bill I am about to create belong to?"
 *
 * WHY THIS IS A STATE MACHINE AND NOT A NULLABLE OBJECT:
 * The global create dialog is opened from the nav bars, which derive the event
 * purely from the URL (`/events/:id`) and know nothing else about it — not even
 * its name. Whether that event is ARCHIVED (and therefore not a valid target
 * for a NEW bill) can only be answered by an async read. So there is a window,
 * every single time the dialog opens on an event page, in which the answer is
 * genuinely NOT KNOWN YET.
 *
 * Collapsing that window into "we have an event id, so use it" is a race: tap
 * `+` then tap a create option before the read resolves and the bill lands in
 * the archived event. Nothing downstream would catch it — the wizards
 * (SimpleTransactionWizard, AirbnbWizard, BillWizard) consume
 * `routerState.targetEventId` verbatim with no archive check of their own — so
 * an unverified id that escapes here is an unverified id that creates a bill.
 *
 * This is the URL-derived path only. EventDetailView reaches creation with the
 * event already loaded and guards those entry points itself (an explicit
 * isEventArchived() refusal in handleCreateEventBill, plus hiding the
 * affordances while archived); it is not routed through here.
 *
 * Hence `checking` is its own state, and only `ready` yields a context.
 * Every other state means the wizards are handed NO event. That is the safe
 * direction but it is NOT free — dropping the association for an event that
 * turns out to be perfectly active is a silent downgrade to a private bill —
 * so the dialog holds its create options disabled while `checking` rather than
 * letting a fast tap resolve it either way.
 */
export type EventCreateTarget =
  /** No event in play: not on an event page, or the user detached it. */
  | { status: 'none' }
  /** We have an id but have NOT yet confirmed the event accepts new bills. */
  | { status: 'checking' }
  /** Confirmed archived — new bills must not go in. */
  | { status: 'archived' }
  /** Confirmed active, safe to create into. */
  | { status: 'ready'; targetEventId: string; targetEventName: string };

/**
 * Where the dialog starts, and returns to when it closes. Named so the "an
 * incoming event id is NOT a target until it has been checked" decision lives
 * with the state machine instead of as a literal at the useState call.
 */
export const INITIAL_EVENT_CREATE_TARGET: EventCreateTarget = { status: 'none' };

/**
 * Router state shape the create wizards read (`routerState.targetEventId`).
 *
 * A type alias, not an interface, so it satisfies the `Record<string, unknown>`
 * that navigateWithOrigin takes — an interface has no implicit index signature.
 */
export type EventCreateContext = {
  targetEventId: string;
  targetEventName: string;
};

/** The minimal slice of an event document this decision needs. */
interface EventDocData {
  name?: string;
  archived?: boolean;
}

/**
 * Classify a fetched event document.
 *
 * `data === undefined` means the document does not exist (deleted, or a junk id
 * in the URL) — that is `none`, not an error and not a target.
 *
 * `isEventArchived` is the single arbiter of "archived" across client and
 * server; do not inline an `archived === true` check here or anywhere else.
 */
export function targetFromEventDoc(
  eventId: string,
  data: EventDocData | undefined,
  fallbackName?: string,
): EventCreateTarget {
  if (!data) return { status: 'none' };
  if (isEventArchived(data)) return { status: 'archived' };
  return {
    status: 'ready',
    targetEventId: eventId,
    targetEventName: data.name || fallbackName || 'Event',
  };
}

/**
 * The context handed to the create wizards. Anything short of a confirmed
 * active event resolves to `undefined` — an unresolved check, a failed read and
 * an archived event are all "no event", deliberately.
 */
export function eventContextForCreate(target: EventCreateTarget): EventCreateContext | undefined {
  if (target.status !== 'ready') return undefined;
  return {
    targetEventId: target.targetEventId,
    targetEventName: target.targetEventName,
  };
}
