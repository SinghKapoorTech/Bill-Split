import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  Timestamp,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { UserProfile, Friend, Squad } from '@/types/person.types';

const USERS_COLLECTION = 'users';

/**
 * Generates a readable unique username (e.g., john_doe or john_doe_1)
 */
async function generateUniqueUsername(name: string): Promise<string> {
  const baseName = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  let username = baseName || 'user';
  let isUnique = false;
  let counter = 0;

  const usersRef = collection(db, USERS_COLLECTION);

  while (!isUnique) {
    const q = query(usersRef, where('username', '==', username), limit(1));
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      isUnique = true;
    } else {
      counter++;
      username = `${baseName}_${counter}`;
    }
  }

  return username;
}

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
  async syncUserProfile(user: { uid: string; email: string | null; displayName: string | null; photoURL: string | null; phoneNumber?: string | null }): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, user.uid);
    const userSnap = await getDoc(userRef);

    const now = Timestamp.now();

    if (!userSnap.exists()) {
      // Create new profile
      const username = await generateUniqueUsername(user.displayName || 'user');
      const newProfile: UserProfile = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || undefined,
        phoneNumber: user.phoneNumber || undefined,
        username,
        friends: [],
        squadIds: [],
        createdAt: now,
        lastLoginAt: now
      };
      await setDoc(userRef, newProfile);
    } else {
      // Update last login and basic info
      const updates: any = {
        lastLoginAt: now,
        // Update basic info if changed
        email: user.email || '',
        displayName: user.displayName || 'User',
        photoURL: user.photoURL || undefined
      };

      if (user.phoneNumber) {
        updates.phoneNumber = user.phoneNumber;
      }

      await updateDoc(userRef, updates);
    }
  },



  /**
   * Gets a user by email or phone number
   */
  async getUserByContact(contact: string): Promise<UserProfile | null> {
    const usersRef = collection(db, USERS_COLLECTION);
    
    // Try by email
    const emailQuery = query(usersRef, where('email', '==', contact), limit(1));
    const emailSnap = await getDocs(emailQuery);
    
    if (!emailSnap.empty) {
      return emailSnap.docs[0].data() as UserProfile;
    }

    // Try by phone number
    const phoneQuery = query(usersRef, where('phoneNumber', '==', contact), limit(1));
    const phoneSnap = await getDocs(phoneQuery);

    if (!phoneSnap.empty) {
      return phoneSnap.docs[0].data() as UserProfile;
    }

    return null;
  },

  /**
   * Searches for users by their username prefix (starts with)
   * Firestore doesn't do substring search natively, so this is a standard prefix query.
   */
  async searchUsersByUsername(queryStr: string): Promise<UserProfile[]> {
    if (!queryStr || queryStr.length < 2) return [];
    
    // Normalize query string (assuming usernames are lowercase)
    const normalizedQuery = queryStr.trim().toLowerCase();
    
    const usersRef = collection(db, USERS_COLLECTION);
    
    // Firestore prefix query pattern: field >= query and field <= query + '\uf8ff'
    const q = query(
      usersRef, 
      where('username', '>=', normalizedQuery), 
      where('username', '<=', normalizedQuery + '\uf8ff'),
      limit(5)
    );
    
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => doc.data() as UserProfile);
    } catch (error) {
      console.error("Error searching users by username:", error);
      return [];
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
   * Creates a shadow user for an invited member
   */
  async createShadowUser(contact: string, name?: string): Promise<string> {
    const usersRef = collection(db, USERS_COLLECTION);
    
    // Check if user already exists with this contact to avoid duplicates
    const existingUser = await this.getUserByContact(contact);
    if (existingUser) {
      return existingUser.uid;
    }

    const newUserId = doc(usersRef).id; // Auto-generate ID
    const now = Timestamp.now();
    
    const isEmail = contact.includes('@');
    const username = await generateUniqueUsername(name || (isEmail ? contact.split('@')[0] : 'user'));
    
    const newProfile: any = {
      uid: newUserId,
      displayName: name || contact,
      username,
      friends: [],
      squadIds: [],
      createdAt: now,
      lastLoginAt: now,
      isShadow: true
    };

    if (isEmail) {
      newProfile.email = contact;
    } else {
      newProfile.phoneNumber = contact;
    }

    await setDoc(doc(db, USERS_COLLECTION, newUserId), newProfile);
    return newUserId;
  },

  /**
   * Resolves a user identifier (ID, email, phone) to a User ID
   * Creates a shadow user if not found
   */
  async resolveUser(identifier: string, name?: string): Promise<string> {
    // 1. Check if it's already a valid User ID
    const userProfile = await this.getUserProfile(identifier);
    if (userProfile) {
      return userProfile.uid;
    }

    // 2. Check if it's an email or phone number in DB
    const contactUser = await this.getUserByContact(identifier);
    if (contactUser) {
      return contactUser.uid;
    }

    // 3. Create a shadow user
    return this.createShadowUser(identifier, name);
  }
};
