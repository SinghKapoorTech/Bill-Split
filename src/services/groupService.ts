import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Group, GroupInvitation } from '@/types/group.types';

const GROUPS_COLLECTION = 'groups';
const INVITATIONS_COLLECTION = 'groupInvitations';

export const groupService = {
  /**
   * Creates a new group
   */
  async createGroup(ownerId: string, name: string, description?: string): Promise<string> {
    const newGroupRef = doc(collection(db, GROUPS_COLLECTION));
    const now = Timestamp.now();

    const newGroup: Group = {
      id: newGroupRef.id,
      name,
      description,
      ownerId,
      memberIds: [ownerId],
      pendingInvites: [],
      createdAt: now,
      updatedAt: now
    };

    await setDoc(newGroupRef, newGroup);
    return newGroupRef.id;
  },

  /**
   * Gets a group by ID
   */
  async getGroup(groupId: string): Promise<Group | null> {
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const groupSnap = await getDoc(groupRef);

    if (!groupSnap.exists()) {
      return null;
    }

    return groupSnap.data() as Group;
  },

  /**
   * Updates a group
   */
  async updateGroup(groupId: string, updates: Partial<Group>): Promise<void> {
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    await updateDoc(groupRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
  },

  /**
   * Invites a user to a group by email
   */
  async inviteMember(groupId: string, email: string, invitedBy: string): Promise<string> {
    const now = Timestamp.now();
    const inviteRef = doc(collection(db, INVITATIONS_COLLECTION));
    
    const invitation: GroupInvitation = {
      id: inviteRef.id,
      groupId,
      email,
      invitedBy,
      status: 'pending',
      createdAt: now
    };
    
    await setDoc(inviteRef, invitation);
    
    // Update group pending invites
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    await updateDoc(groupRef, {
      pendingInvites: arrayUnion(email),
      updatedAt: serverTimestamp()
    });
    
    return inviteRef.id;
  },
  
  /**
   * Responds to an invitation
   */
  async respondToInvite(inviteId: string, userId: string, accept: boolean): Promise<void> {
    const inviteRef = doc(db, INVITATIONS_COLLECTION, inviteId);
    const inviteSnap = await getDoc(inviteRef);
    
    if (!inviteSnap.exists()) {
      throw new Error('Invitation not found');
    }
    
    const invite = inviteSnap.data() as GroupInvitation;
    const now = Timestamp.now();
    
    await updateDoc(inviteRef, {
      status: accept ? 'accepted' : 'declined',
      respondedAt: now
    });
    
    if (accept) {
      // Add user to group
      const groupRef = doc(db, GROUPS_COLLECTION, invite.groupId);
      await updateDoc(groupRef, {
        memberIds: arrayUnion(userId),
        pendingInvites: arrayRemove(invite.email),
        updatedAt: serverTimestamp()
      });
    }
  },
  
  /**
   * Gets pending invitations for an email
   */
  async getPendingInvitations(email: string): Promise<GroupInvitation[]> {
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      where('email', '==', email),
      where('status', '==', 'pending')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data() as GroupInvitation);
  }
};
