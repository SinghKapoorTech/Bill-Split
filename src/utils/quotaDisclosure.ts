/**
 * The free-tier disclosure ladder — how much the UI says about the scan quota,
 * and when.
 *
 * Pure: no React, no Firestore, no clock. Everything it needs is an argument,
 * so the same inputs always produce the same copy and the bands can be tested
 * as a table. The hooks (`useScanQuota`, `useEntitlement`,
 * `useMonetizationConfig`) gather the inputs; this decides what to show.
 *
 * THREE INDEPENDENT MUTES, and all three must be honoured:
 *
 *   - `loading` — the inputs arrive from SEPARATE async hooks that settle at
 *     different times. `useMonetizationConfig` is memoised per session and can
 *     resolve instantly (`paywallEnabled: true`) while `useEntitlement`'s
 *     snapshot is still in flight (`unlimited: false`, the spec'd default) and
 *     `useScanQuota` still reads `remaining: 0`. Composed without this mute,
 *     that put a wall in front of a PAYING SUBSCRIBER for one render.
 *   - `unlimited` — a Pro subscriber has no quota, so a count is meaningless
 *     noise at best and an insult at worst.
 *   - `paywallEnabled` — the Remote Config kill switch. While enforcement is
 *     dark the server STILL counts scans, so `remaining` can legitimately read
 *     0 for a user who is not being capped. Rendering that would show a wall
 *     nobody is enforcing. The switch is also the rollback path (verified on
 *     beta 2026-09-09), so "dark" has to mean visually dark, not just
 *     unenforced.
 *
 * FAILURE DIRECTION IS OPEN, EVERYWHERE. Unusable numbers mute the disclosure
 * rather than assert a cap. `shared/monetizationLimits.ts` states the rule:
 * "a fallback that is too strict locks users out of the product. When in doubt,
 * be generous and log." The server is the real gate and will refuse a scan the
 * client wrongly permitted; the reverse — a client that walls a user the server
 * would have served — is unrecoverable from the user's side.
 *
 * DELIBERATE DEVIATION FROM SPEC 4.3.1: the spec's ladder was written for a
 * limit of 5 and had a "silent" band at 5-4 remaining. At a limit of 2 there is
 * no room for it — the user sees the count from their first scan. `'silent'`
 * stays in the union because it is the spec's vocabulary and Phase 3 switches
 * over these levels, but no input produces it today.
 */

export type DisclosureLevel = 'hidden' | 'silent' | 'ambient' | 'last' | 'wall';

export interface ScanDisclosure {
  level: DisclosureLevel;
  /** Empty string whenever `level` is `'hidden'` — never stale copy. */
  text: string;
}

export interface GroupDisclosure {
  atCap: boolean;
  text: string;
}

const HIDDEN: ScanDisclosure = { level: 'hidden', text: '' };
const NO_CAP: GroupDisclosure = { atCap: false, text: '' };

/**
 * A count we are willing to show a user, floored to a whole unit.
 *
 * Rejects NaN and both infinities. These are not hypothetical: a hook mid-load,
 * a Remote Config value that failed to parse, or a cap-error payload that lost
 * a field in transit all produce them, and each one rendered literal "NaN" into
 * user-facing copy before this existed.
 */
function usableCount(n: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.floor(n);
}

/** A limit is only meaningful at 1 or above — `resolveLimit`'s LIMIT_MIN is 1. */
function usableLimit(n: number): number | null {
  const v = usableCount(n);
  return v === null || v < 1 ? null : v;
}

/**
 * Renders a UTC month boundary as a short date, or `null` if it is not a date
 * we can stand behind.
 *
 * `timeZone: 'UTC'` is load-bearing, NOT a nicety. The period boundary really
 * is UTC (see `shared/scanQuota.ts`) and the server's prose message is
 * formatted UTC-side. Format the same instant in local time and, in any zone
 * behind UTC, the chip reads "Sep 30" while the error beside it says
 * "October 1" — naming the wrong day, not merely a different style.
 *
 * Zero and negatives are rejected along with NaN: `resetsAtMs: 0` is precisely
 * what a loading hook's "safe default" emits, and it used to render "Jan 1",
 * meaning 1970.
 */
