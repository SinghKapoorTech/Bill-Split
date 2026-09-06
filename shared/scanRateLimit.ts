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
   * Set when `limit` or `windowMs` was rejected and the module default was used
   * instead. Callers should log this: a silent fallback hides a broken config.
   */
  usedConfigFallback?: boolean;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

  const decide = (allowed: boolean, next: ScanRateState, retryAfterMs: number): ScanRateDecision =>
    usedConfigFallback
      ? { allowed, next, retryAfterMs, usedConfigFallback: true }
      : { allowed, next, retryAfterMs };

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
