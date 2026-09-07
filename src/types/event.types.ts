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
  // Archive flag. OPTIONAL because every event created before the archive
  // feature shipped lacks both fields — a missing `archived` means ACTIVE.
  // Never filter on this server-side: `where('archived','==',false)` does not
  // match documents that are missing the field. Use partitionEvents() from
  // `@shared/eventArchive` instead.
  archived?: boolean;
  archivedAt?: Timestamp;
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
