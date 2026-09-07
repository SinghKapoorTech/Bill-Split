import { describe, it, expect } from 'vitest';
import { mapAnalyzeBillError } from '@/utils/analyzeBillError';

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
