import { useState, useEffect } from 'react';
import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfile, Friend } from '@/types';
import { useToast } from './use-toast';

export function useUserProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const docRef = doc(db, 'users', user.uid);

    // Use a real-time listener so any write to the user doc (e.g., updated
    // friend balances after a bill is completed) is immediately reflected.
    const unsubscribe = onSnapshot(docRef, async (docSnap) => {
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      } else {
        // First login — create the profile
        const now = Timestamp.now();
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          friends: [],
          squadIds: [],
          createdAt: now,
          lastLoginAt: now
        };
        await setDoc(docRef, newProfile);
        // The onSnapshot will fire again after the setDoc, no need to setState here
      }
      setLoading(false);
    }, (error: any) => {
      console.error('Error listening to profile:', error);
      toast({
        title: 'Error loading profile',
        description: error.message,
        variant: 'destructive',
      });
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  const updateVenmoId = async (venmoId: string) => {
    if (!user || !profile) return;

    // Remove any @ symbols and whitespace
    const cleanVenmoId = venmoId.replace(/^@+/, '').trim();

    try {
      const docRef = doc(db, 'users', user.uid);
      const updatedProfile = { ...profile, venmoId: cleanVenmoId };

      await setDoc(docRef, updatedProfile, { merge: true });
      setProfile(updatedProfile);

      toast({
        title: 'Venmo ID saved',
        description: 'Your Venmo ID has been updated successfully.',
      });
    } catch (error: any) {
      console.error('Error updating Venmo ID:', error);
      toast({
        title: 'Error updating Venmo ID',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const updateFriends = async (friends: Friend[]) => {
    if (!user || !profile) return;

    try {
      const docRef = doc(db, 'users', user.uid);
      
      // Store only the Firebase UIDs — balances live in friend_balances collection
      const friendIds: string[] = friends.map(f => f.id!).filter(Boolean);

      const updatedProfile = { ...profile, friends: friendIds };

      await setDoc(docRef, updatedProfile, { merge: true });
      setProfile(updatedProfile);

      toast({
        title: 'Friends saved',
        description: 'Your friends list has been updated successfully.',
      });
    } catch (error: any) {
      console.error('Error updating friends:', error);
      toast({
        title: 'Error updating friends',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  return {
    profile,
    loading,
    updateVenmoId,
    updateFriends,
  };
}
