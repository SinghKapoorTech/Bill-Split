/**
 * `getMonetizationLimits()` — the loader that decides what every cap enforces.
 *
 * It lives in `tests/integration/` for a mechanical reason, not because it
 * needs Firestore: it imports `firebase-admin/remote-config`, which exists only
 * in `functions/node_modules`, and `vitest.integration.config.ts` is the only
 * config that resolves it.
 *
 * WHY THIS IS WORTH TESTING AT ALL: this module is the single point where a
 * Remote Config problem turns into a business decision, and every one of its
 * failure modes is SILENT. A missing server template, a revoked IAM permission,
 * a typo'd key — all of them degrade to "no cap enforces" and none of them
 * surface to a user or a dashboard. The specific behaviours pinned below each
 * exist because getting them wrong costs either money (enforcement stuck off)
 * or an unbounded per-request RPC on the hot path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getServerTemplate = vi.fn();

vi.mock('firebase-admin/remote-config', () => ({
  getRemoteConfig: () => ({ getServerTemplate }),
}));

const { getMonetizationLimits, __resetRemoteConfigCacheForTests, DEFAULT_LIMITS } = await import(
  '../../functions/src/remoteConfigLimits'
);

const CACHE_TTL_MS = 5 * 60 * 1000;
const FAILURE_BACKOFF_MS = 30 * 1000;
const T0 = Date.UTC(2026, 8, 9, 12, 0, 0);

/** A ServerTemplate whose evaluate() returns the supplied raw values. */
function templateReturning(values: Record<string, number | boolean>) {
  const load = vi.fn().mockResolvedValue(undefined);
  return {
    load,
    evaluate: () => ({
      getNumber: (k: string) => (values[k] as number) ?? 0,
      getBoolean: (k: string) => values[k] === true,
    }),
  };
}

const GOOD = {
  free_scans_per_month: 7,
  free_active_groups: 3,
  paywall_enabled: true,
};

