import { useEntitlement } from '@/hooks/useEntitlement';
import { useScanQuota } from '@/hooks/useScanQuota';
import { useMonetizationConfig } from '@/hooks/useMonetizationConfig';
import { useEventManager } from '@/hooks/useEventManager';
import { useGroupCap } from '@/hooks/useGroupCap';
import { planCardModel, type PlanCardModel } from '@/utils/planCard';

/**
 * The signed-in user's plan, as `planCardModel` describes it — or `null` while
 * anything is loading or the `paywall_enabled` kill switch is dark.
 *
 * Shared by `SubscriptionCard` and `UpgradeCta`, which sit apart on the
 * Settings page. Calling it twice is cheap: the Firestore SDK multiplexes
 * identical doc/query listeners onto one watch target, and the Remote Config
 * read is memoised per session.
 *
 * ALL FOUR loading flags gate the model. Dropping any one lets a subscriber see
 * "Free" + an upgrade offer while that source settles (each is pinned by a
 * test in tests/react/SubscriptionCard.test.tsx).
 */
export function usePlanCardModel(): PlanCardModel | null {
  const entitlement = useEntitlement();
  const quota = useScanQuota();
  const { paywallEnabled, loading: configLoading } = useMonetizationConfig();
  const { events, loading: eventsLoading } = useEventManager();
  const groups = useGroupCap(events, eventsLoading);

  return planCardModel({
    loading: entitlement.loading || quota.loading || configLoading || groups.loading,
    paywallEnabled,
    plan: entitlement.plan,
    expiresAtMs: entitlement.expiresAt,
    scansUsed: quota.used,
    scanLimit: quota.limit,
    scanResetsAtMs: quota.resetsAtMs,
    groupsActive: groups.activeCount,
    groupLimit: groups.limit,
    nowMs: Date.now(),
  });
}
