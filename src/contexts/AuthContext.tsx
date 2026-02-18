import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { User, signInWithPopup, signInWithCredential, GoogleAuthProvider, signOut as firebaseSignOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider, db } from '@/config/firebase';
import { collection, query, where, getDocs, updateDoc, doc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { userService } from '@/services/userService';

interface AuthContextType {
  user: User | null | undefined;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Function to check and accept pending group invitations
  const checkAndAcceptInvitations = async (currentUser: User) => {
    if (!currentUser.email) return;

    try {
      // Query for groups where this user's email is in pendingInvites
      const groupsRef = collection(db, 'groups');
      const q = query(groupsRef, where('pendingInvites', 'array-contains', currentUser.email));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const groupsToJoin = querySnapshot.docs.length;

        // Process each group invitation
        for (const groupDoc of querySnapshot.docs) {
          const groupRef = doc(db, 'groups', groupDoc.id);

          // Add user to memberIds and remove from pendingInvites
          await updateDoc(groupRef, {
            memberIds: arrayUnion(currentUser.uid),
            pendingInvites: arrayRemove(currentUser.email),
          });

          // Update invitation status
          const invitationsRef = collection(db, 'groupInvitations');
          const inviteQuery = query(
            invitationsRef,
            where('email', '==', currentUser.email),
            where('groupId', '==', groupDoc.id),
            where('status', '==', 'pending')
          );
          const inviteSnapshot = await getDocs(inviteQuery);

          for (const inviteDoc of inviteSnapshot.docs) {
            await updateDoc(doc(db, 'groupInvitations', inviteDoc.id), {
              status: 'accepted',
            });
          }
        }

        // Show success message
        toast({
          title: 'Welcome to your groups!',
          description: `You've been added to ${groupsToJoin} ${groupsToJoin === 1 ? 'group' : 'groups'}.`,
        });
      }
    } catch (error) {
      console.error('Error accepting group invitations:', error);
      // Don't show error to user - this is a background operation
    }
  };

  // Custom auth state implementation with timeout (replaces useAuthState hook)
  useEffect(() => {
    // Force loading to false after 3 seconds if Firebase doesn't respond
    const timeout = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 3000);

    // Listen to Firebase auth state changes
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        clearTimeout(timeout);
        setUser(currentUser);

        // Check for pending group invitations when user logs in
        if (currentUser) {
          try {
            await userService.syncUserProfile(currentUser);
          } catch (error) {
            console.error('Error syncing user profile:', error);
          }
          await checkAndAcceptInvitations(currentUser);
        }

        setLoading(false);
      },
      (error) => {
        console.error('[AuthContext] Auth state error:', error);
        clearTimeout(timeout);
        setLoading(false);
      }
    );

    return () => {
      clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    try {
      const isNative = Capacitor.isNativePlatform();

      if (isNative) {
        // Native sign-in for mobile apps
        const result = await FirebaseAuthentication.signInWithGoogle();

        if (!result.credential?.idToken) {
          throw new Error('No ID token received from Google Sign-In');
        }

        // Sync native sign-in with Firebase JS SDK
        const credential = GoogleAuthProvider.credential(result.credential.idToken);
        await signInWithCredential(auth, credential);

        toast({
          title: 'Welcome!',
          description: 'Successfully signed in with Google.',
        });
      } else {
        // Web sign-in using popup
        await signInWithPopup(auth, googleProvider);
        toast({
          title: 'Welcome!',
          description: 'Successfully signed in with Google.',
        });
      }
    } catch (error: any) {
      console.error('[Auth] Sign-in error:', error);

      // Handle user cancellation gracefully
      if (
        error.code === 'auth/cancelled-popup-request' ||
        error.code === 'auth/popup-closed-by-user' ||
        error.message?.includes('cancel')
      ) {
        return; // Don't show error toast for cancellation
      }

      toast({
        title: 'Sign in failed',
        description: error.message || 'Could not sign in with Google. Please try again.',
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
    } catch (error: any) {
      console.error('Error signing out:', error);
      toast({
        title: 'Sign out failed',
        description: error.message || 'Could not sign out. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const value = {
    user,
    loading,
    signInWithGoogle,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
