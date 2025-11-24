import { Timestamp } from 'firebase/firestore';

export interface Group {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  memberIds: string[];
  pendingInvites?: string[]; // Emails of users who have been invited but haven't joined
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  email: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
  respondedAt?: Timestamp;
}

// Legacy type - to be migrated to Bill
export interface GroupTransaction {
  id: string;
  groupId: string;
  billData: {
    items: Array<{ id: string; name: string; price: number }>;
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
  };
  itemAssignments: Record<string, string[]>;
  personTotals: Record<string, number>;
  createdAt: Date; // Keeping as Date for now if legacy code expects it, or update to Timestamp if safe. 
                   // Given it's legacy, I'll leave it as is or update to Timestamp if I suspect it's from Firestore.
                   // Actually, usually Firestore returns Timestamp. I'll stick to Date for this one to minimize breakage if it's not being touched.
                   // But wait, if I import Timestamp, I might as well use it if it's a firestore doc.
                   // Let's keep it as Date for now to be safe, as I'm not migrating this part yet.
  createdBy: string;
}
