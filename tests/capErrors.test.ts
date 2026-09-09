import { describe, it, expect } from 'vitest';
import {
  isCapErrorDetails,
  isPaywallTrigger,
  type CapErrorDetails,
} from '@shared/capErrors';

const SCAN_QUOTA: CapErrorDetails = {
  reason: 'scan-quota',
  used: 2,
  limit: 2,
  resetsAtMs: Date.UTC(2026, 9, 1),
};
const GROUP_CAP: CapErrorDetails = { reason: 'group-cap', activeCount: 2, limit: 2 };
const RATE_LIMIT: CapErrorDetails = { reason: 'scan-rate-limit', retryAfterMs: 60_000 };

describe('isCapErrorDetails', () => {
  it('accepts every member of the union', () => {
    // All three, deliberately — a predicate that claims `d is CapErrorDetails`
    // while rejecting a valid member is a lie the compiler cannot catch, and it
    // pushes real rate-limit errors into the caller's untyped else branch.
    expect(isCapErrorDetails(SCAN_QUOTA)).toBe(true);
    expect(isCapErrorDetails(GROUP_CAP)).toBe(true);
    expect(isCapErrorDetails(RATE_LIMIT)).toBe(true);
  });

  it('rejects non-objects', () => {
    for (const raw of [null, undefined, 'scan-quota', 42, true, []]) {
      expect(isCapErrorDetails(raw)).toBe(false);
    }
  });

  it('rejects an unknown reason', () => {
    expect(isCapErrorDetails({ reason: 'other' })).toBe(false);
    expect(isCapErrorDetails({})).toBe(false);
  });

  // These cross a process boundary: the client reads them off HttpsError.details,
  // which is JSON that survived a network hop. Checking only `reason` would
  // narrow the type to `{ used: number }` on a payload whose `used` is missing,
  // and the UI would render "You've used undefined of undefined scans".
  it('rejects a known reason carrying a malformed payload', () => {
    expect(isCapErrorDetails({ reason: 'scan-quota' })).toBe(false);
    expect(isCapErrorDetails({ ...SCAN_QUOTA, used: '2' })).toBe(false);
    expect(isCapErrorDetails({ ...SCAN_QUOTA, resetsAtMs: NaN })).toBe(false);
    expect(isCapErrorDetails({ ...GROUP_CAP, activeCount: undefined })).toBe(false);
    expect(isCapErrorDetails({ ...RATE_LIMIT, retryAfterMs: null })).toBe(false);
  });
});

describe('isPaywallTrigger', () => {
  // The whole point of splitting this out. The hourly limiter is anti-abuse and
  // applies to Pro subscribers too, so showing it an upgrade wall would offer a
  // paying user something they already have.
  it('is true for the two business caps', () => {
    expect(isPaywallTrigger(SCAN_QUOTA)).toBe(true);
    expect(isPaywallTrigger(GROUP_CAP)).toBe(true);
  });

  it('is FALSE for the hourly rate limiter', () => {
    expect(isPaywallTrigger(RATE_LIMIT)).toBe(false);
  });

  it('is false for anything that is not cap details at all', () => {
    expect(isPaywallTrigger(null)).toBe(false);
    expect(isPaywallTrigger({ reason: 'other' })).toBe(false);
  });
});
