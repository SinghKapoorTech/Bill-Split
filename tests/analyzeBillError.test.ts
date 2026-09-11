import { describe, it, expect } from 'vitest';
import { mapAnalyzeBillError, analyzeBillErrorFrom } from '@/utils/analyzeBillError';
import { capDetailsFromError } from '@/utils/capError';
import { isPaywallTrigger } from '@shared/capErrors';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('mapAnalyzeBillError', () => {
  it('passes the server message through verbatim for functions/resource-exhausted', () => {
    const error = {
      code: 'functions/resource-exhausted',
      message: 'Too many scans. You can scan up to 30 receipts per hour. Try again in 12 minutes.',
    };

    expect(mapAnalyzeBillError(error)).toBe(
      'Too many scans. You can scan up to 30 receipts per hour. Try again in 12 minutes.',
    );
  });

  it('passes the server message through verbatim for functions/failed-precondition', () => {
    const error = {
      code: 'functions/failed-precondition',
      message: 'Your account is not eligible to scan receipts right now.',
    };

    expect(mapAnalyzeBillError(error)).toBe(
      'Your account is not eligible to scan receipts right now.',
    );
  });

  it('passes the server message through verbatim for functions/unavailable', () => {
    // The limiter fails closed and throws `unavailable` with a message written
    // to be read as-is. Wrapping it produced "Failed to analyze receipt:
    // Scanning is temporarily unavailable." — a sentence contradicting itself.
    const error = {
      code: 'functions/unavailable',
      message: 'Scanning is temporarily unavailable. Please try again in a moment.',
    };

    expect(mapAnalyzeBillError(error)).toBe(
      'Scanning is temporarily unavailable. Please try again in a moment.',
    );
    expect(mapAnalyzeBillError(error)).not.toMatch(/Failed to analyze receipt/);
  });

  it('passes an unprefixed unavailable code through verbatim too', () => {
    const error = {
      code: 'unavailable',
      message: 'Scanning is temporarily unavailable. Please try again in a moment.',
    };

    expect(mapAnalyzeBillError(error)).toBe(
      'Scanning is temporarily unavailable. Please try again in a moment.',
    );
  });

  it('still wraps an unavailable error that carries no message', () => {
    expect(mapAnalyzeBillError({ code: 'functions/unavailable' })).toBe(
      'Failed to analyze receipt. Please try again.',
    );
  });

  it('does not pass a bare code string through as the whole message', () => {
    // The reachable platform shape: Cloud Run sheds load, the 503 body is an
    // HTML page rather than the callable error envelope, and the client SDK
    // defaults `message` to the code itself. Passed through, the toast would
    // read exactly "unavailable".
    for (const code of ['unavailable', 'resource-exhausted', 'failed-precondition']) {
      const wrapped = mapAnalyzeBillError({ code: `functions/${code}`, message: code });
      expect(wrapped).toBe(`Failed to analyze receipt: ${code}`);
      expect(wrapped).not.toBe(code);
    }
  });

  it('hits the unauthenticated branch once the functions/ prefix is stripped', () => {
    const error = { code: 'functions/unauthenticated', message: 'The caller is unauthenticated.' };

    expect(mapAnalyzeBillError(error)).toBe('Please sign in to analyze receipts');
  });

  it('hits the invalid-argument branch once the functions/ prefix is stripped', () => {
    const error = { code: 'functions/invalid-argument', message: 'Bad image.' };

    expect(mapAnalyzeBillError(error)).toBe(
      'Invalid image format. Please upload a valid receipt image',
    );
  });

  it('hits the deadline-exceeded branch once the functions/ prefix is stripped', () => {
    const error = { code: 'functions/deadline-exceeded', message: 'Deadline exceeded.' };

    expect(mapAnalyzeBillError(error)).toBe(
      'Analysis timed out. The receipt might be too complex or the service is busy. Please try again.',
    );
  });

  it('falls back to the generic wrapped message for an unknown/unprefixed code', () => {
    const error = { code: 'internal', message: 'Something went wrong server-side.' };

    expect(mapAnalyzeBillError(error)).toBe(
      'Failed to analyze receipt: Something went wrong server-side.',
    );
  });

  it('falls back to the generic message for a plain Error with no code', () => {
    const error = new Error('network blip');

    expect(mapAnalyzeBillError(error)).toBe('Failed to analyze receipt: network blip');
  });

  it('falls back to the default message for a non-object, non-Error value', () => {
    expect(mapAnalyzeBillError('just a string')).toBe(
      'Failed to analyze receipt. Please try again.',
    );
  });
});

/**
 * `analyzeBillErrorFrom` exists because `src/services/gemini.ts` used to throw
 * `new Error(mapAnalyzeBillError(error))`, which flattened the callable error
 * and DESTROYED `.details`. Every scan-quota rejection therefore reached the UI
 * as a bare string, and `capDetailsFromError` returned null 100% of the time —
 * making the scan-quota wall (Phase 3 Task 3.1) impossible to build.
 *
 * The mapped message is still the whole user-facing story; the payload rides
 * alongside it.
 */
