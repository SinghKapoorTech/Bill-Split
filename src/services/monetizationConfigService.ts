import { getRemoteConfig, fetchAndActivate, getNumber, getBoolean } from 'firebase/remote-config';
import { app } from '@/config/firebase';
import {
  resolveLimit,
  resolvePaywallEnabled,
  FREE_SCANS_PER_MONTH_DEFAULT,
  FREE_ACTIVE_GROUPS_DEFAULT,
  RC_KEY_FREE_SCANS,
  RC_KEY_FREE_GROUPS,
  RC_KEY_PAYWALL_ENABLED,
} from '@shared/monetizationLimits';

/**
 * The CLIENT half of the monetization Remote Config read.
 *
 * Its twin is `functions/src/remoteConfigLimits.ts`, and the two must agree on
 * every value: the number the server ENFORCES and the number the UI SHOWS have
 * to come from one decision, or the app will promise a user two scans while the
 * backend grants five. Both sides therefore parse through the same
 * `shared/monetizationLimits.ts` resolvers rather than reading raw values.
 *
 * ⚠️ TWO TEMPLATES, TWO NAMESPACES. This module reads the `firebase` (client)
 * namespace; the Cloud Functions read `firebase-server`. They are separate
 * templates that can hold different values. `npm run rc:publish -- <env>`
 * publishes the repo's JSON to BOTH, which is the only reason this file can
 * assume they match — publishing through the Firebase console or the
 * `firebase remoteconfig:*` CLI updates the CLIENT one only, and that
 * asymmetry has already caused a silent enforcement outage on beta
 * (see the header of `functions/src/remoteConfigLimits.ts`).
 *
 * NEVER THROWS, and every failure is DARK — `paywallEnabled: false`. An outage
 * means "nobody is capped", never "everybody is walled". The server is the real
 * gate and will still refuse a scan this module wrongly permitted; the reverse
 * is not recoverable from the user's side.
 */

export interface MonetizationConfig {
  paywallEnabled: boolean;
  freeScansPerMonth: number;
  freeActiveGroups: number;
}

/**
 * Fail-safe. Identical to the server's `DEFAULT_LIMITS` minus the `degraded`
 * flag, which is a server-log concern.
 */
export const MONETIZATION_FALLBACK: MonetizationConfig = Object.freeze({
  paywallEnabled: false,
  freeScansPerMonth: FREE_SCANS_PER_MONTH_DEFAULT,
  freeActiveGroups: FREE_ACTIVE_GROUPS_DEFAULT,
});

/**
 * How long a resolved config is served before another fetch is attempted, and
 * how stale Remote Config itself may be.
 *
 * Matched to the server's `CACHE_TTL_MS` so the two halves converge at the same
 * rate after a publish. It is NOT "cache for the app session": the kill switch
 * is the rollback path (verified on beta 2026-09-09) and step 8.5 of the launch
 * plan requires walls to disappear within about five minutes of publishing
 * `false`. A session-long cache would leave a wall standing on a long-lived
 * mobile session until the next cold start — which is exactly the situation a
 * rollback exists to end quickly.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Backoff after a load that fell back, when there is no good value to serve.
 *
 * Deliberately much shorter than the success TTL, and for the same reason the
 * server twin has one: a failure must recover PROMPTLY once whatever broke is
 * fixed. Caching the dark fallback for a full five minutes would mean one
 * moment of no connectivity at app start leaves a legitimately-capped user
 * uncapped — and a Pro user's config unread — for the rest of that window.
 *
 * Not zero, though: without any backoff a persistently broken config re-fetches
 * on every mount, and the walls and chips of Phase 3 mount often.
 */
const FAILURE_BACKOFF_MS = 30 * 1000;

let cached: { value: MonetizationConfig; fetchedAtMs: number; isFallback: boolean } | null = null;
/** De-dupes concurrent callers so N walls mounting together make ONE network call. */
let inFlight: Promise<MonetizationConfig> | null = null;
/**
 * Has a fetch EVER succeeded in this process?
 *
 * Load-bearing for the backoff. When `fetchAndActivate` fails and nothing has
 * ever been activated, `getNumber` returns the values baked into
 * `defaultConfig` — which are structurally identical to `MONETIZATION_FALLBACK`
 * but arrive through the success path. Without this flag the module cannot tell
 * "read the real config" from "read my own defaults because the network failed",
 * and would cache the latter for the full TTL instead of retrying on the short
 * backoff. The server twin marks the same case `isFallback: true`.
 */
let everFetchedOk = false;

/** Test seam: reset module state between cases. Not used in production. */
export function __resetMonetizationConfigCacheForTests(): void {
  cached = null;
  inFlight = null;
  everFetchedOk = false;
}

interface LoadResult {
  value: MonetizationConfig;
  /** True when the value is a fallback/baked default rather than real config. */
  degraded: boolean;
}

