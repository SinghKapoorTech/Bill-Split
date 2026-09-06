import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { User, signInWithPopup, signInWithCredential, GoogleAuthProvider, OAuthProvider, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, db } from '@/config/firebase';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { userService } from '@/services/userService';
import {
  SignInProvider,
  describeSignInError,
  isSilentAuthCancellation,
} from '@/utils/authProviders';

interface AuthContextType {
  user: User | null | undefined;
  loading: boolean;
  signIn: (provider: SignInProvider) => Promise<void>;
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

  // Function to check and accept pending group invitations
  const checkAndAcceptInvitations = async (currentUser: User) => {
    if (!currentUser.email) return;

    try {
      // Query for events where this user's email is in pendingInvites
      const eventsRef = collection(db, 'events');
      const q = query(eventsRef, where('pendingInvites', 'array-contains', currentUser.email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const eventsToJoin = querySnapshot.docs.length;

        // Process each event invitation
        for (const eventDoc of querySnapshot.docs) {
          const eventRef = doc(db, 'events', eventDoc.id);

          // Add user to memberIds and remove from pendingInvites
          await updateDoc(eventRef, {
            memberIds: arrayUnion(currentUser.uid),
            pendingInvites: arrayRemove(currentUser.email),
          });

          // Update invitation status
          const invitationsRef = collection(db, 'eventInvitations');
          const inviteQuery = query(
            invitationsRef,
            where('email', '==', currentUser.email),
            where('eventId', '==', eventDoc.id),
            where('status', '==', 'pending')
          );
          const inviteSnapshot = await getDocs(inviteQuery);

          for (const inviteDoc of inviteSnapshot.docs) {
            await updateDoc(doc(db, 'eventInvitations', inviteDoc.id), {
              status: 'accepted',
            });
          }
        }

        // Show success message
        toast({
          title: 'Welcome to your events!',
          description: `You've been added to ${eventsToJoin} ${eventsToJoin === 1 ? 'event' : 'events'}.`,
        });
      }
    } catch (error) {
      console.error('Error accepting event invitations:', error);
      // Don't show error to user - this is a background operation
    }
  };

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
          checkAndAcceptInvitations(currentUser);
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
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
