import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  resolveEffectivePlan,
  hasUnlimitedUsage,
  type EntitlementState,
  type Plan,
} from '../../shared/entitlements.js';

/**
 * Reads `entitlements/{userId}` and resolves the plan in force.
 *
 * `entitlements/` denies ALL client writes (firestore.rules) — a user who could
 * write it could grant themselves Pro. Only the Admin SDK writes here, and in
 * this chunk nothing does: the collection is populated by the RevenueCat webhook
 * in chunk 4. Until then every read misses and every user resolves to `free`,
 * which is the correct steady state, not a bug.
 *
 * NEVER THROWS. This sits in front of `analyzeBill` and event creation; a
 * Firestore blip must not take the product down. On error it reports `free` and
 * logs — see the note on direction below.
 *
 * Every relative import ends in `.js` — see remoteConfigLimits.ts for why.
 */

export interface EffectiveEntitlement {
  plan: Plan;
  /** Both paid plans lift the free-tier caps; they differ only in Pro features. */
  unlimited: boolean;
  /** True when the read failed and `free` is an assumption rather than a fact. */
  degraded: boolean;
}

const FREE_FALLBACK: EffectiveEntitlement = { plan: 'free', unlimited: false, degraded: true };

/**
 * Converts a Firestore field to epoch millis, or undefined.
 *
 * A plain number is accepted as well as a Timestamp because the webhook in
 * chunk 4 has not landed yet and its exact write shape is not fixed; anything
 * else (a string date, an object) is rejected rather than coerced, so a
 * malformed write expires rather than grants.
 */
function toMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * Resolves the effective plan for `uid` against SERVER time.
 *
 * The `nowMs` parameter exists for tests only — production must always let it
 * default to `Date.now()` on the server. Accepting a client-supplied clock here
 * would let a device with its date rolled back hold a free pass forever
 * (spec §5.1).
 */
export async function getEffectiveEntitlement(
  uid: string,
  nowMs: number = Date.now(),
): Promise<EffectiveEntitlement> {
  try {
    const snap = await getFirestore().collection('entitlements').doc(uid).get();

    // Absence is the normal steady state — a user who has never purchased — so
    // it is NOT logged and NOT marked degraded.
    if (!snap.exists) return { plan: 'free', unlimited: false, degraded: false };

    const data = snap.data() ?? {};
    const state: EntitlementState = {
      plan: typeof data.plan === 'string' ? data.plan : undefined,
      expiresAt: toMillis(data.expiresAt),
      inGracePeriod: data.inGracePeriod === true,
      tripPassExpiresAt: toMillis(data.tripPassExpiresAt),
    };

    const plan = resolveEffectivePlan(state, nowMs);
    return { plan, unlimited: hasUnlimitedUsage(plan), degraded: false };
  } catch (error) {
    // Falling back to `free` means a paying user could briefly be treated as
    // capped. That is the lesser evil versus failing open, which would make a
    // Firestore outage a free-Pro coupon for everyone — and it is bounded
    // further by the fact that gates run dark until `paywall_enabled` is on.
    logger.error('entitlementService: read failed, assuming free', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
    return FREE_FALLBACK;
  }
}
