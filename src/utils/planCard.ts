/**
 * What Settings → Plan says, as a pure function of the monetization hooks.
 *
 * Pure for the same reason `quotaDisclosure.ts` is: the inputs arrive from
 * three async hooks that settle at different times, and the composition is
 * where the bugs live (a Pro subscriber briefly shown "Free", a count nobody
 * enforces). Testing it as a table is cheaper and stronger than rendering.
 *
 * RETURNS `null` — the card is not rendered — in two cases:
 *
 *   - `loading`: any source hook still resolving. A "Free" badge painted for
 *     one commit in front of a paying subscriber is exactly the flash
 *     `useEntitlement` is written to prevent.
 *   - `!paywallEnabled`: the kill switch is dark (prod today, and the rollback
 *     path). The server still COUNTS scans while dark, so "2 of 2 scans used"
 *     would describe a limit nobody is enforcing. Dark has to mean visually
 *     dark, same rule as every chip and wall.
 *
 * Counts are clamped and validated the way `quotaDisclosure.ts` does it: an
 * owner can sit above a limit that was tightened under them ("3 of 2" reads as
 * a bug), and NaN from a half-loaded hook must never reach the screen.
 */
import type { Plan } from '@shared/entitlements';
import { formatResetDate } from '@/utils/quotaDisclosure';

export interface PlanCardInput {
  loading: boolean;
  paywallEnabled: boolean;
  plan: Plan;
  /** Expiry of the plan IN FORCE (from `useEntitlement`), epoch millis. */
  expiresAtMs?: number;
  scansUsed: number;
  scanLimit: number;
  scanResetsAtMs: number;
  groupsActive: number;
  groupLimit: number;
  nowMs: number;
}

export interface PlanCardModel {
  /** "Free", "Pro" or "Trip Pass". */
  planLabel: string;
  /** "until Oct 13, 2027" / "ends Oct 20, 2026", or null when we can't date it. */
  planDetail: string | null;
  scansLine: string;
  groupsLine: string;
  /** Free users only — a paying user is never offered what they already have. */
  showUpgrade: boolean;
}

const PLAN_LABEL: Record<Plan, string> = {
  free: 'Free',
  pro: 'Pro',
  trip_pass: 'Trip Pass',
};

/** A whole, finite, non-negative count, or null. */
function usableCount(n: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.floor(n));
}

/** Limits below 1 are meaningless — `resolveLimit`'s floor is 1. */
function usableLimit(n: number): number | null {
  const v = usableCount(n);
  return v === null || v < 1 ? null : v;
}

/**
 * A renewal/expiry date in the user's LOCAL zone, with the year.
 *
 * Local, unlike `formatResetDate`: the scan period boundary is a UTC month
 * edge, but a subscription renews at an instant, and the user's own calendar
 * is the honest reading of it. The year is load-bearing for an annual plan.
 */
function formatPlanDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function planDetail(plan: Plan, expiresAtMs: number | undefined, nowMs: number): string | null {
  if (plan === 'free') return null;
  // A past date is the billing grace period (Pro stays active while the store
  // retries the card). "until {yesterday}" is false, so say nothing.
  if (typeof expiresAtMs !== 'number' || !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    return null;
  }
  const date = formatPlanDate(expiresAtMs);
  // NOT "renews": the entitlement document has no will-renew flag, and a
  // CANCELLATION webhook deliberately leaves it untouched
  // (shared/revenueCatEvents.ts), so a user who turned auto-renew off would
  // read a renewal that will not happen. "until" is true either way; Phase 4
  // can say "renews" once the SDK's `willRenew` is available.
  return plan === 'pro' ? `until ${date}` : `ends ${date}`;
}

export function planCardModel(input: PlanCardInput): PlanCardModel | null {
  const { loading, paywallEnabled, plan } = input;
  if (loading || !paywallEnabled) return null;

  const planLabel = PLAN_LABEL[plan] ?? PLAN_LABEL.free;
  const detail = planDetail(plan, input.expiresAtMs, input.nowMs);

  if (plan !== 'free') {
    return {
      planLabel,
      planDetail: detail,
      scansLine: 'Unlimited AI scans',
      groupsLine: 'Unlimited active groups',
      showUpgrade: false,
    };
  }

  const scanLimit = usableLimit(input.scanLimit);
  const scansUsed = usableCount(input.scansUsed);
  const reset = formatResetDate(input.scanResetsAtMs);
  const scansLine =
    scanLimit === null || scansUsed === null
      ? 'Free AI scans each month'
      : `${Math.min(scansUsed, scanLimit)} of ${scanLimit} free AI scans used` +
        (reset ? ` · resets ${reset}` : '');

  const groupLimit = usableLimit(input.groupLimit);
  const groupsActive = usableCount(input.groupsActive);
  const groupNoun = groupLimit === 1 ? 'group' : 'groups';
  const groupsLine =
    groupLimit === null || groupsActive === null
      ? 'Limited active groups'
      : `${Math.min(groupsActive, groupLimit)} of ${groupLimit} ${groupNoun} active`;

  return { planLabel, planDetail: null, scansLine, groupsLine, showUpgrade: true };
}
