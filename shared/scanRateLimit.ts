/**
 * Pure fixed-window rate limiting for AI receipt scans.
 *
 * This is an ABUSE limiter, not the business quota. It applies to every plan
 * including Pro, and it reserves a slot BEFORE the Gemini call — a limiter that
 * only counted successes would be bypassable by deliberately erroring.
 *
 * Because it is a backstop, every input is treated as untrusted:
 *  - `limit` / `windowMs` will be fed from Firebase Remote Config, whose
 *    `getNumber()` returns 0 for an unpublished or mistyped key. Structurally
 *    unusable config (non-finite, a limit below one whole scan, a non-positive
 *    window) falls back to the module defaults — it never throws (which would
 *    break scanning for everyone) and never disables the limit.
 *    KNOWN GAP: only structural nonsense is rejected, not implausible
 *    magnitudes. A seconds-for-milliseconds typo (`windowMs: 3600`) or an
 *    extra-zeros limit passes validation and effectively disables the backstop
 *    while `usedConfigFallback` stays unset. Whoever wires Remote Config must
 *    add plausibility bounds at the fetch site or here.
 *  - `current` comes from a Firestore doc that may predate these fields, so a
 *    partial or non-numeric state is treated as "no window open yet": one scan
 *    is allowed, not unlimited scans, and never a permanent lockout.
 *
 * Fixed-window, not sliding: up to 2x `limit` can land in a short burst either
 * side of a window seam. That is inherent to the algorithm and acceptable for a
 * backstop — don't rediscover it as a bug.
 *
 * No Firebase imports: this file is compiled into the Cloud Functions build via
 * the functions tsconfig, and is unit-tested from tests/ (never from shared/).
 */

/** Maximum scans one user may start per window. Generous for humans, fatal to scripts. */
export const SCAN_RATE_LIMIT = 30;

/** Window length in milliseconds. */
export const SCAN_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface ScanRateState {
  windowStartMs: number;
  count: number;
}

