import { describe, it, expect } from 'vitest';
import {
  evaluateScanQuota,
  utcMonthStartMs,
  utcNextMonthStartMs,
  FREE_SCANS_PER_MONTH,
  type ScanQuotaState,
} from '@shared/scanQuota';

const SEP_START = Date.UTC(2026, 8, 1);
const SEP_MID = Date.UTC(2026, 8, 6, 12, 0, 0);
const OCT_START = Date.UTC(2026, 9, 1);

describe('UTC month boundaries', () => {
  it('floors to the first of the UTC month', () => {
    expect(utcMonthStartMs(SEP_MID)).toBe(SEP_START);
    expect(utcNextMonthStartMs(SEP_MID)).toBe(OCT_START);
  });

  // Date.UTC(2026, 12, 1) normalises to 2027-01-01 rather than overflowing.
  it('rolls December into the next YEAR', () => {
    const dec = Date.UTC(2026, 11, 25);
    expect(utcMonthStartMs(dec)).toBe(Date.UTC(2026, 11, 1));
    expect(utcNextMonthStartMs(dec)).toBe(Date.UTC(2027, 0, 1));
  });

  // new Date(y, m, 1) would build these in LOCAL time, putting the boundary
  // hours away from UTC midnight and shifting it twice a year under DST.
  it('is stable at the instant either side of UTC midnight on the 1st', () => {
    expect(utcMonthStartMs(OCT_START - 1)).toBe(SEP_START);
    expect(utcMonthStartMs(OCT_START)).toBe(OCT_START);
  });
});

describe('evaluateScanQuota', () => {
  it('allows the first scan when no usage document exists', () => {
    const d = evaluateScanQuota(null, SEP_MID, 5);
    expect(d).toMatchObject({
      allowed: true,
      used: 0,
      remaining: 5,
      periodStartMs: SEP_START,
      resetsAtMs: OCT_START,
      periodRolled: true,
    });
  });

  it('counts within the period and blocks exactly at the limit', () => {
    const at4 = evaluateScanQuota({ periodStartMs: SEP_START, count: 4 }, SEP_MID, 5);
    expect(at4).toMatchObject({ allowed: true, used: 4, remaining: 1 });

    const at5 = evaluateScanQuota({ periodStartMs: SEP_START, count: 5 }, SEP_MID, 5);
    expect(at5).toMatchObject({ allowed: false, used: 5, remaining: 0 });
  });

  it('rolls over into a new month, resetting the count', () => {
    const d = evaluateScanQuota({ periodStartMs: SEP_START, count: 5 }, OCT_START, 5);
    expect(d).toMatchObject({
      allowed: true,
      used: 0,
      remaining: 5,
      periodStartMs: OCT_START,
      periodRolled: true,
    });
  });

  // A future period can only come from a bad write or a clock excursion, and
  // must not be able to freeze the counter forever. Hence equality, not `<`.
  it('treats a FUTURE stored period as stale rather than honouring it', () => {
    const d = evaluateScanQuota({ periodStartMs: Date.UTC(2027, 0, 1), count: 99 }, SEP_MID, 5);
    expect(d).toMatchObject({
      allowed: true,
      used: 0,
      periodStartMs: SEP_START,
      periodRolled: true,
    });
  });

  describe('malformed stored state grants a fresh period, never a lockout', () => {
    it.each([
      ['NaN count', { periodStartMs: SEP_START, count: Number.NaN }],
      ['Infinity count', { periodStartMs: SEP_START, count: Number.POSITIVE_INFINITY }],
      ['negative count', { periodStartMs: SEP_START, count: -3 }],
      ['string count', { periodStartMs: SEP_START, count: '4' as unknown as number }],
      ['NaN period', { periodStartMs: Number.NaN, count: 2 }],
      ['missing fields', {} as ScanQuotaState],
    ])('%s → fresh period, scan allowed', (_label, state) => {
      const d = evaluateScanQuota(state as ScanQuotaState, SEP_MID, 5);
      expect(d.allowed).toBe(true);
      expect(d.used).toBe(0);
      expect(d.periodRolled).toBe(true);
    });
  });

  // A limit tightened by Remote Config mid-period must read "0 left", never negative.
  it('clamps remaining at zero when the stored count exceeds a tightened limit', () => {
    const d = evaluateScanQuota({ periodStartMs: SEP_START, count: 9 }, SEP_MID, 5);
    expect(d).toMatchObject({ allowed: false, used: 9, remaining: 0 });
  });

  it('defaults to the documented free-tier limit', () => {
    expect(evaluateScanQuota(null, SEP_MID).limit).toBe(FREE_SCANS_PER_MONTH);
    expect(FREE_SCANS_PER_MONTH).toBe(5);
  });

  it('fractional stored counts are floored, not rounded up', () => {
    const d = evaluateScanQuota({ periodStartMs: SEP_START, count: 4.9 }, SEP_MID, 5);
    expect(d).toMatchObject({ allowed: true, used: 4 });
  });
});
