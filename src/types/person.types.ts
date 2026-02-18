import { Timestamp } from 'firebase/firestore';

export interface Person {
  id: string;
  name: string;
  venmoId?: string;
}

export interface PersonTotal {
  personId: string;
  name: string;
  itemsSubtotal: number;
  tax: number;
  tip: number;
  total: number;
}

export interface Friend {
  name: string;
  venmoId?: string;
}

export interface Squad {
  name: string;
  members: Friend[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  venmoId?: string;
  phoneNumber?: string;
  
  // Quick access for adding to bills
  friends: Friend[];
  squadIds: string[];
  
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

export interface VenmoCharge {
  recipientId: string;
  recipientName: string;
  amount: number;
  note: string;
}