export interface ScanRateDecision {
  allowed: boolean;
  /** State to persist. Unchanged from the input when the call is blocked. */
  next: ScanRateState;
  /** Milliseconds until the window reopens. Zero when allowed. */
  retryAfterMs: number;
  /**
   * The limit and window this decision was ACTUALLY made against — post
   * validation, post `Math.floor`, post fallback. Surfaced so the caller can
   * build the user-facing message from the same numbers the decision used.
   * Hardcoding `SCAN_RATE_LIMIT` / "per hour" at the call site produces a
   * message that silently goes wrong the moment Remote Config supplies
   * anything other than the defaults, or supplies something invalid.
   */
  effectiveLimit: number;
  effectiveWindowMs: number;
  /**
   * Set when `limit` or `windowMs` was rejected and the module default was used
   * instead. Callers should log this: a silent fallback hides a broken config.
   */
  usedConfigFallback?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The numeric half of both duration renderers: how many of which unit a
 * duration reads as. `value` must already be finite and positive.
 *
 * Rounding is to NEAREST, and both renderers share it. That sharing is load
 * bearing, not incidental: `retryAfterMs` is clamped by `evaluateScanRate` to
 * at most one window, and this function is non-decreasing, so a retry hint can
 * never render larger than the window rendered beside it in the same sentence.
 * Rounding the hint UP instead would break exactly that — a 61-second window
 * reads "per minute" while a 60.9-second wait ceils to "2 minutes", telling the
 * user to wait longer than the whole window they were just quoted. The cost of
 * nearest is a hint that can be short by up to half a unit, which costs at most
 * one repeat rejection carrying a fresh, smaller hint.
 *
 * Hours are used only for exact multiples of an hour, so 90 minutes reads as
 * "90 minutes" rather than a lossy "2 hours".
 */
function splitDuration(value: number): { count: number; unit: 'second' | 'minute' | 'hour' } {
  // Seconds first, and only while they round to under a minute. Bounding on the
  // ROUNDED value rather than on `value >= 60_000` is what stops the one
  // self-contradiction this helper exists to prevent: a 59_999ms window would
  // otherwise read "per 60 seconds" while the retry hint said "1 minute".
  const seconds = Math.round(value / 1000);
  if (seconds < 60) {
    // Never "0 seconds" — a sub-second duration is still a whole unit.
    return { count: Math.max(1, seconds), unit: 'second' };
  }

  if (value % (60 * 60 * 1000) === 0) {
    return { count: value / (60 * 60 * 1000), unit: 'hour' };
  }

  return { count: Math.round(value / (60 * 1000)), unit: 'minute' };
}

/**
 * Renders a window length as the tail of "…receipts per ___" — "hour",
 * "30 minutes", "2 hours". Pure and export-tested so the sentence and the
 * `retryAfterMs` hint can never disagree about how long the window is.
 *
 * A count of one drops the number ("per hour", not "per 1 hour"); anything else
 * keeps it.
 *
 * Defensive like the rest of this module: a non-finite or non-positive input
 * (the same broken-Remote-Config shapes `evaluateScanRate` guards against)
 * describes the module default rather than emitting "NaN minutes" to a user.
 */
export function describeWindow(ms: number): string {
  const { count, unit } = splitDuration(
    isFiniteNumber(ms) && ms > 0 ? ms : SCAN_RATE_WINDOW_MS,
  );
  return count === 1 ? unit : `${count} ${unit}s`;
}

/**
 * Renders a wait as the tail of "Try again in ___" — "45 seconds", "1 minute",
 * "90 minutes", "2 hours". The retry-hint counterpart to `describeWindow`,
 * differing ONLY in that the count is always kept: "1 minute" is a quantity the
 * user waits out, whereas "per minute" is a rate denominator.
 *
 * Exists because the hint used to be hardcoded to minutes
 * (`Math.ceil(retryAfterMs / 60_000)`) while the window beside it was rendered
 * by `describeWindow`. With a Remote-Config `windowMs` of 30s that produced
 * "up to N receipts per 30 seconds. Try again in 1 minute" — telling the user to
 * wait twice the whole window. Sharing `splitDuration` is what makes that class
 * of contradiction unrepresentable rather than merely fixed for one case; see
 * its docblock for why the rounding must match.
 *
 * Defensive like the rest of this module: a non-finite or non-positive input
 * renders the smallest whole unit ("1 second") rather than "NaN minutes" or
 * "0 seconds". No wait is ever described as zero — the caller only reaches this
 * when the request was actually blocked.
 */
export function describeDuration(ms: number): string {
  const { count, unit } = splitDuration(isFiniteNumber(ms) && ms > 0 ? ms : 1);
  return `${count} ${unit}${count === 1 ? '' : 's'}`;
}

export function evaluateScanRate(
  current: ScanRateState | null | undefined,
  nowMs: number,
  limit: number = SCAN_RATE_LIMIT,
  windowMs: number = SCAN_RATE_WINDOW_MS,
): ScanRateDecision {
  // A limit below 1 can never allow a scan through the in-window path, and 0 —
  // Remote Config's value for an unpublished key — would hand out exactly one
  // free scan per window forever via the fresh-window paths. A non-positive
  // window makes `elapsed >= windowMs` true on every call, reopening the window
  // each time and switching the limiter off entirely.
  const limitOk = isFiniteNumber(limit) && limit >= 1;
  const windowOk = isFiniteNumber(windowMs) && windowMs > 0;
  // Floored so a fractional limit rounds toward the safer side rather than
  // silently granting the extra scan (2 for a limit of 1.5).
  const effectiveLimit = limitOk ? Math.floor(limit) : SCAN_RATE_LIMIT;
  const effectiveWindowMs = windowOk ? windowMs : SCAN_RATE_WINDOW_MS;
  const usedConfigFallback = !limitOk || !windowOk;

  const decide = (
    allowed: boolean,
    next: ScanRateState,
    retryAfterMs: number,
  ): ScanRateDecision => {
    const base = { allowed, next, retryAfterMs, effectiveLimit, effectiveWindowMs };
    return usedConfigFallback ? { ...base, usedConfigFallback: true } : base;
  };

  const openFreshWindow = () => decide(true, { windowStartMs: nowMs, count: 1 }, 0);

  // Untrusted persisted state — missing, partial, or non-numeric (a usage doc
  // written before these fields existed reads as `{}`). A NaN windowStartMs is
  // especially dangerous: `elapsed` would be NaN forever, so the window would
  // never expire and the user would be locked out permanently with a NaN
  // retryAfterMs. Treat it as no window open yet: one scan, then a real window.
  if (
    !current ||
    !isFiniteNumber(current.windowStartMs) ||
    !isFiniteNumber(current.count) ||
    current.count < 0
  ) {
    return openFreshWindow();
  }

  const elapsed = nowMs - current.windowStartMs;

  // Only a forward-elapsed window expires. A backwards clock (elapsed < 0) must
  // NOT reopen the window, or moving a device clock back grants free scans.
  if (elapsed >= effectiveWindowMs) {
    return openFreshWindow();
  }

  if (current.count >= effectiveLimit) {
    // Clamped to one window on both ends. A windowStartMs in the future is a
    // legitimate block (same branch as a backwards clock — it must not reopen
    // the window), but the raw arithmetic would hand the client a Retry-After
    // of centuries. No clamp can grant a scan; it only bounds the hint.
    const rawRetryMs = current.windowStartMs + effectiveWindowMs - nowMs;
    return decide(false, current, Math.min(effectiveWindowMs, Math.max(0, rawRetryMs)));
  }

  return decide(true, { windowStartMs: current.windowStartMs, count: current.count + 1 }, 0);
}
