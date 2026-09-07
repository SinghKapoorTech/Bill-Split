/**
 * Pure minimum-supported-version logic for the native update wall.
 *
 * WHY THIS EXISTS: chunk 3 closed direct client writes to `events`, which
 * permanently breaks any installed native binary that still calls `addDoc`.
 * That was survivable exactly once, because iOS 1.0 was never submitted — the
 * only affected builds were TestFlight ones we could replace. It will NOT be
 * survivable again: you cannot add a version check to binaries already on
 * people's phones, so the check has to ship IN 1.0, before there is anything to
 * strand. This module is that check.
 *
 * THE ONE RULE: FAIL OPEN. Every ambiguity — no minimum published, an
 * unparseable version on either side, Remote Config unreachable — must resolve
 * to "let them in". An update wall is the most destructive screen in an app: it
 * replaces the entire product with a dead end, and a false positive locks out
 * users who did nothing wrong and have no way to argue. Blocking is only ever
 * correct on positive, well-formed evidence that the build is too old.
 *
 * WEB IS NEVER GATED. The web app is served fresh on every load and has no
 * service worker, so it cannot be stale — the "old version" case does not exist
 * there, and a wall would just be a bug that a refresh would have fixed.
 *
 * No imports. Tests live in `tests/`, never in `shared/`.
 */

/**
 * Remote Config keys holding the lowest native version allowed to run —
 * ONE PER PLATFORM, deliberately, with no shared fallback.
 *
 * A single shared key is a trap, and this repo is already standing in it: iOS
 * ships `1.0` (ios/App/App.xcodeproj MARKETING_VERSION) while Android ships
 * `1.3` (android/app/build.gradle versionName). With one key there is no safe
 * value — anything that actually gates Android (`1.1`+) walls EVERY iOS user,
 * and anything iOS can satisfy (`1.0`) can never gate Android at all. The wall's
 * only button sends people to a store listing still offering the build you just
 * banned, so that mistake is unrecoverable from inside the app.
 *
 * There is no fallback to a shared key on purpose: a fallback would let exactly
 * that bad value apply to both platforms again.
 */
export const RC_KEY_MINIMUM_VERSION_IOS = 'minimum_supported_version_ios';
export const RC_KEY_MINIMUM_VERSION_ANDROID = 'minimum_supported_version_android';

/**
 * The Remote Config key to read for a platform, or null when the platform is
 * not gated at all (web, and anything unrecognised).
 */
export function minimumVersionKeyForPlatform(platform: string): string | null {
  if (platform === 'ios') return RC_KEY_MINIMUM_VERSION_IOS;
  if (platform === 'android') return RC_KEY_MINIMUM_VERSION_ANDROID;
  return null;
}

/**
 * A dotted numeric version, loosely parsed.
 *
 * Returns null for anything that is not at least one numeric segment, which is
 * what drives the fail-open behaviour above. Extra segments beyond the first
 * three are ignored rather than rejected, so a four-part build string
 * ("1.2.3.176") compares on its first three and does not trip the wall.
 */
function parseVersion(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Leading "v" is common in tags and harmless to accept.
  const body = trimmed.startsWith('v') || trimmed.startsWith('V') ? trimmed.slice(1) : trimmed;

  // Reject anything with a pre-release/build suffix rather than guessing at its
  // ordering ("1.2.3-beta" vs "1.2.3" is a judgement call this gate should not
  // be making unilaterally, and guessing wrong locks someone out).
  if (!/^\d+(\.\d+)*$/.test(body)) return null;

  const parts = body.split('.').map((p) => Number.parseInt(p, 10));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return null;

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Standard version ordering: negative if `a < b`, 0 if equal, positive if `a > b`.
 * Returns null when either side is unparseable — callers must treat that as
 * "cannot compare", never as "equal".
 */
export function compareVersions(a: unknown, b: unknown): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return null;

  for (let i = 0; i < 3; i++) {
    // Numeric comparison, NOT string: "1.10.0" is NEWER than "1.9.0", but
    // '1.10.0' < '1.9.0' as strings — a lexical compare here would wall off
    // every user the moment the minor version reached double digits.
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export interface VersionGateInput {
  /** The running build's version, e.g. from Capacitor `App.getInfo()`. */
  currentVersion: unknown;
  /** The published minimum, from Remote Config. Absent/empty means no floor. */
  minimumVersion: unknown;
  /** `Capacitor.getPlatform()` — 'ios' | 'android' | 'web'. */
  platform: string;
}

export interface VersionGateDecision {
  updateRequired: boolean;
  /** Why the gate decided as it did. For logging, and for tests to assert intent. */
  reason:
    | 'blocked-below-minimum'
    | 'web-never-gated'
    | 'no-minimum-published'
    | 'unparseable-version'
    | 'up-to-date';
}

/**
 * Decides whether the running build must be replaced before it can be used.
 *
 * Ordering of the checks is deliberate: platform first, because a web client
 * must be waved through even when the minimum is malformed; then the absence of
 * a minimum, which is the normal steady state until someone publishes one.
 */
export function evaluateVersionGate(input: VersionGateInput): VersionGateDecision {
  // Web updates itself. Never wall it — see the header.
  if (input.platform !== 'ios' && input.platform !== 'android') {
    return { updateRequired: false, reason: 'web-never-gated' };
  }

  // The default state of the world. Remote Config returns '' for an unpublished
  // or misspelled key, and that must mean "no floor", never "block everyone" —
  // a typo in a config key name must not be able to brick the app.
  const minimum = typeof input.minimumVersion === 'string' ? input.minimumVersion.trim() : '';
  if (!minimum) {
    return { updateRequired: false, reason: 'no-minimum-published' };
  }

  const comparison = compareVersions(input.currentVersion, minimum);
  if (comparison === null) {
    // Either side unreadable. We genuinely do not know whether this build is too
    // old, and "do not know" resolves to "let them in".
    return { updateRequired: false, reason: 'unparseable-version' };
  }

  if (comparison < 0) {
    return { updateRequired: true, reason: 'blocked-below-minimum' };
  }

  return { updateRequired: false, reason: 'up-to-date' };
}

/**
 * Whether the wall may be raised RIGHT NOW.
 *
 * The version check is allowed to finish late (the app renders after a bounded
 * wait rather than blocking on the network). A late `updateRequired` must NOT
 * be honoured once the app is already on screen: `VersionGate` sits at the very
 * root, so raising the wall unmounts the entire tree — and `useBillSession`
 * clears its pending debounce timer on unmount WITHOUT flushing, so a user who
 * had started editing a bill would silently lose that edit.
 *
 * Deferring to the next cold start costs nothing (the build is still too old,
 * and the very next launch walls it) and is what the runbook promises: a wall
 * never appears under someone mid-bill.
 */
export function shouldWallNow(updateRequired: boolean, alreadyRendered: boolean): boolean {
  return updateRequired && !alreadyRendered;
}
