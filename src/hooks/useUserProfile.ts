import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { UserProfile } from '@/types';
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

    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;

    try {
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      } else {
        const newProfile: UserProfile = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
        };
        await setDoc(docRef, newProfile);
        setProfile(newProfile);
      }
    } catch (error: any) {
      console.error('Error loading profile:', error);
      toast({
        title: 'Error loading profile',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

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

  const updateFriends = async (friends: Array<{ name: string; venmoId?: string }>) => {
    if (!user || !profile) return;

    try {
      const docRef = doc(db, 'users', user.uid);
      const updatedProfile = { ...profile, friends };

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
