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

  // Users who have paid their share for this specific bill
  settledPersonIds?: string[];

  // Tracks exactly what was added to the global friend ledger
  processedBalances?: Record<string, number>;

  // Tracks exactly what was added to the local event ledger
  eventBalancesApplied?: Record<string, number>;

  // Pipeline version — incremented each time the server-side ledgerProcessor
  // processes this bill. Used for observability and as an additional guard
  // against redundant trigger processing.
  _ledgerVersion?: number;

  // Set by friendAddProcessor to re-trigger the pipeline when a new friend
  // is added retroactively. The pipeline includes this in hasRelevantChange()
  // so changing it causes re-processing without modifying actual bill data.
  _friendScanTrigger?: Timestamp;

  // Participants
  people: Person[];

  /**
   * Flat array of Firebase UIDs for all linked participants (owner + linked people).
   * Derived from people[].id at write time (normalizes "user-{uid}" → raw UID).
   * Enables Firestore array-contains queries and cross-user security rules.
   * Always kept in sync with the `people` array — callers never set this directly.
   */
  participantIds?: string[];

  /**
   * Mirror of participantIds, but a UID is removed (via arrayRemove) when that
   * person fully settles their share. Enables efficient "unsettled bills only"
   * Firestore queries — the Cloud Function uses this to find bills to process.
   * Populated at bill creation; maintained by the processSettlement Cloud Function.
   */
  unsettledParticipantIds?: string[];

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

  // Simple Transactions
  isSimpleTransaction?: boolean;
  paidById?: string;

  // History
  members: BillMember[];

  // Metadata
  createdAt: Timestamp;
  updatedAt: Timestamp;
  lastActivity: Timestamp;
  savedAt?: Timestamp; // For draft sessions
}
