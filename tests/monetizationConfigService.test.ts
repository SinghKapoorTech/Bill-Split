import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The CLIENT half of the monetization Remote Config read.
 *
 * Its server twin is `functions/src/remoteConfigLimits.ts`, and the two must
 * agree on every value — the number enforced and the number shown to the user
 * come from one decision (`shared/monetizationLimits.ts`). These tests pin the
 * client half against the same traps the server one documents:
 *
 *   - `getNumber()` returns 0 for an unpublished or MISSPELLED key. Clamping
 *     that to LIMIT_MIN would hand every user a limit of 1. Zero means absent,
 *     and absent means default.
 *   - A failed fetch must NOT discard already-activated config. Firebase's
 *     model is that `fetchAndActivate` failing leaves the last activated values
 *     in place, so refreshing and reading are separate operations and only the
 *     read decides. `minimumVersionService.ts` shipped this bug once.
 *   - Every failure is DARK: `paywallEnabled: false`. An outage must mean
 *     "nobody is capped", never "everybody is walled".
 */

const h = vi.hoisted(() => ({
  getRemoteConfig: vi.fn(),
  fetchAndActivate: vi.fn(),
  getNumber: vi.fn(),
  getBoolean: vi.fn(),
}));

vi.mock('@/config/firebase', () => ({ app: {} }));
vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: h.getRemoteConfig,
  fetchAndActivate: h.fetchAndActivate,
  getNumber: h.getNumber,
  getBoolean: h.getBoolean,
}));

import {
  fetchMonetizationConfig,
  MONETIZATION_FALLBACK,
  __resetMonetizationConfigCacheForTests,
} from '@/services/monetizationConfigService';
import { RC_KEY_FREE_SCANS, RC_KEY_FREE_GROUPS } from '@shared/monetizationLimits';

/** A minimal RemoteConfig handle — the service only ever sets `settings`. */
function handle() {
  return { settings: {}, defaultConfig: {} } as unknown as Record<string, unknown>;
}