describe('getMonetizationLimits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    getServerTemplate.mockReset();
    __resetRemoteConfigCacheForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // (a) the happy path
  it('parses a published template', async () => {
    getServerTemplate.mockResolvedValue(templateReturning(GOOD));

    await expect(getMonetizationLimits()).resolves.toEqual({
      freeScansPerMonth: 7,
      freeActiveGroups: 3,
      paywallEnabled: true,
      degraded: false,
    });
  });

  it('clamps an implausible value and marks the result degraded', async () => {
    // The extra-zeros typo. Enforcement continues on the clamped value rather
    // than on 5000, and `degraded` is what makes that visible.
    getServerTemplate.mockResolvedValue(
      templateReturning({ ...GOOD, free_scans_per_month: 5000 }),
    );

    const limits = await getMonetizationLimits();
    expect(limits.freeScansPerMonth).toBe(1000);
    expect(limits.degraded).toBe(true);
  });

  it('treats an absent key (getNumber -> 0) as "use the default", not "limit of 1"', async () => {
    // THE branch. Clamping 0 up to LIMIT_MIN would hand every user on earth a
    // limit of 1 — a catastrophic silent TIGHTENING caused by a key typo.
    getServerTemplate.mockResolvedValue(
      templateReturning({ ...GOOD, free_scans_per_month: 0, free_active_groups: 0 }),
    );

    const limits = await getMonetizationLimits();
    expect(limits.freeScansPerMonth).toBe(2);
    expect(limits.freeActiveGroups).toBe(2);
    expect(limits.degraded).toBe(true);
  });

  it('enables the paywall only on a literal true', async () => {
    getServerTemplate.mockResolvedValue(
      templateReturning({ ...GOOD, paywall_enabled: 'true' as unknown as boolean }),
    );
    await expect(getMonetizationLimits()).resolves.toMatchObject({ paywallEnabled: false });
  });

  // (b) never fetched successfully
  it('falls back to defaults with the paywall DARK when the first fetch throws', async () => {
    getServerTemplate.mockRejectedValue(new Error('PERMISSION_DENIED'));

    const limits = await getMonetizationLimits();
    expect(limits).toEqual(DEFAULT_LIMITS);
    // Spelled out rather than left to the DEFAULT_LIMITS comparison: this is the
    // fail-safe. If a Remote Config outage could switch enforcement ON, an
    // infrastructure blip would start walling every user of the app at once.
    expect(limits.paywallEnabled).toBe(false);
    expect(limits.degraded).toBe(true);
  });

  it('survives a template that loads but evaluates to garbage', async () => {
    getServerTemplate.mockResolvedValue({
      load: vi.fn().mockResolvedValue(undefined),
      evaluate: () => {
        throw new Error('malformed template');
      },
    });

    await expect(getMonetizationLimits()).resolves.toEqual(DEFAULT_LIMITS);
  });

  // (c) caching
  it('serves from cache within the TTL without re-fetching', async () => {
    getServerTemplate.mockResolvedValue(templateReturning(GOOD));

    await getMonetizationLimits();
    vi.setSystemTime(T0 + CACHE_TTL_MS - 1);
    await getMonetizationLimits();

    expect(getServerTemplate).toHaveBeenCalledTimes(1);
  });

  it('re-evaluates once the TTL lapses', async () => {
    const tmpl = templateReturning(GOOD);
    getServerTemplate.mockResolvedValue(tmpl);

    await getMonetizationLimits();
    vi.setSystemTime(T0 + CACHE_TTL_MS + 1);
    await getMonetizationLimits();

    // The handle is reused; only the template is reloaded. Re-fetching the
    // handle every time would be a needless round-trip.
    expect(getServerTemplate).toHaveBeenCalledTimes(1);
    expect(tmpl.load).toHaveBeenCalledTimes(1);
  });

  // (d) failure AFTER a good fetch.
  //
  // NOTE FOR ANYONE EXTENDING THIS FILE: once a fetch has succeeded the module
  // holds the template handle and refreshes via `template.load()`, NOT via
  // getServerTemplate(). Rejecting getServerTemplate here does nothing and the
  // assertions below would pass against a perfectly healthy fetch — these two
  // tests were written that way first and a mutation caught them. Fail `load`.
  it('keeps serving the last good value when a later refresh fails', async () => {
    const tmpl = templateReturning(GOOD);
    getServerTemplate.mockResolvedValue(tmpl);
    await expect(getMonetizationLimits()).resolves.toMatchObject({ paywallEnabled: true });

    tmpl.load.mockRejectedValue(new Error('network blip'));
    getServerTemplate.mockRejectedValue(new Error('network blip'));
    vi.setSystemTime(T0 + CACHE_TTL_MS + 1);

    // NOT the defaults. A transient blip must not flip enforcement dark for
    // users who were legitimately being capped a second ago.
    await expect(getMonetizationLimits()).resolves.toMatchObject({
      freeScansPerMonth: 7,
      paywallEnabled: true,
    });
  });

  // The regression the comments call out by name: a sustained outage that began
  // after one good fetch used to retry on EVERY request, forever, on the hot
  // path, because the failed entry was returned without being restamped.
  it('bounds retries during a sustained outage instead of fetching per request', async () => {
    const tmpl = templateReturning(GOOD);
    getServerTemplate.mockResolvedValue(tmpl);
    await getMonetizationLimits();

    tmpl.load.mockRejectedValue(new Error('sustained outage'));
    getServerTemplate.mockRejectedValue(new Error('sustained outage'));
    vi.setSystemTime(T0 + CACHE_TTL_MS + 1);
    await getMonetizationLimits();

    const attemptsAfterFirstFailure =
      getServerTemplate.mock.calls.length + tmpl.load.mock.calls.length;

    // Hammer it well inside the backoff window.
    for (let i = 1; i <= 20; i++) {
      vi.setSystemTime(T0 + CACHE_TTL_MS + 1 + i);
      await getMonetizationLimits();
    }

    expect(getServerTemplate.mock.calls.length + tmpl.load.mock.calls.length).toBe(
      attemptsAfterFirstFailure,
    );
  });

  it('retries once the failure backoff lapses, and recovers', async () => {
    getServerTemplate.mockRejectedValueOnce(new Error('cold start failure'));
    await expect(getMonetizationLimits()).resolves.toEqual(DEFAULT_LIMITS);

    getServerTemplate.mockResolvedValue(templateReturning(GOOD));
    vi.setSystemTime(T0 + FAILURE_BACKOFF_MS + 1);

    // A broken config must recover promptly once fixed — this is the path that
    // would otherwise leave the kill switch stuck off.
    await expect(getMonetizationLimits()).resolves.toMatchObject({
      freeScansPerMonth: 7,
      paywallEnabled: true,
    });
  });

  it('never throws, whatever Remote Config does', async () => {
    for (const boom of [new Error('x'), 'a string', null, undefined]) {
      __resetRemoteConfigCacheForTests();
      getServerTemplate.mockRejectedValue(boom);
      await expect(getMonetizationLimits()).resolves.toBeTruthy();
    }
  });
});
