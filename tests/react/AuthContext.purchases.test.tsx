/**
 * AuthProvider ↔ RevenueCat identity.
 *
 * Two properties:
 *   1. Every auth change hands RevenueCat the Firebase uid (or null on sign-out).
 *      If this wiring regresses, every purchase arrives anonymous and the webhook
 *      cannot attach it — customers pay and get nothing.
 *   2. Billing NEVER gates auth. A RevenueCat call that hangs or throws must not
 *      delay `user`, or a vendor incident becomes a full app outage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  authCb: null as null | ((u: unknown) => void),
  authErr: null as null | ((e: unknown) => void),
  syncPurchaser: vi.fn(),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (u: unknown) => void, err: (e: unknown) => void) => {
    h.authCb = cb;
    h.authErr = err;
    return () => undefined;
  },
  signInWithPopup: vi.fn(),
  signInWithCredential: vi.fn(),
  GoogleAuthProvider: { credential: vi.fn() },
  OAuthProvider: vi.fn(),
  signOut: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('@/config/firebase', () => ({ auth: {}, googleProvider: {} }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));
vi.mock('@capacitor-firebase/authentication', () => ({ FirebaseAuthentication: {} }));
vi.mock('@/services/userService', () => ({
  userService: { syncUserProfile: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('@/services/invitationService', () => ({
  acceptPendingInvitations: vi.fn().mockResolvedValue(0),
}));
vi.mock('@/services/purchaseService', () => ({ syncPurchaser: h.syncPurchaser }));

import { AuthProvider, useAuth } from '@/contexts/AuthContext';

function Probe() {
  const { user } = useAuth();
  return <div data-testid="uid">{user === undefined ? 'pending' : (user?.uid ?? 'none')}</div>;
}

const renderAuth = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

beforeEach(() => {
  h.authCb = null;
  h.syncPurchaser.mockReset().mockResolvedValue(undefined);
});

describe('AuthProvider → RevenueCat identity', () => {
  it('hands RevenueCat the Firebase uid on sign-in', () => {
    renderAuth();
    act(() => h.authCb!({ uid: 'uid-alice' }));
    expect(h.syncPurchaser).toHaveBeenCalledWith('uid-alice');
  });

  it('hands RevenueCat null on sign-out', () => {
    renderAuth();
    act(() => h.authCb!({ uid: 'uid-alice' }));
    act(() => h.authCb!(null));
    expect(h.syncPurchaser).toHaveBeenLastCalledWith(null);
  });
});

describe('AuthProvider → RevenueCat on an auth error', () => {
  it('forgets the purchaser when the auth listener errors and the app treats the user as signed out', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    renderAuth();
    act(() => h.authCb!({ uid: 'uid-alice' }));
    act(() => h.authErr!(new Error('auth broke')));
    expect(screen.getByTestId('uid')).toHaveTextContent('none');
    expect(h.syncPurchaser).toHaveBeenLastCalledWith(null);
    err.mockRestore();
  });
});

describe('AuthProvider — billing never gates auth', () => {
  it('resolves the user even while RevenueCat hangs forever', () => {
    h.syncPurchaser.mockReturnValue(new Promise(() => undefined));
    renderAuth();
    act(() => h.authCb!({ uid: 'uid-alice' }));
    expect(screen.getByTestId('uid')).toHaveTextContent('uid-alice');
  });

  it('swallows a RevenueCat failure instead of leaking an unhandled rejection', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    h.syncPurchaser.mockRejectedValue(new Error('rc down'));
    renderAuth();
    await act(async () => {
      h.authCb!({ uid: 'uid-alice' });
    });
    expect(screen.getByTestId('uid')).toHaveTextContent('uid-alice');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('purchases'), expect.any(Error));
    warn.mockRestore();
  });
});
