import { describe, it, expect } from 'vitest';
import {
  resolveLimit,
  resolvePaywallEnabled,
  FREE_SCANS_PER_MONTH_DEFAULT,
  FREE_ACTIVE_GROUPS_DEFAULT,
  LIMIT_MIN,
  LIMIT_MAX,
} from '@shared/monetizationLimits';
import { FREE_SCANS_PER_MONTH } from '@shared/scanQuota';

describe('resolveLimit', () => {
  it('passes a sane value through untouched', () => {
    expect(resolveLimit(10, 5)).toEqual({ value: 10, clamped: false });
  });

  // THE key branch. getNumber() returns 0 for an unpublished or misspelled key.
  // Clamping that up to LIMIT_MIN would hand every user a limit of 1 — a silent,
  // catastrophic TIGHTENING caused by a typo in a config key name.
  it('treats 0 as "key absent" and falls back to the DEFAULT, not to the minimum', () => {
    const r = resolveLimit(0, FREE_SCANS_PER_MONTH_DEFAULT);
    expect(r.value).toBe(FREE_SCANS_PER_MONTH_DEFAULT);
    expect(r.value).not.toBe(LIMIT_MIN);
    expect(r).toMatchObject({ clamped: true, reason: 'absent-or-zero' });
  });

  it('treats negatives the same way', () => {
    expect(resolveLimit(-7, 5)).toMatchObject({
      value: 5,
      clamped: true,
      reason: 'absent-or-zero',
    });
  });

  describe('non-numeric input falls back without throwing', () => {
    it.each([
      ['NaN', Number.NaN],
      ['Infinity', Number.POSITIVE_INFINITY],
      ['-Infinity', Number.NEGATIVE_INFINITY],
      ['a string', '10'],
      ['null', null],
      ['undefined', undefined],
      ['an object', {}],
    ])('%s → default', (_label, raw) => {
      expect(() => resolveLimit(raw, 5)).not.toThrow();
      expect(resolveLimit(raw, 5)).toMatchObject({
        value: 5,
        clamped: true,
        reason: 'not-a-number',
      });
    });
  });

  // The measured chunk-1 bug, in its scan-quota form: an extra-zeros typo must be
  // bounded AND flagged, not silently allowed to disable the cap.
  it('clamps an implausibly large value to the ceiling and reports it', () => {
    expect(resolveLimit(5_000_000, 5)).toMatchObject({
      value: LIMIT_MAX,
      clamped: true,
      reason: 'above-max',
      received: 5_000_000,
    });
  });

  it('floors fractional values before bounding', () => {
    expect(resolveLimit(7.9, 5)).toEqual({ value: 7, clamped: false });
  });

  // 0.5 floors to 0, which is effectively "off" — it must not survive as a
  // fractional limit, and must not be clamped up to a real limit either.
  it('floors a sub-1 fraction to the minimum rather than to zero', () => {
    expect(resolveLimit(0.5, 5)).toMatchObject({
      value: LIMIT_MIN,
      clamped: true,
      reason: 'below-min',
    });
  });

  it('always returns a safe integer inside the bounds', () => {
    for (const raw of [Number.NaN, 0, -1, 0.4, 1, 500, 1e9, '3', null]) {
      const { value } = resolveLimit(raw, 5);
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(LIMIT_MIN);
      expect(value).toBeLessThanOrEqual(LIMIT_MAX);
    }
  });

  it('carries the launch defaults from the spec', () => {
    expect(FREE_SCANS_PER_MONTH_DEFAULT).toBe(2);
    expect(FREE_ACTIVE_GROUPS_DEFAULT).toBe(2);
  });

  // The two scan-cap constants live in different modules for different reasons
  // (`scanQuota` is the arithmetic default, `monetizationLimits` is the Remote
  // Config fallback) and nothing in the type system keeps them in step. A
  // release where they disagree enforces one number and shows the user another.
  it('agrees with the scan-quota module on the free-tier cap', () => {
    expect(FREE_SCANS_PER_MONTH_DEFAULT).toBe(FREE_SCANS_PER_MONTH);
  });
});

describe('resolvePaywallEnabled', () => {
  // A missing/misspelled key yields false from getBoolean(). The failure mode of
  // a broken config must be "nobody is capped", never "everybody is locked out".
  it('defaults to DARK for every non-true value', () => {
    for (const raw of [false, undefined, null, 0, '', 'true', 'yes', 1, {}]) {
      expect(resolvePaywallEnabled(raw)).toBe(false);
    }
  });

  it('enables only on a literal true', () => {
    expect(resolvePaywallEnabled(true)).toBe(true);
  });
});
