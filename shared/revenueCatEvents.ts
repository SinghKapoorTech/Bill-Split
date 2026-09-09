/**
 * Pure mapping from a RevenueCat webhook event to the entitlement change it
 * implies, for `entitlements/{userId}`.
 *
 * WHY THIS IS PURE: this file is compiled into the Cloud Functions build via
 * the functions tsconfig and must not reach into `firebase-admin` (or
 * `src/`). This module does not call RevenueCat, does not touch Firestore,
 * and does not know about HTTP signatures — it only decides WHAT should
 * change, given an event, the entitlement doc as it stands now, and server
 * time. The caller (Task 2's Cloud Function) is responsible for verifying
 * the webhook, reading the current doc, calling `planEntitlementMutation`,
 * and applying the resulting `EntitlementMutation` to Firestore.
 *
 * FAIL CLOSED, ALWAYS TOWARD `ignore`. Every branch that cannot fully prove
 * a grant is safe returns `{ kind: 'ignore' }` rather than guessing in the
 * user's favor. A missed grant costs one webhook retry or a support ticket;
 * a wrongly-issued grant is silent free access that nothing here will ever
 * notice or undo. Concretely:
 *   - an unrecognized `product_id` is ignored, not treated as some default
 *     plan (a RevenueCat dashboard typo must not become free Pro for
 *     everyone who bought it);
 *   - an unrecognized event `type` is ignored — RevenueCat has added event
 *     types before and will again, and treating an unknown type as a grant
 *     event means a future RevenueCat product change silently mints Pro;
 *   - a PRODUCTION server ignores SANDBOX events unless the caller opts in
 *     (`acceptSandbox`), so a developer's test purchase in the RevenueCat
 *     sandbox can never grant a stranger's account real access in prod;
 *   - a `pro` grant with no usable `expiration_at_ms` is refused outright
 *     (see below) rather than granted with some made-up default expiry.
 *
 * WHY CANCELLATION DOES NOT REVOKE: `CANCELLATION` means "auto-renew turned
 * off", not "access ends now" — the user paid for the current period and
 * keeps Pro through it. RevenueCat sends a separate `EXPIRATION` event when
 * that period actually lapses (if the user re-subscribes before then,
 * `UNCANCELLATION`/`RENEWAL` arrives instead and `CANCELLATION` never
 * mattered). Revoking on `CANCELLATION` would take away access the user
 * already paid for. Same reasoning applies to `SUBSCRIPTION_PAUSED`
 * (Android-only "pause" is also a future-dated non-renewal, not an
 * immediate cutoff) — it is ignored here and left to `EXPIRATION`.
 *
 * WHY A TRIP PASS EXTENDS FROM max(now, existing) INSTEAD OF RESTARTING:
 * a Trip Pass is a non-renewing consumable, so a user might buy a second
 * one while the first is still running (e.g. topping up before a trip
 * extension). Restarting the clock at `now` would silently delete whatever
 * days were left on the pass they already paid for. Anchoring on the later
 * of "now" and "the pass's current expiry" means early purchases stack
 * cleanly, while a pass that already lapsed just starts fresh from now (no
 * anchoring to a stale, already-expired timestamp).
 *
 * WHY `expiration_at_ms` IS IGNORED (and expected null) ON
 * NON_RENEWING_PURCHASE: unlike a subscription, RevenueCat does not track
 * an expiry for a consumable non-renewing product — there is no
 * subscription period for it to report. The Trip Pass duration is a Divit
 * business rule (`TRIP_PASS_DURATION_MS`), not something RevenueCat knows,
 * so it is computed here from server time rather than trusted from the
 * event payload.
 *
 * WHY A PRO GRANT WITH NO EXPIRY IS REFUSED: `set-pro` always carries a
 * concrete `expiresAt` so the entitlement is re-derived (and lapses) purely
 * from time — see `resolveEffectivePlan` in `entitlements.ts`, which treats
 * a `pro` doc with no expiry and no grace flag as malformed and resolves it
 * to `free`. If this function let a missing `expiration_at_ms` through as a
 * grant, the caller would have to invent a fallback expiry, and a bug there
 * could mint permanent Pro from a single malformed webhook. Refusing here
 * means the bad event is dropped instead of quietly becoming free-forever
 * access.
 *
 * No imports. Tests live in `tests/`, never in `shared/`.
 */

