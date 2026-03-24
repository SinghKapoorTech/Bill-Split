import { Timestamp } from 'firebase/firestore';

export type SettlementRequestStatus = 'pending' | 'approved' | 'declined';

export interface SettlementRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
  status: SettlementRequestStatus;
  eventId?: string;
  createdAt: Timestamp;
  resolvedAt?: Timestamp;
}
