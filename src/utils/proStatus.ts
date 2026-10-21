/**
 * What the app says about a PAYING user's plan — the "you're Pro" side of the
 * plan UI, as a pure function so it can be tested as a table.
 *
 * Deliberately independent of the `paywall_enabled` kill switch, unlike every
 * chip and wall: the switch decides whether FREE users are capped, but someone
 * who has paid must always be able to see that they have. A dark paywall only
 * means nobody is being sold to, not that nobody has bought.
 *
 * RETURNS `null` (render nothing) while the entitlement is loading and for
 * free users — never a guess in either direction.
 */
import type { Plan } from '@shared/entitlements';

export interface ProStatusInput {
  loading: boolean;
  plan: Plan;
  /** Expiry of the plan IN FORCE (from `useEntitlement`), epoch millis. */
  expiresAtMs?: number;
  /** `Capacitor.getPlatform()`. */
  platform: string;
  nowMs: number;
}

export interface ProStatus {
  /** "Divit Pro" or "Trip Pass". */
  title: string;
  /** Text of the small badge (rendered uppercase): "Pro" or "Trip Pass". */
  badge: string;
  /** "Active through Oct 13, 2027", or null when the date is unknown. */
  detail: string | null;
  /**
   * Where the user manages (cancels) the subscription, or null when there is
   * nothing to manage from here: a Trip Pass is a one-time purchase, and the
   * web build cannot know which store sold it.
   */
  manageUrl: string | null;
}

export const APP_STORE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';
export const PLAY_STORE_SUBSCRIPTIONS_URL =
  'https://play.google.com/store/account/subscriptions?package=com.singhkapoortech.divit';

/**
 * A date in the user's LOCAL zone, with the year (load-bearing for an annual
 * plan). "Active through", not "Renews": the entitlement document does not
 * record whether auto-renew is on, and a cancelled subscription still runs to
 * this date — "through" is true in both cases.
 */
function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function proStatus({
  loading,
  plan,
  expiresAtMs,
  platform,
  nowMs,
}: ProStatusInput): ProStatus | null {
  if (loading || plan === 'free') return null;

  // A PAST date is the billing grace period: the store is retrying a failed
  // renewal and the plan is still in force, but "Active through <yesterday>"
  // would be false. Say nothing rather than something wrong.
  const detail =
    typeof expiresAtMs === 'number' && Number.isFinite(expiresAtMs) && expiresAtMs > nowMs
      ? `Active through ${formatDate(expiresAtMs)}`
      : null;

  if (plan === 'trip_pass') {
    return { title: 'Trip Pass', badge: 'Trip Pass', detail, manageUrl: null };
  }

  const manageUrl =
    platform === 'ios'
      ? APP_STORE_SUBSCRIPTIONS_URL
      : platform === 'android'
        ? PLAY_STORE_SUBSCRIPTIONS_URL
        : null;

  return { title: 'Divit Pro', badge: 'Pro', detail, manageUrl };
}
