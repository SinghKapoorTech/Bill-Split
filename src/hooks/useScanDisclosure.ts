import { useEntitlement } from '@/hooks/useEntitlement';
import { useScanQuota } from '@/hooks/useScanQuota';
import { useMonetizationConfig } from '@/hooks/useMonetizationConfig';
import { scanDisclosure, type ScanDisclosure } from '@/utils/quotaDisclosure';

export interface ScanDisclosureState extends ScanDisclosure {
  /** Scans consumed this period. Exposed because the wall copy is phrased "used all N". */
  used: number;
  /** Scans left in the current period. Raw fact; prefer `level` for rendering. */
  remaining: number;
  /** The limit in force, from Remote Config. */
  limit: number;
  /** Start of the next UTC month. */
  resetsAtMs: number;
  /** True when the plan lifts the cap. */
  unlimited: boolean;
  /**
   * True while ANY of the three sources is still resolving.
   *
   * ⚠️ THIS IS A MUTE SIGNAL, NOT A SPINNER SIGNAL, and it is NOT guaranteed to
   * settle. `useEntitlement` deliberately stays loading forever after a listener
   * error — `onSnapshot`'s error callback is terminal, and muting beats
   * asserting `free` at someone who may be paying. Driving a skeleton off this
   * would spin indefinitely on a permission-denied. Render NOTHING while it is
   * true; do not render "loading".
   */
  loading: boolean;
}

/**
 * What to show a user about their scan quota. THIS is what UI should consume —
 * not `useScanQuota` directly.
 *
 * WHY THIS EXISTS RATHER THAN LEAVING CALLERS TO COMPOSE IT: the obvious
 * composition is wrong, and wrong in the direction that hurts most.
 * `scanDisclosure()` needs a `loading` that covers ENTITLEMENT as well as the
 * quota, but the only `loading` sitting next to `remaining` is
 * `useScanQuota`'s — which is `snapshotLoading || configLoading` and knows
 * nothing about `entitlements/{uid}`. Two independent listeners on two
 * documents settle in arbitrary order, so a caller wiring up the nearest
 * `loading` gets this, for an ordinary new subscriber:
 *
 *   usage/{uid}        reads 2 of 2 used  (buying Pro does NOT reset the counter)
 *   entitlements/{uid} still in flight    → unlimited: false
 *   → level: 'wall'
 *
 * A wall in front of someone who just paid, held for a network round trip
 * rather than a single render. Composing it once, here, makes that impossible
 * to get wrong at each call site.
 *
 * The equivalent for groups lives inside `useGroupCap`, which consumes
 * `useEntitlement` itself for the same reason.
 */
export function useScanDisclosure(): ScanDisclosureState {
  const { unlimited, loading: entitlementLoading } = useEntitlement();
  const { used, remaining, limit, resetsAtMs, loading: quotaLoading } = useScanQuota();
  const { paywallEnabled, loading: configLoading } = useMonetizationConfig();

  const loading = entitlementLoading || quotaLoading || configLoading;

  const disclosure = scanDisclosure({
    unlimited,
    paywallEnabled,
    remaining,
    limit,
    resetsAtMs,
    loading,
  });

  return { ...disclosure, used, remaining, limit, resetsAtMs, unlimited, loading };
}
