import type { User } from 'firebase/auth';

export type AuthGateDecision = 'loading' | 'redirect' | 'allow';

/**
 * Decide what a route guard should do given the current auth state.
 *
 * The key distinction — and the fix for the cold-start "bounce to home" bug — is
 * between "auth has not resolved yet" and "auth resolved to no user":
 *
 *   - `user === undefined` → Firebase has not yet restored the session. We must
 *     KEEP WAITING (show a spinner), never redirect. On a cold start after a long
 *     idle, restoring an expired token requires a network refresh that can take a
 *     few seconds; redirecting during this window is the false logout we are fixing.
 *   - `user === null` → auth has genuinely resolved and there is no signed-in user.
 *     Only now is it safe to redirect to the landing page.
 *   - `user` is a `User` → allow access.
 *
 * `loading` is treated as "still resolving" as well, so the guard waits while the
 * AuthProvider is initializing regardless of the sentinel.
 */
export function getAuthGate(
  loading: boolean,
  user: User | null | undefined
): AuthGateDecision {
  if (loading || user === undefined) return 'loading';
  if (!user) return 'redirect';
  return 'allow';
}
