import { Timestamp } from 'firebase/firestore';

export interface Trip {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  memberIds: string[];
  pendingInvites?: string[]; // Emails of users who have been invited but haven't joined
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TripInvitation {
  id: string;
  tripId: string;
  email: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
  respondedAt?: Timestamp;
}

// Legacy type - to be migrated to Bill
export interface TripTransaction {
  id: string;
  tripId: string;
  billData: {
    items: Array<{ id: string; name: string; price: number }>;
    subtotal: number;
    tax: number;
    tip: number;
    total: number;
  };
  itemAssignments: Record<string, string[]>;
  personTotals: Record<string, number>;
  createdAt: Date;
  createdBy: string;
}