/** How long one Trip Pass lasts, applied from the anchor computed below. */
export const TRIP_PASS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * RevenueCat product identifiers Divit sells, mapped to the plan they grant.
 * Anything not listed here is an unrecognized product and is ignored — see
 * the fail-closed note above.
 */
export const PRODUCT_PLANS: Record<string, 'pro' | 'trip_pass'> = {
  divit_pro_monthly: 'pro',
  divit_pro_annual: 'pro',
  divit_trip_pass_14d: 'trip_pass',
};

/**
 * The subset of a RevenueCat webhook event payload this module needs.
 * Deliberately loose types (`type: string`, `product_id?: string`) because
 * this is untrusted external input — RevenueCat can add new event types or
 * products at any time, and this module must degrade to `ignore` rather
 * than throw when it sees something it doesn't recognize.
 */
export interface RevenueCatEvent {
  id: string;
  type: string;
  product_id?: string;
  app_user_id?: string;
  aliases?: string[];
  original_app_user_id?: string;
  /** Subscription expiry in epoch ms. Null/absent on non-renewing products. */
  expiration_at_ms?: number | null;
  environment?: string;
}

/** The subset of the current `entitlements/{userId}` doc this needs. */
export interface CurrentEntitlement {
  tripPassExpiresAt?: number;
}

/**
 * What the caller should do to `entitlements/{userId}`. A closed union so
 * the Cloud Function (Task 2) must handle every case explicitly rather than
 * falling through a default branch.
 */
export type EntitlementMutation =
  | { kind: 'set-pro'; expiresAt: number; inGracePeriod: false }
  | { kind: 'clear-pro' }
  | { kind: 'set-grace' }
  | { kind: 'extend-trip-pass'; tripPassExpiresAt: number }
  | { kind: 'ignore'; reason?: string };

/**
 * Event types that grant/renew an active Pro subscription with a fresh
 * expiry. `RENEWAL` (successful auto-renew), `UNCANCELLATION` (user turned
 * auto-renew back on before expiry), `PRODUCT_CHANGE` (e.g. monthly ->
 * annual — RevenueCat sends the new expiry), and `SUBSCRIPTION_EXTENDED`
 * (manual extension, e.g. via customer support) all behave identically from
 * this module's point of view: trust the event's `expiration_at_ms`.
 */
const GRANTS_PRO = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);

/**
 * Decides what `entitlements/{userId}` should become in response to one
 * RevenueCat webhook event.
 *
 * @param event the webhook event (already verified by the caller)
 * @param current the relevant slice of the entitlement doc as it stands now
 *   (or null if the user has no entitlement doc yet)
 * @param nowMs SERVER time in epoch ms — never a client-supplied clock, for
 *   the same reason `resolveEffectivePlan` insists on it: a rolled-back
 *   client clock must not be able to extend paid access
 * @param acceptSandbox set true only when the caller explicitly wants to
 *   accept RevenueCat SANDBOX events (e.g. the beta project, or a
 *   dev/test webhook endpoint). Defaults to false so a stray sandbox event
 *   reaching the production endpoint cannot grant real access.
 */
