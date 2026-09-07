import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { getRemoteConfig, fetchAndActivate, getString } from 'firebase/remote-config';
import { app } from '@/config/firebase';
import { minimumVersionKeyForPlatform, evaluateVersionGate } from '@shared/versionGate';
import type { VersionGateDecision } from '@shared/versionGate';

/**
 * Reads the running build's version and the published minimum, and decides
 * whether this build must be replaced before it can be used.
 *
 * NEVER THROWS, and never rejects. Every failure path resolves to "allowed".
 * The decision logic in `shared/versionGate.ts` owns the reasoning; this file
 * only supplies its two inputs, and the important property here is that a
 * failure to supply either one is itself a fail-open.
 *
 * WHY A VERSION GATE AT ALL: closing direct client writes to `events` (chunk 3)
 * permanently breaks any installed native binary that still uses the old path.
 * That was recoverable exactly once — iOS 1.0 was never submitted, so the only
 * affected builds were TestFlight ones we could replace. It cannot be recovered
 * again: a check cannot be added to binaries already on people's phones. So it
 * ships in 1.0, before there is anything to strand.
 */

/**
 * How stale a cached minimum may be.
 *
 * Remote Config's client default is 12 hours, which is far too slow for
 * something whose whole job is to react to a backend change that has already
 * shipped. One hour is a compromise: fresh enough that a wall goes up the same
 * working session, slow enough not to be a fetch per app start.
 *
 * Note this cuts BOTH ways and the generous direction is the one that matters —
 * un-walling a user after you retract a bad minimum also takes up to an hour.
 */
const MINIMUM_FETCH_INTERVAL_MS = 60 * 60 * 1000;

/** Cached for the lifetime of the app process; the wall is evaluated once at startup. */
let cachedDecision: VersionGateDecision | null = null;

/** Test seam. Not used in production. */
export function __resetVersionGateCacheForTests(): void {
  cachedDecision = null;
}

/**
 * The running build's version string, or null if it cannot be determined.
 *
 * `App.getInfo()` is native-only — it rejects on web, which is why this is only
 * ever called after the platform check. Null propagates to `unparseable-version`
 * and therefore to "allowed".
 */
async function getCurrentVersion(): Promise<string | null> {
  try {
    const info = await CapApp.getInfo();
    return info?.version ?? null;
  } catch {
    return null;
  }
}

/**
 * The published minimum, or '' when there isn't one.
 *
 * `getString` returns '' for an unpublished or misspelled key, and '' means
 * "no floor" in `evaluateVersionGate` — so a typo in the Remote Config key name
 * cannot brick the installed app. A fetch failure (offline, throttled, no
 * network on first launch) also lands here as ''.
 */
async function getPublishedMinimum(key: string): Promise<string> {
  let remoteConfig: ReturnType<typeof getRemoteConfig>;
  try {
    remoteConfig = getRemoteConfig(app);
    remoteConfig.settings.minimumFetchIntervalMillis = MINIMUM_FETCH_INTERVAL_MS;
    // An empty default is the fail-open default: absent config = no floor.
    remoteConfig.defaultConfig = { [key]: '' };
  } catch {
    // Remote Config could not even be constructed. No floor.
    return '';
  }

  // A FAILED FETCH MUST NOT DISCARD THE ALREADY-ACTIVATED VALUE.
  //
  // This was originally one try block around both calls, which meant a throwing
  // `fetchAndActivate` skipped `getString` entirely and returned ''. That is
  // wrong in production, not just in testing: a user who had already fetched a
  // minimum and then went offline (or got throttled, which is routine given the
  // fetch interval) silently lost the floor. Firebase's model is that a failed
  // fetch leaves previously activated config in place — so refreshing and
  // reading are separate operations, and only the read decides.
  try {
    await fetchAndActivate(remoteConfig);
  } catch {
    // Offline, throttled, unreachable. Fall through and read whatever is
    // already activated locally, which may be nothing.
  }

  try {
    // Returns the last activated value, else `defaultConfig` — '' when no
    // minimum has ever been published, which means "no floor".
    return getString(remoteConfig, key);
  } catch {
    return '';
  }
}

/**
 * Evaluates the gate once per app process.
 *
 * Deliberately NOT re-evaluated on resume or on an interval. A wall that appears
 * under someone mid-task — while they are splitting a bill, or worse, settling
 * one — is far more damaging than one that waits for the next cold start, and
 * the next cold start is never far away on mobile.
 */
export async function checkMinimumVersion(): Promise<VersionGateDecision> {
  if (cachedDecision) return cachedDecision;

  const platform = Capacitor.getPlatform();

  // Short-circuit before touching Remote Config or the App plugin at all: web
  // is served fresh with no service worker, so a stale build cannot exist there
  // and the whole question is moot.
  if (platform !== 'ios' && platform !== 'android') {
    cachedDecision = { updateRequired: false, reason: 'web-never-gated' };
    return cachedDecision;
  }

  // Per-platform key. iOS and Android ship different versions (1.0 vs 1.3), so a
  // single shared floor could never be set to a value that is correct for both.
  const key = minimumVersionKeyForPlatform(platform);
  if (!key) {
    cachedDecision = { updateRequired: false, reason: 'web-never-gated' };
    return cachedDecision;
  }

  const [currentVersion, minimumVersion] = await Promise.all([
    getCurrentVersion(),
    getPublishedMinimum(key),
  ]);

  cachedDecision = evaluateVersionGate({ currentVersion, minimumVersion, platform });
  return cachedDecision;
}
