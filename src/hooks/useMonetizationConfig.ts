import { useEffect, useState } from 'react';
import {
  fetchMonetizationConfig,
  MONETIZATION_FALLBACK,
  type MonetizationConfig,
} from '@/services/monetizationConfigService';

export interface MonetizationConfigState extends MonetizationConfig {
  /** True until the first read settles. Every consumer must honour it. */
  loading: boolean;
}

/**
 * How often a MOUNTED consumer re-asks the service.
 *
 * Shorter than the service's five-minute TTL on purpose: this is the polling
 * grain, not the network grain. Most ticks are a cache hit costing one object
 * comparison, and the effect is that a config change is picked up within about
 * a minute of the TTL lapsing rather than never.
 */
const REVALIDATE_MS = 60 * 1000;

/** Value equality, so revalidation does not re-render on an unchanged config. */
function sameConfig(a: MonetizationConfig, b: MonetizationConfig): boolean {
  return (
    a.paywallEnabled === b.paywallEnabled &&
    a.freeScansPerMonth === b.freeScansPerMonth &&
    a.freeActiveGroups === b.freeActiveGroups
  );
}

/**
 * The monetization Remote Config, as React state.
 *
 * WHY `loading` IS NOT COSMETIC. The disclosure ladder mutes itself while any
 * input is loading, and that mute is the only thing standing between a PAYING
 * SUBSCRIBER and a wall flashed at them for a render: this hook can resolve
 * from the service's cache almost instantly (`paywallEnabled: true`) while
 * `useEntitlement`'s Firestore snapshot is still in flight and therefore still
 * reporting the spec'd default of `free`. Composed without the mute, that is a
 * wall in front of someone who already paid.
 *
 * The interim value is the DARK fallback rather than "nothing", so even a
 * consumer that ignores `loading` renders the safe thing.
 *
 * De-duping lives in the service, not here — every consumer calls it and the
 * service serves one cached value (and joins one in-flight request) across all
 * of them. Deliberately no context provider: the service cache already makes
 * this cheap, and a provider would add a wiring requirement to every screen
 * Phase 3 touches for no benefit.
 */
export function useMonetizationConfig(): MonetizationConfigState {
  const [config, setConfig] = useState<MonetizationConfig>(MONETIZATION_FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Guards the post-await state write.
    //
    // UNTESTED ON PURPOSE — React 18.3 makes a post-unmount `setState` a silent
    // no-op and no longer warns, so removing this guard has no observable
    // effect and any test claiming to cover it would be unfalsifiable (one was
    // written, and mutation-testing exposed it). Kept because it is standard
    // practice, costs three lines, and stays correct if this effect ever does
    // more than set state.
    let active = true;

    const read = () =>
      fetchMonetizationConfig()
        .then((value) => {
          if (!active) return;
          // Only re-render when something actually changed. Revalidation runs
          // on a timer and on every foreground, and almost always returns the
          // identical cached value.
          setConfig((prev) => (sameConfig(prev, value) ? prev : value));
        })
        // The service is documented never to reject. If that contract is ever
        // broken this must still SETTLE — staying in `loading` forever would
        // mute every disclosure permanently, which looks exactly like "the
        // paywall is off" and would hide a real cap indefinitely.
        .catch(() => {
          if (!active) return;
          setConfig(MONETIZATION_FALLBACK);
        })
        .finally(() => {
          if (!active) return;
          setLoading(false);
        });

    void read();

    // REVALIDATION IS NOT OPTIONAL POLISH.
    //
    // The service caches for five minutes, but a cache only expires if someone
    // ASKS again. With a mount-only fetch the five-minute TTL is unreachable
    // from a screen that stays mounted — and Phase 3 mounts the scan wall
    // inside the uploader, which is exactly where a user sits. `paywall_enabled`
    // is the rollback path (plan step 8.5: "publish false, wait 5 min, confirm
    // walls vanish"), so a wall that outlives its own kill switch until the user
    // happens to navigate away defeats the one emergency control this feature
    // has. Beta QA would not catch it, because navigating away remounts.
    //
    // Both triggers are cheap: each one hits the service's cache and returns
    // without a network call unless the TTL has genuinely lapsed.
    const interval = setInterval(read, REVALIDATE_MS);

    // Covers the Capacitor case the interval cannot: a backgrounded app whose
    // timers are throttled or suspended, resumed hours later. The web view
    // fires `visibilitychange` on resume, so this serves native and web alike.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      active = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return { ...config, loading };
}
