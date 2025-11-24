import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { UserProfile, Friend, Squad } from '@/types/person.types';

const USERS_COLLECTION = 'users';

export const userService = {
  /**
   * Gets a user profile by ID
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return null;
    }

    return userSnap.data() as UserProfile;
  },

  /**
   * Creates or updates a user profile on login
   */
  async syncUserProfile(user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null }): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, user.uid);
    const userSnap = await getDoc(userRef);

    const now = Timestamp.now();

    if (!userSnap.exists()) {
      // Create new profile
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || undefined,
        friends: [],
        squads: [],
        createdAt: now,
        lastLoginAt: now
      };
      await setDoc(userRef, newProfile);
    } else {
      // Update last login
      await updateDoc(userRef, {
        lastLoginAt: now,
        // Update basic info if changed
        email: user.email || '',
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || undefined
      });
    }
  },

  /**
   * Adds a friend to the user's friend list
   */
  async addFriend(userId: string, friend: Friend): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      friends: arrayUnion(friend)
    });
  },

  /**
   * Removes a friend from the user's friend list
   */
  async removeFriend(userId: string, friend: Friend): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, userId);
    // Note: arrayRemove only works if the object is exactly the same
    // If we need to remove by name only, we'd need to read, filter, and update
    // For now assuming exact object match or we'll implement read-modify-write if needed
    
    // Actually, to be safe, let's do read-modify-write to ensure we remove by name/id
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data() as UserProfile;
    const updatedFriends = userData.friends.filter(f => f.name !== friend.name || f.venmoId !== friend.venmoId);
    
    await updateDoc(userRef, {
      friends: updatedFriends
    });
  },

  /**
   * Creates a new squad
   */
  async createSquad(userId: string, squad: Squad): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(userRef, {
      squads: arrayUnion(squad)
    });
  },

  /**
   * Updates an existing squad (by name)
   */
  async updateSquad(userId: string, oldName: string, updatedSquad: Squad): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data() as UserProfile;
    const squads = userData.squads || [];
    
    const index = squads.findIndex(s => s.name === oldName);
    if (index === -1) {
      throw new Error('Squad not found');
    }
    
    squads[index] = updatedSquad;
    
    await updateDoc(userRef, {
      squads: squads
    });
  },

  /**
   * Deletes a squad
   */
  async deleteSquad(userId: string, squadName: string): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, userId);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data() as UserProfile;
    const updatedSquads = userData.squads.filter(s => s.name !== squadName);
    
    await updateDoc(userRef, {
      squads: updatedSquads
    });
  }
};
