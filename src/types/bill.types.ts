import { Timestamp } from 'firebase/firestore';
import { Person } from './person.types';

export type BillType = 'private' | 'event';
export type BillStatus = 'active' | 'archived';

export interface BillItem {
  id: string;
  name: string;
  price: number;
}

export interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  total: number;
  restaurantName?: string;
}

export interface BillMember {
  userId: string;
  name: string;
  email?: string;
  joinedAt: Timestamp;
  isAnonymous: boolean;
}

export interface Bill {
  id: string;
  billType: BillType;
  status: BillStatus;
  ownerId: string;
  eventId?: string; // If billType === 'event'
  squadId?: string; // Optional squad ID

  billData: BillData;

  // Who's paying for what: {itemId: [personIds]}
  itemAssignments: Record<string, string[]>;

  // Participants
  people: Person[];

  // User inputs
  splitEvenly: boolean;

  // Step/Tab Persistence
  currentStep?: number;

  // Bill Title
  title?: string; // Custom bill title (defaults to date display)

  // Receipt Image
  receiptImageUrl?: string;
  receiptFileName?: string;

  // Share Link
  shareCode?: string;
  shareCodeCreatedAt?: Timestamp;
  shareCodeExpiresAt?: Timestamp;
  shareCodeCreatedBy?: string;

  // History
  members: BillMember[];

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivity: Timestamp;
  savedAt?: Timestamp; // For draft sessions
}
