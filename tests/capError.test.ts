import { describe, it, expect } from 'vitest';
import { capDetailsFromError } from '@/utils/capError';
import { isPaywallTrigger } from '@shared/capErrors';

/**
 * Shape of what a Firebase callable actually rejects with. `FirebaseError`
 * carries `code`/`message`, and `HttpsError` details ride along as `.details`
 * — plain JSON that has crossed a process boundary, so it may be anything.
 */
function callableError(details: unknown) {
  return Object.assign(new Error('resource-exhausted'), {
    code: 'functions/resource-exhausted',
    details,
  });
}

const SCAN_QUOTA = { reason: 'scan-quota', used: 2, limit: 2, resetsAtMs: Date.UTC(2026, 9, 1) };
const GROUP_CAP = { reason: 'group-cap', activeCount: 2, limit: 2 };
const RATE_LIMIT = { reason: 'scan-rate-limit', retryAfterMs: 60_000 };

describe('capDetailsFromError — extraction', () => {
  it('pulls a scan-quota payload off a callable error', () => {
    expect(capDetailsFromError(callableError(SCAN_QUOTA))).toEqual(SCAN_QUOTA);
  });

  it('pulls a group-cap payload off a callable error', () => {
    expect(capDetailsFromError(callableError(GROUP_CAP))).toEqual(GROUP_CAP);
  });

  it('pulls a rate-limit payload off a callable error', () => {
    expect(capDetailsFromError(callableError(RATE_LIMIT))).toEqual(RATE_LIMIT);
  });
});

describe('capDetailsFromError — returns null rather than throwing', () => {
  // This runs inside a catch block. It must never be the thing that throws.
  const rejected: Array<[string, unknown]> = [
    ['null', null],
    ['undefined', undefined],
    ['a bare string', 'resource-exhausted'],
    ['a number', 429],
    ['an error with no details', new Error('boom')],
    ['details that are null', callableError(null)],
    ['details that are a string', callableError('scan-quota')],
    ['details that are an array', callableError([SCAN_QUOTA])],
    ['an unknown reason', callableError({ reason: 'disk-full', limit: 2 })],
    // A field lost in transit, or an older deployed function. Narrowing on
    // `reason` alone would render "You've used undefined of undefined scans".
    ['scan-quota missing resetsAtMs', callableError({ reason: 'scan-quota', used: 2, limit: 2 })],
    [
      'scan-quota with a non-numeric limit',
      callableError({ reason: 'scan-quota', used: 2, limit: '2', resetsAtMs: 0 }),
    ],
    ['group-cap missing activeCount', callableError({ reason: 'group-cap', limit: 2 })],
  ];

  for (const [name, err] of rejected) {
    it(`returns null for ${name}`, () => {
      expect(capDetailsFromError(err)).toBeNull();
    });
  }
});

describe('the rate limiter is not a paywall trigger', () => {
  // Offering an upgrade to a Pro subscriber who merely scanned too fast is a
  // lie. This is the one distinction the UI must not collapse.
  it('narrows scan-quota and group-cap as triggers', () => {
    expect(isPaywallTrigger(capDetailsFromError(callableError(SCAN_QUOTA)))).toBe(true);
    expect(isPaywallTrigger(capDetailsFromError(callableError(GROUP_CAP)))).toBe(true);
  });

  it('does NOT narrow scan-rate-limit as a trigger, though it IS a cap error', () => {
    const details = capDetailsFromError(callableError(RATE_LIMIT));
    expect(details).not.toBeNull();
    expect(isPaywallTrigger(details)).toBe(false);
  });
});
