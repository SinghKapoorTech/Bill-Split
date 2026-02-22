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
import { friendBalanceService } from './friendBalanceService';

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

      // Self-healing: Check for and sync old bills if it's been > 24 hours since last login
      const lastLoginTime = userSnap.data().lastLoginAt as Timestamp;
      if (lastLoginTime) {
        const hoursSinceLastLogin = (now.toMillis() - lastLoginTime.toMillis()) / (1000 * 60 * 60);
        if (hoursSinceLastLogin > 24) {
          friendBalanceService.syncOldBillsForUser(user.uid).catch(err => {
            console.error('Failed to run periodic old bill sync:', err);
          });
        }
      }
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
   * Gets a user's friends with full profiles hydrated.
   * Reads balances directly from the `friend_balances` collection (source of truth).
   */
  async getHydratedFriends(userId: string): Promise<Friend[]> {
    const userProfile = await this.getUserProfile(userId);
    if (!userProfile || !userProfile.friends || userProfile.friends.length === 0) return [];

    // Handle legacy data: user.friends might be string[] OR legacy [{userId, balance}] objects.
    const friendIds: string[] = (userProfile.friends as any[])
      .map(f => typeof f === 'string' ? f : (f.userId || f.id))
      .filter(Boolean);

    // Fetch all balance documents for this user in one query
    const balancesRef = collection(db, 'friend_balances');
    const balanceSnap = await getDocs(query(balancesRef, where('participants', 'array-contains', userId)));

    // Build a quick lookup: friendId -> balance (positive = they owe you)
    const balanceMap: Record<string, number> = {};
    balanceSnap.docs.forEach(docSnap => {
      const data = docSnap.data();
      const participants: string[] = data.participants || [];
      const friendId = participants.find(p => p !== userId);
      if (friendId && data.balances?.[userId] !== undefined) {
        balanceMap[friendId] = data.balances[userId];
      }
    });

    const hydratedFriends: Friend[] = [];
    for (const friendId of friendIds) {
      if (!friendId) continue;
      const friendProfile = await this.getUserProfile(friendId);
      if (friendProfile) {
        hydratedFriends.push({
          id: friendProfile.uid,
          name: friendProfile.displayName,
          email: friendProfile.email,
          username: friendProfile.username,
          venmoId: friendProfile.venmoId,
          balance: balanceMap[friendId] ?? 0,
        });
      }
    }

    return hydratedFriends;
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
