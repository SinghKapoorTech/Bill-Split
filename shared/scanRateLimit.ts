/**
 * Pure fixed-window rate limiting for AI receipt scans.
 *
 * This is an ABUSE limiter, not the business quota. It applies to every plan
 * including Pro, and it reserves a slot BEFORE the Gemini call — a limiter that
 * only counted successes would be bypassable by deliberately erroring.
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
}

export function evaluateScanRate(
  current: ScanRateState | null,
  nowMs: number,
  limit: number = SCAN_RATE_LIMIT,
  windowMs: number = SCAN_RATE_WINDOW_MS,
): ScanRateDecision {
  if (!current) {
    return { allowed: true, next: { windowStartMs: nowMs, count: 1 }, retryAfterMs: 0 };
  }

  const elapsed = nowMs - current.windowStartMs;

  // Only a forward-elapsed window expires. A backwards clock (elapsed < 0) must
  // NOT reopen the window, or moving a device clock back grants free scans.
  if (elapsed >= windowMs) {
    return { allowed: true, next: { windowStartMs: nowMs, count: 1 }, retryAfterMs: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      next: current,
      retryAfterMs: Math.max(0, current.windowStartMs + windowMs - nowMs),
    };
  }

  return {
    allowed: true,
    next: { windowStartMs: current.windowStartMs, count: current.count + 1 },
    retryAfterMs: 0,
  };
}
