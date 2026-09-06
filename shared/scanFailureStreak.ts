/**
 * Pure consecutive-failure tracking for AI receipt scans.
 *
 * The rate limiter reserves a slot BEFORE the Gemini call, deliberately (see
 * shared/scanRateLimit.ts). The cost of that correctness is that a user
 * photographing a crumpled receipt burns their whole window without a single
 * success, and the only thing we tell them is how many scans they get per hour
 * — true, and useless. This module tracks how many times in a row extraction
 * failed so the message can escalate to something the user can act on.
 *
 * This changes the MESSAGE ONLY. It must never gate a scan: the user's route
 * out is submitting a better photo, and blocking that route strands them.
 *
 * The critical distinction is whose fault the failure was:
 *  - Gemini answered but the answer was unusable (unparseable JSON, no items,
 *    malformed item) → 'extraction-failure'. Almost always the image.
 *  - Gemini never answered (transport error, timeout, quota from Google) →
 *    'infrastructure-failure'. Our problem, not theirs. Counting these would
 *    tell a user with a perfectly good photo to go take a better one during
 *    an outage, which is worse than saying nothing.
 *
 * No Firebase imports: this file is compiled into the Cloud Functions build via
 * the functions tsconfig, and is unit-tested from tests/ (never from shared/).
 */

/** Consecutive extraction failures before the message switches to photo guidance. */
export const SCAN_FAILURE_STREAK_CAP = 3;

export type ScanOutcome = 'success' | 'extraction-failure' | 'infrastructure-failure';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Sanitizes a streak read from Firestore. Same posture as `evaluateScanRate`:
 * `usage/{userId}` may predate this field, or hold a partial/non-numeric value.
 *
 * A NaN streak is the dangerous one — `NaN + 1` is NaN forever, and both
 * `NaN >= cap` and `NaN < cap` are false, so the streak would be permanently
 * stuck and the guidance could never fire again for that user. Untrusted values
 * collapse to 0, which costs at most a few extra generic messages and can never
 * strand anyone.
 */
function sanitize(current: number | undefined): number {
  if (!isFiniteNumber(current) || current < 0) {
    return 0;
  }
  // Floored, not rounded: a stored 2.7 must not jump the user to the cap early.
  return Math.floor(current);
}

/**
 * Returns the streak to persist after `outcome`.
 *
 * - 'success' → 0. A single good scan clears the slate immediately; the guidance
 *   is about a run of failures, not a lifetime tally.
 * - 'extraction-failure' → current + 1.
 * - 'infrastructure-failure' → current, unchanged (but sanitized, so a corrupt
 *   stored value still gets repaired rather than persisted forever).
 */
export function nextFailureStreak(current: number | undefined, outcome: ScanOutcome): number {
  const base = sanitize(current);

  if (outcome === 'success') {
    return 0;
  }

  if (outcome === 'extraction-failure') {
    return base + 1;
  }

  return base;
}

/**
 * True once the user has failed extraction `cap` times in a row and should be
 * shown photo guidance instead of the generic parse error.
 *
 * `cap` is a parameter for the same reason the rate limiter's limit is: it will
 * come from Remote Config. A non-finite or sub-1 cap falls back to the module
 * default rather than firing the guidance on the very first failure (cap <= 0
 * would make every streak qualify).
 */
export function shouldSuggestDifferentImage(
  streak: number,
  cap: number = SCAN_FAILURE_STREAK_CAP,
): boolean {
  const effectiveCap = isFiniteNumber(cap) && cap >= 1 ? Math.floor(cap) : SCAN_FAILURE_STREAK_CAP;
  return sanitize(streak) >= effectiveCap;
}
