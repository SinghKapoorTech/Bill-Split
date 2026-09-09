/**
 * Magnitude bounds for every Remote-Config-supplied limit.
 *
 * WHY THIS FILE EXISTS — this is not defensive boilerplate, it is a measured bug.
 * `shared/scanRateLimit.ts` validated its config STRUCTURALLY (finite, > 0) and
 * that was not enough: `windowMs: 3600` — the seconds-for-milliseconds typo —
 * passed every check and allowed 3600 scans against a 30/hour limit, with
 * `usedConfigFallback` unset so NOTHING was logged. The backstop was silently
 * off. Spec §5.2 therefore requires plausibility bounds, not just type bounds.
 *
 * The other trap is subtler and is the reason `<= 0` falls back rather than
 * clamping up: **`getNumber()` returns 0 for an unpublished or misspelled key.**
 * Clamping that 0 to the minimum would hand every user on earth a limit of 1 —
 * a catastrophic silent TIGHTENING triggered by a typo in a config key name.
 * Zero means "absent", and absent means "use the default".
 *
 * Direction matters throughout: a fallback that is too generous costs fractions
 * of a cent (a scan is $0.0004 — spec §3); a fallback that is too strict locks
 * users out of the product. When in doubt, be generous and log.
 *
 * No imports. Tests live in `tests/`, never in `shared/`.
 */

/** Launch defaults — spec §4.2. Both are Remote Config keys so they can move without a release. */
export const FREE_SCANS_PER_MONTH_DEFAULT = 2;
export const FREE_ACTIVE_GROUPS_DEFAULT = 2;

/** Remote Config key names. Centralised so enforcement and UI cannot drift apart. */
export const RC_KEY_FREE_SCANS = 'free_scans_per_month';
export const RC_KEY_FREE_GROUPS = 'free_active_groups';
export const RC_KEY_PAYWALL_ENABLED = 'paywall_enabled';

/**
 * Plausibility range for both caps. The ceiling is not a business rule — it
 * exists so an extra-zeros typo (`5000`) is visible in logs rather than
 * silently disabling the cap.
 */
export const LIMIT_MIN = 1;
export const LIMIT_MAX = 1000;

export interface LimitResolution {
  /** The value to actually enforce. Always a safe integer within bounds. */
  value: number;
  /** True when the supplied value was unusable or out of range. Callers MUST log this. */
  clamped: boolean;
  /** Machine-readable cause, for structured logs. Undefined when nothing was wrong. */
  reason?: 'not-a-number' | 'absent-or-zero' | 'below-min' | 'above-max';
  /** Exactly what arrived, for the log line. Never used for enforcement. */
  received?: unknown;
}

/**
 * Validates and bounds one Remote Config number.
 *
 * Order is deliberate:
 *   1. non-numeric / non-finite  → fallback  (a broken key must not throw)
 *   2. <= 0                      → fallback  (0 is "unpublished", NOT "min")
 *   3. floor, then clamp into [min, max]
 *
 * Never throws. A Remote Config outage must degrade to defaults, not take
 * scanning down with it.
 */
export function resolveLimit(
  raw: unknown,
  fallback: number,
  min: number = LIMIT_MIN,
  max: number = LIMIT_MAX,
): LimitResolution {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    return { value: fallback, clamped: true, reason: 'not-a-number', received: raw };
  }

  // The unpublished/misspelled-key case. Falls back to the default rather than
  // clamping to `min` — see the header. This is the single most important
  // branch in this file.
  if (raw <= 0) {
    return { value: fallback, clamped: true, reason: 'absent-or-zero', received: raw };
  }

  // Floor BEFORE the min check, so 0.5 is treated as the 0 it effectively is
  // rather than surviving as a fractional limit.
  const floored = Math.floor(raw);

  if (floored < min) {
    return { value: min, clamped: true, reason: 'below-min', received: raw };
  }
  if (floored > max) {
    return { value: max, clamped: true, reason: 'above-max', received: raw };
  }

  return { value: floored, clamped: false };
}

/**
 * The kill switch (spec §5.2).
 *
 * DEFAULTS TO FALSE — enforcement DARK — and does so for a specific reason:
 * `getBoolean()` also returns false for a missing or misspelled key, so the
 * failure mode of a broken config is "nobody is capped", not "everybody is
 * locked out". Only a literal `true` enables enforcement; a truthy string from
 * a mistyped config value must not switch on a paywall for the whole user base.
 */
export function resolvePaywallEnabled(raw: unknown): boolean {
  return raw === true;
}