async function load(): Promise<LoadResult> {
  let remoteConfig: ReturnType<typeof getRemoteConfig>;
  try {
    remoteConfig = getRemoteConfig(app);

    // ⚠️ `getRemoteConfig(app)` returns a per-app SINGLETON, shared with every
    // other Remote Config consumer in the client — today that is
    // `minimumVersionService.ts`, which sets a 1-hour interval and its own
    // defaults. Both run at app start, so these fields are last-writer-wins.
    // Hence: MERGE the defaults rather than replacing them (a plain assignment
    // silently drops the version gate's `minimum_supported_version_*` keys),
    // and only ever TIGHTEN the fetch interval.
    const existingInterval = remoteConfig.settings.minimumFetchIntervalMillis;
    remoteConfig.settings.minimumFetchIntervalMillis =
      typeof existingInterval === 'number' && existingInterval > 0
        ? Math.min(existingInterval, CACHE_TTL_MS)
        : CACHE_TTL_MS;

    // THIS LINE CARRIES THE ENTIRE ROLLBACK GUARANTEE. Without it the SDK's own
    // default applies — TWELVE HOURS — and the module-level TTL above becomes
    // decorative: it would re-run `fetchAndActivate` every five minutes, the
    // SDK would resolve it as a no-op against still-fresh cached data, and the
    // twelve-hour-old `paywall_enabled` would be re-cached as a good read.
    // Kill-switch latency silently becomes half a day. Pinned by a test.

    // Baked in so a key that exists but has never been published still reads a
    // sane value rather than 0.
    remoteConfig.defaultConfig = {
      ...remoteConfig.defaultConfig,
      [RC_KEY_FREE_SCANS]: FREE_SCANS_PER_MONTH_DEFAULT,
      [RC_KEY_FREE_GROUPS]: FREE_ACTIVE_GROUPS_DEFAULT,
      [RC_KEY_PAYWALL_ENABLED]: false,
    };
  } catch {
    // Remote Config could not even be constructed. Stay dark.
    return { value: MONETIZATION_FALLBACK, degraded: true };
  }

  // A FAILED FETCH MUST NOT DISCARD THE ALREADY-ACTIVATED VALUES.
  //
  // Firebase's model is that a failed `fetchAndActivate` leaves previously
  // activated config in place, so refreshing and reading are separate
  // operations and only the read decides. Wrapping both in one try block is a
  // real shipped bug — see the same note in `minimumVersionService.ts`: a user
  // who had fetched once and then went offline (or got throttled, which is
  // routine at this fetch interval) silently dropped back to defaults.
  let fetchFailed = false;
  try {
    await fetchAndActivate(remoteConfig);
    everFetchedOk = true;
  } catch {
    // Offline, throttled, unreachable. Read whatever is already activated.
    fetchFailed = true;
  }

  try {
    // `getNumber` returns 0 for an unpublished OR MISSPELLED key, and
    // `resolveLimit` deliberately maps 0 to the default rather than clamping it
    // up to LIMIT_MIN — clamping would silently hand every user a limit of 1.
    const scans = resolveLimit(
      getNumber(remoteConfig, RC_KEY_FREE_SCANS),
      FREE_SCANS_PER_MONTH_DEFAULT,
    );
    const groups = resolveLimit(
      getNumber(remoteConfig, RC_KEY_FREE_GROUPS),
      FREE_ACTIVE_GROUPS_DEFAULT,
    );

    return {
      value: {
        // Only a literal `true` enables enforcement. `getBoolean` also returns
        // false for a missing key, so a typo leaves the paywall dark.
        paywallEnabled: resolvePaywallEnabled(getBoolean(remoteConfig, RC_KEY_PAYWALL_ENABLED)),
        freeScansPerMonth: scans.value,
        freeActiveGroups: groups.value,
      },
      // A failed refresh is only degraded if nothing was ever activated — in
      // that case these values came from `defaultConfig`, not from the console.
      // If a fetch HAS succeeded before, the activated values are real config
      // and deserve the full TTL.
      degraded: fetchFailed && !everFetchedOk,
    };
  } catch {
    return { value: MONETIZATION_FALLBACK, degraded: true };
  }
}

/**
 * The monetization config in force. Never throws, never rejects.
 *
 * Serves the cache within the TTL, otherwise refreshes. A failure resolves to
 * the dark fallback and is NOT cached as if it were good — the next call after
 * the TTL retries, so a transient blip does not pin the client to defaults.
 */
export function fetchMonetizationConfig(): Promise<MonetizationConfig> {
  const now = Date.now();

  // A fallback entry expires on the SHORT backoff, a real one on the full TTL.
  const ttl = cached?.isFallback ? FAILURE_BACKOFF_MS : CACHE_TTL_MS;
  if (cached && now - cached.fetchedAtMs < ttl) {
    return Promise.resolve(cached.value);
  }

  // Concurrent callers join the in-flight request rather than starting their
  // own. Without this, every wall and chip mounting in the same tick opens a
  // separate fetch.
  if (inFlight) return inFlight;

  inFlight = load()
    .then(({ value, degraded }) => {
      // `degraded` is reported explicitly rather than inferred by comparing the
      // result to MONETIZATION_FALLBACK. Identity comparison looked equivalent
      // and was not: the COMMON failure — a rejected `fetchAndActivate` on a
      // client with nothing activated — returns a fresh object read from
      // `defaultConfig` that is structurally equal to the fallback but not
      // `===` it. That was cached as a good read for the full five minutes, so
      // a client that came online 30s later stayed dark for the rest of it.
      cached = { value, fetchedAtMs: Date.now(), isFallback: degraded };
      return value;
    })
    .catch(() => MONETIZATION_FALLBACK)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}
