import { getRemoteConfig, type ServerTemplate } from 'firebase-admin/remote-config';
import { logger } from 'firebase-functions';
import {
  resolveLimit,
  resolvePaywallEnabled,
  FREE_SCANS_PER_MONTH_DEFAULT,
  FREE_ACTIVE_GROUPS_DEFAULT,
  RC_KEY_FREE_SCANS,
  RC_KEY_FREE_GROUPS,
  RC_KEY_PAYWALL_ENABLED,
  type LimitResolution,
} from '../../shared/monetizationLimits.js';

/**
 * Server-side Remote Config for the free-tier caps (spec §5.2).
 *
 * Three properties this module must hold, in priority order:
 *
 *  1. **It can never break scanning or event creation.** Remote Config is a
 *     network dependency on the hot path of a paid, latency-sensitive callable.
 *     Every failure — unreachable, unauthenticated, malformed, absent key —
 *     degrades to the compiled-in defaults. It never throws and never rejects.
 *
 *  2. **A failed fetch leaves enforcement DARK.** `paywallEnabled` falls back to
 *     `false`, so an outage means "nobody is capped", never "everybody is locked
 *     out of the product". This is the asymmetry that matters: over-permitting
 *     costs $0.0004 a scan; over-blocking costs users.
 *
 *  3. **Magnitude, not just type, is bounded** — enforced in
 *     `shared/monetizationLimits.ts`, which owns the reasoning. Chunk 1 measured
 *     a config typo silently disabling a limiter; that must not recur here.
 *
 * ⚠️ THE SERVER TEMPLATE IS A DIFFERENT TEMPLATE FROM THE CLIENT ONE.
 *
 * `getServerTemplate()` reads the `firebase-server` namespace. The Remote Config
 * screen in the Firebase console shows the CLIENT template by default, and
 * publishing there does NOTHING for this code. You must use the
 * **Client/Server selector at the top of the Remote Config page and choose
 * Server**, then publish. (The `firebase remoteconfig:*` CLI commands and the
 * Admin SDK's `publishTemplate` also target the CLIENT namespace only.)
 *
 * This was measured on beta, not theorised: with the client template published
 * and the server one empty, every call logged
 *   `[NOT_FOUND]: Template not found for project number … namespace firebase-server`
 * and fell back to defaults — which means `paywallEnabled: false`, so the caps
 * computed `wouldBlock` correctly and then permitted the action anyway. The
 * failure is SAFE but SILENT: enforcement simply never turns on, and the only
 * signal is one warn per instance. Publishing the same values to the server
 * namespace flipped the identical request from allowed to HTTP 429.
 *
 * NOTE the `.js` on the relative import above. `functions` is `"type": "module"`
 * with `moduleResolution: "bundler"`, which accepts an extensionless specifier
 * and emits it UNCHANGED — a green `tsc` that dies with ERR_MODULE_NOT_FOUND on
 * cold start. Every relative import under `functions/src/` must end in `.js`.
 */

export interface MonetizationLimits {
  freeScansPerMonth: number;
  freeActiveGroups: number;
  /** When false, gates evaluate and LOG but do not block — the dark-launch mode. */
  paywallEnabled: boolean;
  /** True when any value fell back or was clamped. Surfaced for structured logs. */
  degraded: boolean;
}

export const DEFAULT_LIMITS: MonetizationLimits = {
  freeScansPerMonth: FREE_SCANS_PER_MONTH_DEFAULT,
  freeActiveGroups: FREE_ACTIVE_GROUPS_DEFAULT,
  paywallEnabled: false,
  degraded: true,
};

/**
 * Cache TTL. Remote Config is a per-project network call; without this it would
 * run on every scan and every event creation.
 *
 * The cost of caching is kill-switch latency: flipping `paywall_enabled` takes
 * up to this long to reach every warm instance. Five minutes is a deliberate
 * trade — short enough that an emergency switch-off is prompt, long enough that
 * a busy instance is not making a network round-trip per request.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Backoff after a FAILED fetch, when there is no previous good value to serve.
 *
 * Without it, a misconfiguration that never succeeds — the runtime service
 * account missing `firebaseremoteconfig.remoteConfig.get`, or the API not
 * enabled on the project — fires and fails an RPC on EVERY scan and EVERY event
 * creation, on the hot path, forever. It degrades safely (defaults, paywall
 * dark) but the latency and cost are unbounded, and the only signal is a single
 * warn per instance, which is easy to miss across cold starts.
 *
 * Much shorter than the success TTL: a broken config must recover promptly once
 * it is fixed, and this path is the one that would keep the kill switch stuck
 * off. Note that it also means the switch cannot be turned ON while Remote
 * Config is unreachable — verify the runtime SA's IAM before relying on it.
 */
const FAILURE_BACKOFF_MS = 30 * 1000;

let cached: { value: MonetizationLimits; fetchedAtMs: number; isFallback: boolean } | null = null;
let template: ServerTemplate | null = null;

/** Per-instance latches so a persistently broken config warns once, not once per request. */
let warnedFetchFailure = false;
let warnedClamp = false;

/** Test seam: reset module state between cases. Not used in production. */
export function __resetRemoteConfigCacheForTests(): void {
  cached = null;
  template = null;
  warnedFetchFailure = false;
  warnedClamp = false;
}

