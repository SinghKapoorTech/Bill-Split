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
  id?: string;
  name: string;
  email?: string;
  username?: string;
  venmoId?: string;
  balance?: number; // Added for hydrated friend profiles
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
  username?: string;
  
  // List of friend Firebase UIDs. Balances are stored in the separate `friend_balances` collection.
  friends: string[];
  squadIds: string[];
  
  createdAt: Timestamp;
  lastLoginAt: Timestamp;
}

export interface VenmoCharge {
  recipientId: string;
  recipientName: string;
  amount: number;
  note: string;
  type?: 'charge' | 'pay';
}