export function planEntitlementMutation(
  event: RevenueCatEvent,
  current: CurrentEntitlement | null,
  nowMs: number,
  acceptSandbox = false,
): EntitlementMutation {
  // Case-sensitive on purpose — RevenueCat always sends this field uppercase
  // ('SANDBOX' / 'PRODUCTION'). Do NOT normalize or .toLowerCase() this
  // comparison (here or upstream, e.g. in the webhook handler before this is
  // called): lowercasing would make 'sandbox' compare unequal to 'SANDBOX'
  // and fall through as if it were production, defeating the entire check
  // and letting a developer's test purchase grant real access.
  if (event.environment === 'SANDBOX' && !acceptSandbox) {
    return { kind: 'ignore', reason: 'sandbox-event-in-production' };
  }

  const plan = event.product_id ? PRODUCT_PLANS[event.product_id] : undefined;
  if (!plan) return { kind: 'ignore', reason: 'unknown-product' };

  // Trip Pass is a one-time consumable, not a subscription, so it only ever
  // arrives via NON_RENEWING_PURCHASE and is handled entirely separately
  // from the subscription lifecycle events below.
  if (event.type === 'NON_RENEWING_PURCHASE') {
    if (plan !== 'trip_pass') {
      // A subscription product_id sent as a non-renewing purchase would be a
      // RevenueCat configuration mismatch — refuse rather than guess.
      return { kind: 'ignore', reason: 'non-renewing-non-pass' };
    }
    const existing = current?.tripPassExpiresAt;
    // Anchor on whichever is later: "now" (fresh pass) or the still-active
    // existing pass (stacked pass) — see "WHY A TRIP PASS EXTENDS" above.
    const anchor = typeof existing === 'number' && existing > nowMs ? existing : nowMs;
    return { kind: 'extend-trip-pass', tripPassExpiresAt: anchor + TRIP_PASS_DURATION_MS };
  }

  if (plan !== 'pro') {
    // A Trip Pass product_id sent as a subscription-lifecycle event (e.g.
    // RENEWAL) would also be a configuration mismatch.
    //
    // KEEP THIS GUARD — do not "simplify" it away. Without it, EXPIRATION or
    // BILLING_ISSUE on a trip-pass product_id would fall through to
    // clear-pro / set-grace below, which are subscription-only mutations. A
    // Trip Pass has no persistent "active" flag to clear in the first
    // place — resolveEffectivePlan (entitlements.ts) simply stops honouring
    // tripPassExpiresAt once that timestamp passes, so no write is needed
    // when a pass expires. Writing clear-pro here would be a no-op at best
    // and, worse, could downgrade a user who is simultaneously an ACTIVE
    // Pro subscriber and happens to also hold an unrelated, now-expired
    // Trip Pass — an event about one plan must never mutate the other.
    return { kind: 'ignore', reason: 'pass-product-on-subscription-event' };
  }

  if (GRANTS_PRO.has(event.type)) {
    const expiresAt = event.expiration_at_ms;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      // See "WHY A PRO GRANT WITH NO EXPIRY IS REFUSED" above.
      return { kind: 'ignore', reason: 'pro-grant-without-expiry' };
    }
    return { kind: 'set-pro', expiresAt, inGracePeriod: false };
  }

  if (event.type === 'BILLING_ISSUE') return { kind: 'set-grace' };
  if (event.type === 'EXPIRATION') return { kind: 'clear-pro' };
  // See "WHY CANCELLATION DOES NOT REVOKE" above — both of these are
  // "will not renew" signals, not "access ends now" signals.
  if (event.type === 'CANCELLATION')
    return { kind: 'ignore', reason: 'cancellation-defers-to-expiration' };
  if (event.type === 'SUBSCRIPTION_PAUSED')
    return { kind: 'ignore', reason: 'pause-defers-to-expiration' };

  return { kind: 'ignore', reason: 'unhandled-event-type' };
}

/**
 * Picks the Firebase UID a webhook event is about.
 *
 * RevenueCat's `app_user_id` is normally the Firebase UID the app passed at
 * `configure()` time, but a purchase can arrive tagged with an anonymous
 * RevenueCat-generated ID (`$RCAnonymousID:...`) if it happened before the
 * app finished identifying the user, or the identified ID can show up as an
 * alias instead of the primary field depending on when RevenueCat processed
 * the identify call. Anonymous IDs are never valid Firebase UIDs, so they
 * are always skipped in favor of the first real (non-anonymous) candidate,
 * checked in order: `app_user_id`, then each of `aliases`, then
 * `original_app_user_id`.
 *
 * Returns undefined — never a guess — when every candidate is anonymous;
 * the caller must not write to `entitlements/{undefined}`.
 */
export function resolveFirebaseUid(event: RevenueCatEvent): string | undefined {
  const candidates = [event.app_user_id, ...(event.aliases ?? []), event.original_app_user_id];
  return candidates.find(
    (c): c is string => typeof c === 'string' && c.length > 0 && !c.startsWith('$RCAnonymousID:'),
  );
}