function logClamps(entries: Array<[string, LimitResolution]>): void {
  const bad = entries.filter(([, r]) => r.clamped);
  if (bad.length === 0) return;
  if (warnedClamp) return;
  warnedClamp = true;
  // Without this line a clamp is invisible, which is exactly how chunk 1's
  // seconds-for-milliseconds typo survived: enforcement quietly ran on a value
  // nobody intended and nothing said so.
  logger.warn('remoteConfigLimits: value(s) clamped or defaulted', {
    clamped: bad.map(([key, r]) => ({
      key,
      reason: r.reason,
      received: r.received,
      used: r.value,
    })),
  });
}

/**
 * Returns the limits in force. Never throws.
 *
 * Serves from cache within the TTL; otherwise fetches and re-evaluates the
 * server template. On ANY error the previous good value is preferred over the
 * bare defaults — a transient network blip should not flip enforcement dark for
 * users who were legitimately being capped a second ago — and the defaults are
 * used only when there has never been a successful fetch.
 */
export async function getMonetizationLimits(): Promise<MonetizationLimits> {
  const now = Date.now();

  // A negative cache entry expires on the SHORT backoff, a real one on the full
  // TTL. Using one timestamp for both was wrong: after the first backoff lapsed,
  // every subsequent failure re-served the placeholder without restamping it, so
  // the very next call retried — and the hot path was back to an RPC per request.
  const ttl = cached?.isFallback ? FAILURE_BACKOFF_MS : CACHE_TTL_MS;
  if (cached && now - cached.fetchedAtMs < ttl) {
    return cached.value;
  }

  try {
    if (!template) {
      template = await getRemoteConfig().getServerTemplate({
        // Defaults baked into the template itself, so `evaluate()` still returns
        // sane values for a key that exists but has no published value.
        defaultConfig: {
          [RC_KEY_FREE_SCANS]: FREE_SCANS_PER_MONTH_DEFAULT,
          [RC_KEY_FREE_GROUPS]: FREE_ACTIVE_GROUPS_DEFAULT,
          [RC_KEY_PAYWALL_ENABLED]: false,
        },
      });
    } else {
      await template.load();
    }

    const config = template.evaluate();

    const scans = resolveLimit(config.getNumber(RC_KEY_FREE_SCANS), FREE_SCANS_PER_MONTH_DEFAULT);
    const groups = resolveLimit(config.getNumber(RC_KEY_FREE_GROUPS), FREE_ACTIVE_GROUPS_DEFAULT);
    logClamps([
      [RC_KEY_FREE_SCANS, scans],
      [RC_KEY_FREE_GROUPS, groups],
    ]);

    const value: MonetizationLimits = {
      freeScansPerMonth: scans.value,
      freeActiveGroups: groups.value,
      paywallEnabled: resolvePaywallEnabled(config.getBoolean(RC_KEY_PAYWALL_ENABLED)),
      degraded: scans.clamped || groups.clamped,
    };

    cached = { value, fetchedAtMs: now, isFallback: false };
    // A recovered fetch re-arms the warning latch, so a flapping config is still
    // visible rather than being silenced by the first failure of the instance.
    warnedFetchFailure = false;
    return value;
  } catch (error) {
    // Drop the handle so the next call rebuilds it rather than reusing a
    // template that may be in a bad state.
    template = null;

    if (!warnedFetchFailure) {
      warnedFetchFailure = true;
      const message = error instanceof Error ? error.message : String(error);

      // A MISSING SERVER TEMPLATE IS A MISCONFIGURATION, NOT A BLIP, and it is
      // the one failure here that is both silent and permanent: enforcement can
      // never turn on, and every gate quietly permits. It gets `error` severity
      // and the actual remedy, because the generic warning below is exactly
      // what let it go unnoticed until it was caught on beta.
      if (/NOT_FOUND|not found/i.test(message) && /firebase-server|namespace/i.test(message)) {
        logger.error(
          'remoteConfigLimits: SERVER Remote Config template is missing — every limit is ' +
            'falling back to defaults and paywall_enabled is therefore FALSE, so no cap can ' +
            'enforce. The server template is SEPARATE from the client one: publish it with ' +
            '`npm run rc:publish -- <beta|prod>`, or in the console via the Client/Server ' +
            'selector → Server.',
          { error: message },
        );
      } else {
        logger.warn('remoteConfigLimits: fetch failed, using last-known/defaults', {
          error: message,
          servingStale: cached !== null,
        });
      }
    }

    if (cached && !cached.isFallback) {
      // A previously-GOOD value: keep serving it, but restamp under the SHORT
      // backoff. Leaving the original timestamp meant a sustained outage that
      // began after one good fetch retried on every single request forever —
      // the exact per-request hot-path cost FAILURE_BACKOFF_MS exists to bound.
      // `isFallback` stays false so the full TTL resumes once a fetch succeeds.
      cached = { ...cached, fetchedAtMs: now - CACHE_TTL_MS + FAILURE_BACKOFF_MS };
      return cached.value;
    }

    // Nothing good has ever been fetched (or the last entry was itself a
    // fallback). Stamp the defaults NOW so the short backoff applies from this
    // moment — otherwise a permanently broken config costs an RPC per request,
    // on the hot path, forever.
    cached = { value: DEFAULT_LIMITS, fetchedAtMs: now, isFallback: true };
    return DEFAULT_LIMITS;
  }
}
