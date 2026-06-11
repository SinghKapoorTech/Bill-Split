import { describe, it, expect } from 'vitest';
import { getAuthGate } from '@/utils/authGate';

// Regression coverage for the cold-start "bounce to home" bug.
//
// Symptom: opening the app after a long idle, the first click on a protected
// route redirected to the landing page; the second click worked. Root cause was
// that auth was treated as "logged out" (`!loading && !user`) during the window
// where Firebase had not yet restored the (expired-token) session. The fix is to
// distinguish "still resolving" (user === undefined) from "resolved: no user"
// (user === null), so we never redirect until auth has genuinely resolved.

describe('getAuthGate', () => {
  it('keeps waiting while auth is still resolving, even if the loading flag flipped to false early', () => {
    // This is the exact race that caused the bounce: loading forced false by a
    // timeout, but the user has not been restored yet.
    expect(getAuthGate(false, undefined)).toBe('loading');
  });

  it('shows loading while the loading flag is true', () => {
    expect(getAuthGate(true, undefined)).toBe('loading');
    expect(getAuthGate(true, null)).toBe('loading');
  });

  it('redirects only once auth has resolved to no user', () => {
    expect(getAuthGate(false, null)).toBe('redirect');
  });

  it('allows access once a user is resolved', () => {
    expect(getAuthGate(false, { uid: 'abc' } as never)).toBe('allow');
  });
});
