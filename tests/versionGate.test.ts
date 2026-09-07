import { describe, it, expect } from 'vitest';
import {
  compareVersions,
  evaluateVersionGate,
  minimumVersionKeyForPlatform,
  shouldWallNow,
  RC_KEY_MINIMUM_VERSION_IOS,
  RC_KEY_MINIMUM_VERSION_ANDROID,
} from '@shared/versionGate';

const gate = (currentVersion: unknown, minimumVersion: unknown, platform = 'ios') =>
  evaluateVersionGate({ currentVersion, minimumVersion, platform });

describe('compareVersions', () => {
  it('orders by numeric segment', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareVersions('1.2.2', '1.2.3')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  // The classic: '1.10.0' < '1.9.0' as STRINGS. A lexical compare would wall off
  // every user the moment the minor version reached double digits.
  it('compares numerically, not lexically, past single digits', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.9.0', '1.10.0')).toBeLessThan(0);
    expect(compareVersions('10.0.0', '9.0.0')).toBeGreaterThan(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1', '1.0.0')).toBe(0);
    expect(compareVersions('1.2', '1.2.1')).toBeLessThan(0);
  });

  it('ignores segments beyond the third', () => {
    expect(compareVersions('1.2.3.176', '1.2.3')).toBe(0);
  });

  it('accepts a leading v', () => {
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0);
  });

  describe('returns null (cannot compare) rather than guessing', () => {
    it.each([
      ['empty', ''],
      ['whitespace', '   '],
      ['non-numeric', 'latest'],
      ['pre-release suffix', '1.2.3-beta'],
      ['build metadata', '1.2.3+176'],
      ['number', 123],
      ['null', null],
      ['undefined', undefined],
      ['object', {}],
    ])('%s', (_label, bad) => {
      expect(compareVersions(bad, '1.0.0')).toBeNull();
      expect(compareVersions('1.0.0', bad)).toBeNull();
    });
  });
});

describe('evaluateVersionGate', () => {
  describe('the only case that blocks', () => {
    it('walls a build below the published minimum', () => {
      expect(gate('1.0.0', '1.1.0')).toEqual({
        updateRequired: true,
        reason: 'blocked-below-minimum',
      });
    });

    it('blocks on android too', () => {
      expect(gate('1.0.0', '2.0.0', 'android').updateRequired).toBe(true);
    });
  });

  describe('everything else FAILS OPEN', () => {
    // Remote Config returns '' for an unpublished or misspelled key. A typo in a
    // config key name must never be able to brick the installed app.
    it.each([
      ['no minimum published', '1.0.0', ''],
      ['minimum is whitespace', '1.0.0', '   '],
      ['minimum missing entirely', '1.0.0', undefined],
      ['minimum unparseable', '1.0.0', 'latest'],
      ['current version unparseable', 'unknown', '1.1.0'],
      ['current version missing', undefined, '1.1.0'],
      ['both unreadable', null, null],
    ])('%s → allowed', (_label, current, minimum) => {
      expect(gate(current, minimum).updateRequired).toBe(false);
    });

    it('allows an exactly-equal version', () => {
      expect(gate('1.2.0', '1.2.0')).toEqual({ updateRequired: false, reason: 'up-to-date' });
    });

    it('allows a newer version', () => {
      expect(gate('2.0.0', '1.2.0').updateRequired).toBe(false);
    });

    it('reports WHY it allowed, so a silent wall-that-should-have-fired is debuggable', () => {
      expect(gate('1.0.0', '').reason).toBe('no-minimum-published');
      expect(gate('nonsense', '1.1.0').reason).toBe('unparseable-version');
    });
  });

  describe('web is never gated', () => {
    // Web is served fresh and has no service worker, so a stale build cannot
    // exist. A wall there would be a bug a refresh would already have fixed.
    it('lets web through even when far below the minimum', () => {
      expect(gate('0.0.1', '9.9.9', 'web')).toEqual({
        updateRequired: false,
        reason: 'web-never-gated',
      });
    });

    it('lets an unknown platform through', () => {
      expect(gate('0.0.1', '9.9.9', 'electron').updateRequired).toBe(false);
    });
  });

  // Guards the ordering inside the gate: platform is checked before the minimum
  // is parsed, so a malformed minimum can never wall a web client.
  it('never blocks web regardless of how broken the config is', () => {
    for (const min of ['', 'latest', '9.9.9', null, undefined, {}]) {
      expect(gate('1.0.0', min, 'web').updateRequired).toBe(false);
    }
  });
});

describe('minimumVersionKeyForPlatform', () => {
  // ONE KEY PER PLATFORM, with no shared fallback. iOS ships 1.0 and Android
  // ships 1.3 in this repo, so a single shared floor has no correct value:
  // anything that gates Android walls every iOS user, and anything iOS can
  // satisfy can never gate Android.
  it('maps each native platform to its own key', () => {
    expect(minimumVersionKeyForPlatform('ios')).toBe(RC_KEY_MINIMUM_VERSION_IOS);
    expect(minimumVersionKeyForPlatform('android')).toBe(RC_KEY_MINIMUM_VERSION_ANDROID);
    expect(RC_KEY_MINIMUM_VERSION_IOS).not.toBe(RC_KEY_MINIMUM_VERSION_ANDROID);
  });

  it('returns null for web and anything unrecognised, so they are never gated', () => {
    for (const p of ['web', 'electron', '', 'IOS', 'unknown']) {
      expect(minimumVersionKeyForPlatform(p)).toBeNull();
    }
  });

  // A fallback to a shared key would reintroduce the exact trap the split closes.
  it('exposes no shared key to fall back to', () => {
    expect(RC_KEY_MINIMUM_VERSION_IOS).toContain('_ios');
    expect(RC_KEY_MINIMUM_VERSION_ANDROID).toContain('_android');
  });
});

describe('shouldWallNow — a late answer must not wall someone mid-action', () => {
  // VersionGate is at the app root, so raising the wall unmounts everything —
  // and useBillSession drops its pending debounced write on unmount without
  // flushing. A late `true` would therefore silently discard a bill edit.
  it('walls when the answer arrives BEFORE the app has rendered', () => {
    expect(shouldWallNow(true, false)).toBe(true);
  });

  it('does NOT wall once the app is already on screen', () => {
    expect(shouldWallNow(true, true)).toBe(false);
  });

  it('never walls when the build is fine, rendered or not', () => {
    expect(shouldWallNow(false, false)).toBe(false);
    expect(shouldWallNow(false, true)).toBe(false);
  });
});
