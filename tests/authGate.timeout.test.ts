import { describe, it, expect } from 'vitest';
import { getAuthGate } from '@/utils/authGate';

/**
 * AuthContext arms a 10s fallback that does:
 *   setUser(prev => prev === undefined ? null : prev); setLoading(false);
 *
 * These assertions pin what that fallback means for a route guard, because the
 * combination is a FALSE LOGOUT: a slow restore is indistinguishable from
 * "signed out", and ProtectedRoute's <Navigate replace> is permanent — when
 * Firebase answers a second later the user is already stranded on the landing
 * page. Observed in CI as 45s of marketing page on a protected route.
 */
describe('auth gate around the AuthContext 10s fallback', () => {
  it('waits while auth is genuinely unresolved', () => {
    expect(getAuthGate(true, undefined)).toBe('loading');
    expect(getAuthGate(false, undefined)).toBe('loading');
  });

  it('REDIRECTS once the fallback rewrites undefined to null — the false logout', () => {
    // This is the exact state the 10s timer produces for a user whose session
    // is still being restored.
    const afterFallbackFired = getAuthGate(false, null);
    expect(afterFallbackFired).toBe('redirect');
  });

  it('allows a restored user', () => {
    expect(getAuthGate(false, { uid: 'u1' } as never)).toBe('allow');
  });
});
