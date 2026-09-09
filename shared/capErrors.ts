/**
 * The typed payload on every `resource-exhausted` HttpsError the backend throws.
 *
 * WHY THIS EXISTS: three unrelated conditions share the `resource-exhausted`
 * code — the hourly abuse limiter, the monthly free-tier scan quota, and the
 * active-group cap. Before this file the client could only tell them apart by
 * reading the prose message, so any copy edit silently changed which UI a user
 * saw. The message stays (it is still the fallback copy); `details` is now the
 * contract.
 *
 * THE RATE LIMITER IS NOT A PAYWALL TRIGGER. It is anti-abuse, it applies to Pro
 * subscribers too, and it clears on its own in minutes. Offering an upgrade to
 * someone who is merely scanning too fast is at best noise and at worst a lie
 * told to a user who already pays. That distinction is the reason
 * `isPaywallTrigger` exists separately from `isCapErrorDetails` — see below.
 *
 * No imports. Tests live in `tests/`, never in `shared/`.
 */

export type CapErrorDetails =
  /** Monthly free-tier scan cap. A paywall trigger. */
  | { reason: 'scan-quota'; used: number; limit: number; resetsAtMs: number }
  /** Hourly anti-abuse limiter. Applies to EVERY plan — NOT a paywall trigger. */
  | { reason: 'scan-rate-limit'; retryAfterMs: number }
  /** Active owned-group cap. A paywall trigger. */
  | { reason: 'group-cap'; activeCount: number; limit: number };

/** The two reasons that mean "this user needs a bigger plan". */
export type PaywallTriggerDetails = Extract<
  CapErrorDetails,
  { reason: 'scan-quota' | 'group-cap' }
>;

/**
 * Every field is checked, not just `reason`.
 *
 * These objects arrive at the client as `HttpsError.details` — JSON that has
 * crossed a process boundary. A guard that checked only `reason` would still
 * narrow the type to `{ used: number; limit: number }`, so a payload that lost
 * a field in transit (or came from an older deployed function) would type-check
 * and then render as "You've used undefined of undefined scans". Validating the
 * numbers here is what makes the narrowing honest.
 */
function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isCapErrorDetails(d: unknown): d is CapErrorDetails {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return false;
  const o = d as Record<string, unknown>;

  switch (o.reason) {
    case 'scan-quota':
      return isFiniteNumber(o.used) && isFiniteNumber(o.limit) && isFiniteNumber(o.resetsAtMs);
    case 'scan-rate-limit':
      return isFiniteNumber(o.retryAfterMs);
    case 'group-cap':
      return isFiniteNumber(o.activeCount) && isFiniteNumber(o.limit);
    default:
      // An unknown reason is not "probably fine" — a future backend may add a
      // fourth cap, and this client must fall back to the prose message rather
      // than guess which wall to draw.
      return false;
  }
}

/**
 * Should this error put an upgrade wall in front of the user?
 *
 * Deliberately NOT folded into `isCapErrorDetails`. That one answers "is this a
 * payload I understand"; this one answers "does this mean buy something". The
 * hourly limiter is the first and not the second, and collapsing the two is how
 * a Pro subscriber ends up being sold Pro.
 */
export function isPaywallTrigger(d: unknown): d is PaywallTriggerDetails {
  return isCapErrorDetails(d) && d.reason !== 'scan-rate-limit';
}
