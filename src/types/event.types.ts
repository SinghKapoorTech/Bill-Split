import { Timestamp } from 'firebase/firestore';

// Using TripEvent to avoid conflict with the browser's built-in Event type
export interface TripEvent {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  memberIds: string[];
  pendingInvites?: string[]; // Emails of users who have been invited but haven't joined
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface EventInvitation {
  id: string;
  eventId: string; // Firestore field name
  email: string;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: Timestamp;
  respondedAt?: Timestamp;
}

// Legacy type - to be migrated to Bill
export interface EventTransaction {
  id: string;
  eventId: string; // Firestore field name
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