function formatReset(resetsAtMs: number): string | null {
  if (typeof resetsAtMs !== 'number' || !Number.isFinite(resetsAtMs) || resetsAtMs <= 0) {
    return null;
  }
  return new Date(resetsAtMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Appends the reset clause when we have a trustworthy date.
 *
 * Spec 4.3.1 says "always show the reset date alongside the count", because a
 * bare count reads as a permanent loss rather than a monthly allowance. But a
 * WRONG date is worse than an absent one, so an unusable boundary degrades the
 * sentence instead of poisoning it.
 */
function withReset(body: string, reset: string | null): string {
  return reset ? `${body} · resets ${reset}` : body;
}

export function scanDisclosure(args: {
  unlimited: boolean;
  paywallEnabled: boolean;
  remaining: number;
  limit: number;
  resetsAtMs: number;
  /** True while any source hook is still resolving. Defaults to settled. */
  loading?: boolean;
}): ScanDisclosure {
  const { unlimited, paywallEnabled, remaining, limit, resetsAtMs, loading = false } = args;

  if (loading || unlimited || !paywallEnabled) return HIDDEN;

  const safeLimit = usableLimit(limit);
  const safeRemaining = usableCount(remaining);
  if (safeLimit === null || safeRemaining === null) return HIDDEN;

  const reset = formatReset(resetsAtMs);

  // `<= 0`, not `=== 0`: `remaining` also arrives from a cap-error payload that
  // has crossed a process boundary, and a negative must read as the wall rather
  // than falling through to "ambient" and inviting a scan that will be refused.
  if (safeRemaining <= 0) {
    // `resolveLimit` permits a limit of 1, which "free scans" mis-numbers.
    const noun = safeLimit === 1 ? 'scan' : 'scans';
    return {
      level: 'wall',
      text: withReset(`You've used your ${safeLimit} free ${noun} this month`, reset),
    };
  }

  if (safeRemaining === 1) {
    return { level: 'last', text: withReset('Last free scan this month', reset) };
  }

  // Everything above 1 is ambient — always plural, since 1 is handled above.
  // Written as the fall-through so that a limit raised by Remote Config
  // (free_scans_per_month is a live key) still lands in a real band instead of
  // an unhandled one.
  return {
    level: 'ambient',
    text: withReset(`${safeRemaining} scans left this month`, reset),
  };
}

/**
 * The active owned-group cap. No ladder here — a group is either at the cap or
 * it is not, because the count changes rarely and there is no "one left"
 * moment worth a different tone.
 *
 * Note the guards are not symmetric with a naive `activeCount < limit`: that
 * comparison is FALSE for NaN, so unusable input used to fall through to
 * `atCap: true` and block group creation for a user whose config had not
 * loaded. Validate first, and only then compare.
 */
export function groupDisclosure(args: {
  unlimited: boolean;
  paywallEnabled: boolean;
  activeCount: number;
  limit: number;
  /** True while the owned-events or config source is still resolving. */
  loading?: boolean;
}): GroupDisclosure {
  const { unlimited, paywallEnabled, activeCount, limit, loading = false } = args;

  if (loading || unlimited || !paywallEnabled) return NO_CAP;

  const safeLimit = usableLimit(limit);
  const safeCount = usableCount(activeCount);
  if (safeLimit === null || safeCount === null) return NO_CAP;

  if (safeCount < safeLimit) return NO_CAP;

  // Clamped: an owner can sit ABOVE a cap that was tightened under them (the
  // 5->2 change did exactly this), and "3 of 2 groups active" reads as a bug.
  return {
    atCap: true,
    text: `${Math.min(safeCount, safeLimit)} of ${safeLimit} groups active`,
  };
}
