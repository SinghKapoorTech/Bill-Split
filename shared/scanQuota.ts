/**
 * Pure monthly scan-quota arithmetic — the FREE-TIER BUSINESS CAP.
 *
 * NOT the same mechanism as `shared/scanRateLimit.ts`, and the two must never
 * be merged. Spec §4.3.1 / §5.4:
 *
 *   | | hourly rate limit | monthly quota (this file) |
 *   | purpose  | anti-abuse, EVERY plan | the free-tier cap      |
 *   | reserved | BEFORE the Gemini call | checked before,        |
 *   |          |                        | committed AFTER success|
 *   | failure  | CONSUMES a slot        | consumes NOTHING       |
 *
 * The asymmetry is deliberate and load-bearing. Refunding an hourly slot
 * reopens the "deliberately error to scan for free" bypass, and by then the
 * Gemini call has usually already been paid for. But charging one of five
 * monthly scans for a scan that returned nothing is indefensible — so this
 * counter increments on success ONLY, which is why it is evaluated and
 * committed in two separate steps rather than reserved up front.
 *
 * Periods are UTC CALENDAR MONTHS, not rolling 30-day windows. The user-facing
 * promise is "resets Oct 1" (spec §4.3.1), and a rolling window cannot say
 * that. UTC rather than local time because the server has no reliable timezone
 * for the user, and a period boundary that moves with the caller's device is a
 * boundary that can be replayed.
 *
 * No imports. Tests live in `tests/`, never in `shared/`.
 */

/** Launch default. Remote Config overrides it — see `shared/monetizationLimits.ts`. */
export const FREE_SCANS_PER_MONTH = 5;

/** Persisted state, read from `usage/{userId}` with timestamps already in millis. */
export interface ScanQuotaState {
  periodStartMs: number;
  count: number;
}

export interface ScanQuotaDecision {
  allowed: boolean;
  /** Scans already consumed in the CURRENT period (0 immediately after a roll). */
  used: number;
  /** Never negative, even if a stored count somehow exceeds the limit. */
  remaining: number;
  /** The limit this decision was actually made against. */
  limit: number;
  /** Start of the period in force — persist this alongside the count. */
  periodStartMs: number;
  /** Start of the NEXT period. This is the "resets Oct 1" date shown to users. */
  resetsAtMs: number;
  /** True when the stored period was stale (or absent) and has rolled over. */
  periodRolled: boolean;
}

/**
 * Start of the UTC calendar month containing `nowMs`.
 *
 * `Date.UTC` (not `new Date(y, m, 1)`) — the latter builds in LOCAL time, which
 * would put the boundary hours away from UTC midnight and shift it twice a year
 * under daylight saving.
 */
export function utcMonthStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

/**
 * Start of the UTC month AFTER the one containing `nowMs`.
 *
 * `getUTCMonth() + 1` is safe at December: `Date.UTC(2026, 12, 1)` normalises to
 * 2027-01-01 rather than overflowing. Do not "fix" this with a manual wrap.
 */
export function utcNextMonthStartMs(nowMs: number): number {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

/**
 * Reads stored state defensively. A `usage/{userId}` document may predate these
 * fields entirely (the normal case for every existing user), or hold a
 * non-numeric value from a bad write.
 *
 * Anything unusable is treated as "no period open yet" — which grants a FRESH
 * period rather than a lockout. That is the right direction for a business cap:
 * the worst case is one user getting a few extra scans in a month, whereas
 * failing closed would deny paying-adjacent users the product entirely over a
 * bookkeeping glitch. (Contrast `reserveScanSlot`, the ABUSE limiter, which
 * fails closed — there the worst case is an unbounded Gemini bill.)
 */
function sanitize(current: ScanQuotaState | null | undefined): ScanQuotaState | null {
  if (!current) return null;
  const { periodStartMs, count } = current;
  if (typeof periodStartMs !== 'number' || !Number.isFinite(periodStartMs)) return null;
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
  return { periodStartMs, count: Math.floor(count) };
}

/**
 * Decides whether one more scan fits in the caller's monthly quota.
 *
 * READ-ONLY: this neither reserves nor consumes. The caller checks this BEFORE
 * the Gemini call and, only on success, commits the increment. Splitting it
 * this way is what keeps a failed scan free (spec §4.3.1).
 *
 * `limit` is already validated and clamped by `shared/monetizationLimits.ts` —
 * it is not re-derived here, so that the number enforced and the number shown
 * to the user come from a single decision.
 */
export function evaluateScanQuota(
  current: ScanQuotaState | null | undefined,
  nowMs: number,
  limit: number = FREE_SCANS_PER_MONTH,
): ScanQuotaDecision {
  const periodStartMs = utcMonthStartMs(nowMs);
  const resetsAtMs = utcNextMonthStartMs(nowMs);
  const stored = sanitize(current);

  // A stored period that is not the current one has expired — including one in
  // the FUTURE, which can only come from a bad write or a clock excursion and
  // must not be able to freeze the counter forever. Equality, not `<`.
  const periodRolled = stored === null || stored.periodStartMs !== periodStartMs;
  const used = periodRolled ? 0 : stored.count;

  return {
    allowed: used < limit,
    used,
    // Clamped at zero: a stored count above the limit (a limit tightened by
    // Remote Config mid-period) must read "0 left", never a negative number.
    remaining: Math.max(0, limit - used),
    limit,
    periodStartMs,
    resetsAtMs,
    periodRolled,
  };
}

/**
 * NOTE: there is deliberately no pure `commitScanQuota` helper.
 *
 * There was one — `{ periodStartMs, count: used + 1 }` — and it was WRONG in a
 * way a pure function cannot fix: it made every writer stamp an absolute count
 * derived from the value it read, so N concurrent scans all read `used = 0` and
 * all wrote `1`. Correct commit behaviour depends on what is stored at the
 * moment of the write (increment in the steady state; reset-or-join on a period
 * rollover), which is by definition not pure.
 *
 * It therefore lives in `functions/src/scanQuotaLimiter.ts`, next to the
 * Firestore semantics it depends on, and is covered by
 * `tests/integration/groupCapAndQuota.int.test.ts` under real concurrency.
 */