describe('analyzeBillErrorFrom — preserves the cap payload', () => {
  const SCAN_QUOTA = {
    reason: 'scan-quota',
    used: 2,
    limit: 2,
    resetsAtMs: Date.UTC(2026, 9, 1),
  };

  function callableError(details: unknown, message: string) {
    return Object.assign(new Error(message), {
      code: 'functions/resource-exhausted',
      message,
      details,
    });
  }

  it('carries scan-quota details through to the client', () => {
    const err = analyzeBillErrorFrom(
      callableError(SCAN_QUOTA, "You've used all 2 free scans this month."),
    );
    expect(err.details).toEqual(SCAN_QUOTA);
    expect(capDetailsFromError(err)).toEqual(SCAN_QUOTA);
  });

  it('still maps the user-facing message exactly as before', () => {
    // The toast reads `error.message`. Preserving details must not change a
    // single character of the copy the user sees.
    const raw = callableError(SCAN_QUOTA, "You've used all 2 free scans this month.");
    expect(analyzeBillErrorFrom(raw).message).toBe(mapAnalyzeBillError(raw));
    expect(analyzeBillErrorFrom(raw).message).toBe("You've used all 2 free scans this month.");
  });

  it('is an Error, so every existing `instanceof Error` consumer keeps working', () => {
    // useReceiptAnalyzer's toast does `error instanceof Error ? error.message : ...`
    expect(analyzeBillErrorFrom(new Error('boom'))).toBeInstanceOf(Error);
  });

  it('leaves details undefined when the payload is unusable', () => {
    // An older deployed function, or a platform 503 with no envelope at all.
    expect(analyzeBillErrorFrom(callableError(undefined, 'nope')).details).toBeUndefined();
    expect(analyzeBillErrorFrom(callableError({ reason: 'bogus' }, 'nope')).details).toBeUndefined();
    expect(analyzeBillErrorFrom('just a string').details).toBeUndefined();
    expect(analyzeBillErrorFrom(null).details).toBeUndefined();
  });

  it('does not mistake the hourly rate limiter for a quota payload', () => {
    // Both are resource-exhausted. Only one is a paywall trigger.
    const err = analyzeBillErrorFrom(
      callableError({ reason: 'scan-rate-limit', retryAfterMs: 60_000 }, 'Slow down.'),
    );
    expect(err.details).toEqual({ reason: 'scan-rate-limit', retryAfterMs: 60_000 });
    expect(isPaywallTrigger(err.details)).toBe(false);
  });
});

/**
 * WIRING assertion over `src/services/gemini.ts`.
 *
 * That module cannot be imported from a unit suite: it calls `getFunctions(app)`
 * at module load, which initializes the Firebase client SDK. Same constraint as
 * `tests/analyzeBillGates.test.ts` and `tests/callableNames.test.ts`, and the
 * same stopgap — read the source.
 *
 * This is here because the factory above is fully covered while the CALL SITE
 * was not: reverting the throw to `new Error(analyzeBillErrorFrom(error).message)`
 * left the entire suite green, which is precisely how the original bug survived.
 * The regression this guards is one keystroke away and completely invisible.
 */
describe('gemini.ts wiring', () => {
  /**
   * Comments are STRIPPED before matching, and the assertion is SCOPED to the
   * catch block. The first version of this did neither, and was broken in both
   * directions — both verified by mutation:
   *
   *   false PASS — leave `// throw analyzeBillErrorFrom(error);` as a comment
   *     and throw something details-discarding underneath: green. The regex was
   *     matching the comment, so the guard blessed the exact regression it
   *     exists to catch.
   *   false FAIL — add an unrelated `throw new Error('no image')` guard at the
   *     top of the function: red. A whole-file ban on a normal construct is not
   *     a statement about `.details`.
   */
  const raw = readFileSync(resolve(__dirname, '../src/services/gemini.ts'), 'utf8');
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  /** The body of `analyzeBillImage`'s catch block, comments already removed. */
  const catchBody = source.match(/catch\s*\(\s*error[^)]*\)\s*\{([\s\S]*?)\n {2}\}/)?.[1] ?? '';

  it('has a catch block this test can actually see', () => {
    // Guards the guard: a refactor that renamed the binding or reshaped the
    // block would otherwise make both assertions below vacuously true.
    expect(catchBody.trim()).not.toBe('');
  });

  it('throws the cap-preserving error from the catch', () => {
    expect(catchBody).toMatch(/throw\s+analyzeBillErrorFrom\(error\);/);
  });

  it('throws nothing else from the catch, so .details cannot be discarded', () => {
    const throws = catchBody.match(/throw\s+[^;]+;/g) ?? [];
    expect(throws).toEqual(['throw analyzeBillErrorFrom(error);']);
  });
});
