/**
 * Pure effective-plan resolution for `entitlements/{userId}`.
 *
 * WHY THIS IS PURE AND TAKES MILLISECONDS, NOT TIMESTAMPS:
 * this file is compiled into the Cloud Functions build via the functions
 * tsconfig and must not reach into `firebase-admin` (or `src/`). The caller
 * converts a Firestore `Timestamp` to millis and passes SERVER time.
 *
 * TIME IS SERVER TIME — spec §5.1. Never resolve against a client-supplied
 * clock: a device with its date rolled back would hold a free pass forever.
 *
 * EVERY UNKNOWN FAILS TO `free`, NEVER TO A PAID PLAN. An absent document is
 * the normal steady state (a user who has never purchased), not an error, and
 * a malformed one must not mint Pro. `free` is also a fully working app, so
 * failing this direction degrades entitlement without breaking anything —
 * see spec §7.
 *
 * No imports. Tests live in `tests/`, never in `shared/`.
 */

export type Plan = 'free' | 'pro' | 'trip_pass';

/**
 * The subset of `entitlements/{userId}` this resolution needs, with timestamps
 * already converted to epoch milliseconds.
 *
 * `plan` is deliberately `string` rather than `Plan`: it arrives from Firestore
 * and may be absent, misspelled, or a value written by a future version. It is
 * validated here rather than trusted by the type system.
 */
export interface EntitlementState {
  plan?: string;
  /** Subscription renewal date, or Trip Pass expiry when `plan` is 'trip_pass'. */
  expiresAt?: number;
  /** Billing retry window — RevenueCat still considers the subscription active. */
  inGracePeriod?: boolean;
  /**
   * A Trip Pass held ALONGSIDE a subscription. Spec §5.1: a user may buy a pass
   * and then subscribe mid-trip, and the two must not overwrite each other. The
   * pass is never consumed or refunded when a subscription supersedes it — it
   * simply stops mattering, and matters again if the subscription lapses first.
   * Chunk 5 populates this; until then it is always absent.
   */
  tripPassExpiresAt?: number;
}

/** A timestamp is only "in the future" if it is a real, finite number. */
function isActive(expiresAt: number | undefined, nowMs: number): boolean {
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt) && expiresAt > nowMs;
}

/**
 * Resolves the plan actually in force, in the priority order fixed by spec §5.1:
 *
 *   1. an active `pro` subscription (unexpired, OR in its billing grace period)
 *   2. an active Trip Pass — from either the standalone field or `plan`
 *   3. otherwise `free`
 *
 * A `pro` document with no `expiresAt` and no grace flag is MALFORMED and
 * resolves to `free`. That is the fail-closed direction: granting Pro on a
 * document we cannot date would make a single bad webhook write permanent.
 */
export function resolveEffectivePlan(
  entitlement: EntitlementState | null | undefined,
  nowMs: number,
): Plan {
  if (!entitlement) return 'free';

  // Grace period outranks the date on purpose: during a billing retry RevenueCat
  // reports the subscription as active while `expiresAt` is already in the past.
  // Cutting the user off mid-retry would punish them for a card that is still
  // being charged.
  if (entitlement.plan === 'pro') {
    if (entitlement.inGracePeriod === true || isActive(entitlement.expiresAt, nowMs)) {
      return 'pro';
    }
  }

  // Checked independently of `plan` so a pass survives being superseded by a
  // subscription that has since lapsed.
  if (isActive(entitlement.tripPassExpiresAt, nowMs)) return 'trip_pass';

  // `inGracePeriod` is deliberately NOT consulted here. A Trip Pass is a
  // non-renewing consumable — there is no billing retry to be in, so honouring
  // a grace flag on one would extend a pass that was fully paid for and used.
  if (entitlement.plan === 'trip_pass' && isActive(entitlement.expiresAt, nowMs)) {
    return 'trip_pass';
  }

  return 'free';
}

/**
 * Both paid plans lift the free-tier caps. They differ only in Pro-exclusive
 * FEATURES (recurring bills, Airbnb mode, squads, export — spec §4.3), which
 * are not gated in this chunk.
 *
 * Expressed as one predicate so a future third plan cannot accidentally lift
 * one cap and not the other.
 */
export function hasUnlimitedUsage(plan: Plan): boolean {
  return plan === 'pro' || plan === 'trip_pass';
}