/** Publishes a template: numbers by key, plus the paywall boolean. */
function published(values: { scans?: number; groups?: number; paywall?: boolean }) {
  h.getRemoteConfig.mockReturnValue(handle());
  h.fetchAndActivate.mockResolvedValue(true);
  h.getNumber.mockImplementation((_rc: unknown, key: string) => {
    if (key === RC_KEY_FREE_SCANS) return values.scans ?? 0;
    if (key === RC_KEY_FREE_GROUPS) return values.groups ?? 0;
    return 0;
  });
  h.getBoolean.mockReturnValue(values.paywall ?? false);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetMonetizationConfigCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('fetchMonetizationConfig — the happy path', () => {
  it('reads published values', async () => {
    published({ scans: 2, groups: 2, paywall: true });
    await expect(fetchMonetizationConfig()).resolves.toEqual({
      paywallEnabled: true,
      freeScansPerMonth: 2,
      freeActiveGroups: 2,
    });
  });

  it('reads a limit the console has raised', async () => {
    published({ scans: 5, groups: 3, paywall: true });
    const c = await fetchMonetizationConfig();
    expect(c.freeScansPerMonth).toBe(5);
    expect(c.freeActiveGroups).toBe(3);
  });

  it('clamps an extra-zeros typo instead of disabling the cap', async () => {
    published({ scans: 5000, groups: 2, paywall: true });
    expect((await fetchMonetizationConfig()).freeScansPerMonth).toBe(1000);
  });

  it('floors a fractional published value', async () => {
    published({ scans: 2.9, groups: 2, paywall: true });
    expect((await fetchMonetizationConfig()).freeScansPerMonth).toBe(2);
  });
});

describe('fetchMonetizationConfig — an absent key means DEFAULT, not minimum', () => {
  // The single most important branch in shared/monetizationLimits.ts. A
  // misspelled key name reads 0; clamping that up to LIMIT_MIN = 1 would be a
  // catastrophic silent TIGHTENING for the entire user base.
  it('uses the launch default when the key is unpublished (0)', async () => {
    published({ scans: 0, groups: 0, paywall: true });
    const c = await fetchMonetizationConfig();
    expect(c.freeScansPerMonth).toBe(2);
    expect(c.freeActiveGroups).toBe(2);
    expect(c.freeScansPerMonth).not.toBe(1);
  });

  it('uses the default for a negative or non-finite value', async () => {
    for (const bad of [-1, NaN, Infinity]) {
      __resetMonetizationConfigCacheForTests();
      published({ scans: bad, groups: 2, paywall: true });
      expect((await fetchMonetizationConfig()).freeScansPerMonth).toBe(2);
    }
  });
});

describe('fetchMonetizationConfig — every failure is DARK', () => {
  it('falls back to {false, 2, 2} when Remote Config cannot be constructed', async () => {
    h.getRemoteConfig.mockImplementation(() => {
      throw new Error('no remote config');
    });
    await expect(fetchMonetizationConfig()).resolves.toEqual(MONETIZATION_FALLBACK);
    expect(MONETIZATION_FALLBACK.paywallEnabled).toBe(false);
  });

  it('falls back when the value reads themselves throw', async () => {
    h.getRemoteConfig.mockReturnValue(handle());
    h.fetchAndActivate.mockResolvedValue(true);
    h.getNumber.mockImplementation(() => {
      throw new Error('boom');
    });
    h.getBoolean.mockReturnValue(true);
    await expect(fetchMonetizationConfig()).resolves.toEqual(MONETIZATION_FALLBACK);
  });

  it('never rejects, whatever happens', async () => {
    h.getRemoteConfig.mockImplementation(() => {
      throw new Error('nope');
    });
    await expect(fetchMonetizationConfig()).resolves.toBeDefined();
  });

  // THE minimumVersionService BUG. One try block around fetch AND read meant a
  // throwing fetch skipped the read entirely and returned defaults — so a user
  // who had already fetched config and then went offline (or got throttled,
  // which is routine given the fetch interval) silently lost it.
  it('still reads ACTIVATED values when the refresh fails', async () => {
    h.getRemoteConfig.mockReturnValue(handle());
    h.fetchAndActivate.mockRejectedValue(new Error('offline'));
    h.getNumber.mockImplementation((_rc: unknown, key: string) =>
      key === RC_KEY_FREE_SCANS ? 5 : 3,
    );
    h.getBoolean.mockReturnValue(true);

    const c = await fetchMonetizationConfig();
    expect(h.getNumber).toHaveBeenCalled();
    expect(c).toEqual({ paywallEnabled: true, freeScansPerMonth: 5, freeActiveGroups: 3 });
  });
});

describe('fetchMonetizationConfig — the kill switch', () => {
  it('enforces only on a literal true', async () => {
    published({ scans: 2, groups: 2, paywall: true });
    expect((await fetchMonetizationConfig()).paywallEnabled).toBe(true);
  });

  it('is dark for anything that is not literally true', async () => {
    for (const raw of [false, 'true', 1, null, undefined]) {
      __resetMonetizationConfigCacheForTests();
      h.getRemoteConfig.mockReturnValue(handle());
      h.fetchAndActivate.mockResolvedValue(true);
      h.getNumber.mockReturnValue(2);
      h.getBoolean.mockReturnValue(raw as boolean);
      expect((await fetchMonetizationConfig()).paywallEnabled).toBe(false);
    }
  });
});

describe('fetchMonetizationConfig — caching', () => {
  it('serves the cache instead of re-fetching within the TTL', async () => {
    published({ scans: 2, groups: 2, paywall: true });
    await fetchMonetizationConfig();
    await fetchMonetizationConfig();
    await fetchMonetizationConfig();
    expect(h.fetchAndActivate).toHaveBeenCalledTimes(1);
  });

  it('shares ONE in-flight fetch between concurrent callers', async () => {
    // Three walls mounting in the same tick must not open three network calls.
    published({ scans: 2, groups: 2, paywall: true });
    let release: (v: boolean) => void = () => {};
    h.fetchAndActivate.mockReturnValue(
      new Promise<boolean>((res) => {
        release = res;
      }),
    );

    const all = Promise.all([
      fetchMonetizationConfig(),
      fetchMonetizationConfig(),
      fetchMonetizationConfig(),
    ]);
    release(true);
    const [a, b, c] = await all;

    expect(h.fetchAndActivate).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  // The kill switch is the rollback path (verified on beta 2026-09-09) and the
  // launch plan's step 8.5 says walls must vanish within ~5 minutes of
  // publishing `false`. A cache held for the whole app session would leave a
  // wall up on a long-lived mobile session until the next cold start.
  // BOUNDARY, not just "some TTL". Asserting only that it re-fetches after five
  // minutes leaves the constant unpinned in the dangerous direction: CACHE_TTL_MS
  // = 1 passed the previous version of this test, and since the same constant is
  // ALSO the SDK fetch throttle, a bad edit would be doubly invisible.
  it('serves the cache right up to the TTL', async () => {
    vi.useFakeTimers();
    published({ scans: 2, groups: 2, paywall: true });
    await fetchMonetizationConfig();

    vi.advanceTimersByTime(5 * 60 * 1000 - 1);
    await fetchMonetizationConfig();

    expect(h.fetchAndActivate).toHaveBeenCalledTimes(1);
  });

  it('re-fetches once the TTL lapses, so a kill-switch flip reaches the client', async () => {
    vi.useFakeTimers();
    published({ scans: 2, groups: 2, paywall: true });
    expect((await fetchMonetizationConfig()).paywallEnabled).toBe(true);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    h.getBoolean.mockReturnValue(false);

    expect((await fetchMonetizationConfig()).paywallEnabled).toBe(false);
    expect(h.fetchAndActivate).toHaveBeenCalledTimes(2);
  });

  /**
   * THE LINE THAT CARRIES THE ROLLBACK GUARANTEE.
   *
   * The module TTL above only controls how often this module calls
   * `fetchAndActivate`. What controls whether that call actually hits the
   * network is the SDK's own throttle, which defaults to TWELVE HOURS. Drop the
   * assignment and every test above still passes — the module re-fetches every
   * five minutes, the SDK no-ops against fresh cached data, and a twelve-hour
   * old `paywall_enabled` gets re-cached as a good read.
   */
  it('tightens the SDK fetch throttle to the module TTL', async () => {
    const rc = handle();
    h.getRemoteConfig.mockReturnValue(rc);
    h.fetchAndActivate.mockResolvedValue(true);
    h.getNumber.mockReturnValue(2);
    h.getBoolean.mockReturnValue(true);

    await fetchMonetizationConfig();

    expect(
      (rc.settings as { minimumFetchIntervalMillis?: number }).minimumFetchIntervalMillis,
    ).toBe(5 * 60 * 1000);
  });

  it('never LOOSENS an interval another consumer already tightened', async () => {
    // getRemoteConfig(app) is a per-app singleton shared with
    // minimumVersionService, which sets its own (1 hour) interval and defaults.
    const rc = handle();
    (rc.settings as { minimumFetchIntervalMillis?: number }).minimumFetchIntervalMillis = 1000;
    rc.defaultConfig = { minimum_supported_version_ios: '' };
    h.getRemoteConfig.mockReturnValue(rc);
    h.fetchAndActivate.mockResolvedValue(true);
    h.getNumber.mockReturnValue(2);
    h.getBoolean.mockReturnValue(true);

    await fetchMonetizationConfig();

    expect(
      (rc.settings as { minimumFetchIntervalMillis?: number }).minimumFetchIntervalMillis,
    ).toBe(1000);
    // And it must MERGE defaults, not replace them — a plain assignment would
    // silently drop the version gate's key and remove its fail-open default.
    expect(rc.defaultConfig).toHaveProperty('minimum_supported_version_ios', '');
    expect(rc.defaultConfig).toHaveProperty(RC_KEY_FREE_SCANS);
  });

  // A failure is cached on a SHORT backoff, not the full TTL. Caching the dark
  // fallback for five minutes would mean one moment of no connectivity at app
  // start leaves a capped user uncapped — and a Pro user's config unread — for
  // the rest of that window. Not zero either: without a backoff a persistently
  // broken config re-fetches on every mount, and Phase 3's walls mount often.
  it('holds the dark fallback briefly rather than re-fetching on every call', async () => {
    vi.useFakeTimers();
    h.getRemoteConfig.mockImplementation(() => {
      throw new Error('offline');
    });

    expect(await fetchMonetizationConfig()).toEqual(MONETIZATION_FALLBACK);
    await fetchMonetizationConfig();
    await fetchMonetizationConfig();
    expect(h.getRemoteConfig).toHaveBeenCalledTimes(1);
  });

  /**
   * THE COMMON FAILURE, and the one an identity check could not see.
   *
   * `fetchAndActivate` rejects (offline, 429, throttle backoff) on a client
   * that has never activated anything. The reads then return the values baked
   * into `defaultConfig` — structurally identical to MONETIZATION_FALLBACK but
   * a DIFFERENT OBJECT, arriving through the success path. Inferring "did this
   * fall back?" by comparing identity therefore said "no", and the dark
   * fallback was cached for the full five minutes: a client that came back
   * online seconds later stayed dark for the rest of the window.
   */
  it('treats a failed first fetch as degraded, and retries on the SHORT backoff', async () => {
    vi.useFakeTimers();
    h.getRemoteConfig.mockReturnValue(handle());
    h.fetchAndActivate.mockRejectedValue(new Error('offline'));
    // Exactly what defaultConfig would yield: equal to the fallback, not identical.
    h.getNumber.mockReturnValue(2);
    h.getBoolean.mockReturnValue(false);

    expect(await fetchMonetizationConfig()).toEqual(MONETIZATION_FALLBACK);

    // Back online well inside the success TTL.
    vi.advanceTimersByTime(30 * 1000 + 1);
    published({ scans: 2, groups: 2, paywall: true });

    expect((await fetchMonetizationConfig()).paywallEnabled).toBe(true);
  });

  it('gives ACTIVATED config the full TTL even if a later refresh fails', async () => {
    // The other direction: once a fetch has succeeded, the activated values are
    // real config. A later transient failure must not demote them to a 30s
    // retry cadence.
    vi.useFakeTimers();
    published({ scans: 2, groups: 2, paywall: true });
    await fetchMonetizationConfig();

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    h.fetchAndActivate.mockRejectedValue(new Error('offline'));
    expect((await fetchMonetizationConfig()).paywallEnabled).toBe(true);

    vi.advanceTimersByTime(30 * 1000 + 1);
    await fetchMonetizationConfig();
    // Still 2: the second (failed-refresh) read was cached on the FULL ttl.
    expect(h.fetchAndActivate).toHaveBeenCalledTimes(2);
  });

  it('retries once the failure backoff lapses — well before the success TTL', async () => {
    vi.useFakeTimers();
    h.getRemoteConfig.mockImplementationOnce(() => {
      throw new Error('transient');
    });
    expect(await fetchMonetizationConfig()).toEqual(MONETIZATION_FALLBACK);

    vi.advanceTimersByTime(30 * 1000 + 1);
    published({ scans: 2, groups: 2, paywall: true });

    // The important part: this is far short of CACHE_TTL_MS.
    expect((await fetchMonetizationConfig()).paywallEnabled).toBe(true);
  });
});
