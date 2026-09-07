import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import {
  User,
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { auth, googleProvider } from '@/config/firebase';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { userService } from '@/services/userService';
import { acceptPendingInvitations } from '@/services/invitationService';
import {
  SignInProvider,
  describeSignInError,
  describePasswordAuthError,
  isSilentAuthCancellation,
} from '@/utils/authProviders';

interface AuthContextType {
  user: User | null | undefined;
  loading: boolean;
  signIn: (provider: SignInProvider) => Promise<void>;
  signUpWithPassword: (name: string, email: string, password: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // `undefined` = auth has not resolved yet (Firebase still restoring the
  // persisted session); `null` = resolved, no user; `User` = signed in.
  // Route guards rely on this distinction so they never treat the
  // still-resolving window as "logged out" (see getAuthGate / ProtectedRoute).
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Custom auth state implementation with timeout (replaces useAuthState hook)
  useEffect(() => {
    // Dev-only: allow test user injection for E2E tests
    if (import.meta.env.DEV && (window as { __TEST_USER__?: unknown }).__TEST_USER__) {
      setUser((window as { __TEST_USER__?: unknown }).__TEST_USER__ as User);
      setLoading(false);
      return;
    }

    // Last-resort safety net: if Firebase never resolves the auth state (e.g. a
    // stalled network on a cold start), give up after 10s and treat the user as
    // logged out so the app doesn't spin forever. This is intentionally long and
    // uses a functional update so it ONLY takes effect while auth is still
    // unresolved (user === undefined). It must never fire fast enough to race a
    // normal token refresh — that race was the old "bounce to home" bug.
    const timeout = setTimeout(() => {
      setUser((prev) => (prev === undefined ? null : prev));
      setLoading(false);
    }, 10000);

    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        clearTimeout(timeout);
        // Resolve auth immediately so route guards can act; never leave `user`
        // as `undefined` once Firebase has answered.
        setUser(currentUser ?? null);
        setLoading(false);

        // Sync profile / accept pending invitations in the background — these
        // network calls must not gate rendering of the authenticated app.
        if (currentUser) {
          userService
            .syncUserProfile(currentUser)
            .catch((error) => console.error('Error syncing user profile:', error));
          // Failures stay silent: this is a background operation, and a toast
          // about invitations the user never asked about would be noise.
          acceptPendingInvitations(currentUser)
            .then((joined) => {
              if (joined > 0) {
                toast({
                  title: 'Welcome to your events!',
                  description: `You've been added to ${joined} ${joined === 1 ? 'event' : 'events'}.`,
                });
              }
            })
            .catch((error) => console.error('Error accepting event invitations:', error));
        }
      },
      (error) => {
        console.error('[AuthContext] Auth state error:', error);
        clearTimeout(timeout);
        setUser(null);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  /**
   * Signs in with Google or Apple.
   *
   * Apple is required by App Store Review Guideline 4.8 and ships on iOS only —
   * see docs/superpowers/specs/2026-09-05-sign-in-with-apple-design.md.
   *
   * Both providers share one error path on purpose. The cancellation branch (a
   * dismissed sheet must not raise an error toast) is exactly the same for
   * both, and duplicating it is how it drifts out of sync.
   */
  const signIn = async (provider: SignInProvider) => {
    const label = provider === 'apple' ? 'Apple' : 'Google';

    try {
      if (provider === 'apple') {
        // iOS native only. The Apple sheet is presented by the native SDK, and
        // the resulting credential is replayed into the JS SDK so both hold the
        // session — matching what the Google native path below already does.
        const result = await FirebaseAuthentication.signInWithApple();
        const idToken = result.credential?.idToken;
        const rawNonce = result.credential?.nonce;

        if (!idToken) {
          throw new Error('No ID token received from Sign in with Apple');
        }

        // Firebase rejects the Apple ID token unless it is replayed with the
        // same raw nonce that was used to request it. The plugin does supply it
        // on iOS, so a missing nonce means something is misconfigured rather
        // than something worth retrying — fail loudly instead of handing
        // Firebase a credential that can only ever come back invalid.
        if (!rawNonce) {
          throw new Error(
            'Sign in with Apple returned no nonce. Check that the Apple provider is enabled in the Firebase console.'
          );
        }

        const credential = new OAuthProvider('apple.com').credential({ idToken, rawNonce });
        await signInWithCredential(auth, credential);
      } else if (Capacitor.isNativePlatform()) {
        // Native sign-in for mobile apps
        const result = await FirebaseAuthentication.signInWithGoogle();

        if (!result.credential?.idToken) {
          throw new Error('No ID token received from Google Sign-In');
        }

        // Sync native sign-in with Firebase JS SDK
        const credential = GoogleAuthProvider.credential(result.credential.idToken);
        await signInWithCredential(auth, credential);
      } else {
        // Web sign-in using popup
        await signInWithPopup(auth, googleProvider);
      }

      toast({
        title: 'Welcome!',
        description: `Successfully signed in with ${label}.`,
      });
    } catch (error: unknown) {
      console.error('[Auth] Sign-in error:', error);

      // Dismissing the sheet is a normal gesture, not a failure.
      if (isSilentAuthCancellation(error)) {
        return;
      }

      toast({
        title: 'Sign in failed',
        description: describeSignInError(error, provider),
        variant: 'destructive',
      });
    }
  };

  /**
   * Creates an account from an email and password.
   *
   * The ordering here is not incidental. `createUserWithEmailAndPassword`
   * produces a user whose `displayName` is null and fires `onAuthStateChanged`
   * immediately, so the profile sync in that listener would create the Firestore
   * document with the placeholder name 'User' and an email-derived username —
   * exactly the clobbering the Apple path was written to avoid. Setting the name
   * and re-syncing repairs that, and `buildProfileUpdates` never downgrades a
   * stored value, so the second sync cannot undo the first.
   */
  const signUpWithPassword = async (name: string, email: string, password: string) => {
    try {
      const { user: created } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(created, { displayName: name });

      // Verification is not cosmetic here: it gates event-invitation
      // auto-accept and email-based discovery, both in the client and in
      // firestore.rules. Send it immediately rather than on demand.
      await sendEmailVerification(created).catch((error) =>
        console.error('[Auth] Could not send verification email:', error)
      );

      // Built field by field rather than spread: a Firebase `User` exposes
      // much of its state through prototype getters, so `{ ...created }` can
      // silently produce an object missing uid/email and write a broken profile.
      await userService
        .syncUserProfile({
          uid: created.uid,
          email: created.email,
          emailVerified: created.emailVerified,
          providerData: created.providerData,
          displayName: name,
          photoURL: created.photoURL,
        })
        .catch((error) => console.error('[Auth] Profile sync after signup failed:', error));

      toast({
        title: 'Account created',
        description: `Check ${email} to verify your address.`,
      });
    } catch (error: unknown) {
      console.error('[Auth] Sign-up error:', error);
      toast({
        title: 'Could not create your account',
        description: describePasswordAuthError(error, 'signup'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: 'Welcome back!', description: 'Successfully signed in.' });
    } catch (error: unknown) {
      console.error('[Auth] Password sign-in error:', error);
      toast({
        title: 'Sign in failed',
        description: describePasswordAuthError(error, 'signin'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  /**
   * Sends a reset link, and reports success even when it did not send.
   *
   * Firebase throws `auth/user-not-found` for an unknown address. Surfacing
   * that would make this form an account-existence oracle, which is the same
   * leak the deliberately vague sign-in copy avoids. Only errors that say
   * nothing about the account — a malformed address, rate limiting — are shown.
   */
  const sendPasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: unknown) {
      console.error('[Auth] Password reset error:', error);
      const { code } = (error ?? {}) as { code?: string };
      if (code === 'auth/invalid-email' || code === 'auth/too-many-requests') {
        toast({
          title: 'Could not send the email',
          description: describePasswordAuthError(error, 'reset'),
          variant: 'destructive',
        });
        return;
      }
    }

    toast({
      title: 'Check your inbox',
      description: `If ${email} has a Divit account, a reset link is on its way.`,
    });
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      toast({
        title: 'Signed out',
        description: 'You have been signed out successfully.',
      });
    } catch (error: unknown) {
      console.error('Error signing out:', error);
      toast({
        title: 'Sign out failed',
        description: (error as Error).message || 'Could not sign out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const value = {
    user,
    loading,
    signIn,
    signUpWithPassword,
    signInWithPassword,
    sendPasswordReset,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
