import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { getFriendBalanceId, getEventBalanceId } from '@shared/ledgerCalculations';
import type { SettlementRequest } from '@/types/settlementRequest.types';

const COLLECTION = 'settlement_requests';

/**
 * Computes deterministic doc ID for a settlement request.
 * Global: sorted uid pair. Event-scoped: eventId + sorted uid pair.
 */
function getRequestDocId(uid1: string, uid2: string, eventId?: string): string {
  return eventId
    ? getEventBalanceId(eventId, uid1, uid2)
    : getFriendBalanceId(uid1, uid2);
}

/**
 * Gets the current pending request between two users (if any).
 */
async function getPendingRequest(
  uid1: string,
  uid2: string,
  eventId?: string
): Promise<SettlementRequest | null> {
  const docId = getRequestDocId(uid1, uid2, eventId);
  const snap = await getDoc(doc(db, COLLECTION, docId));
  if (!snap.exists()) return null;
  const data = snap.data() as SettlementRequest;
  return data.status === 'pending' ? { ...data, id: snap.id } : null;
}

/**
 * Creates a settlement request from debtor to creditor.
 * If a non-pending request exists for this pair, deletes it first then creates new.
 */
async function createRequest(
  fromUserId: string,
  toUserId: string,
  amount: number,
  eventId?: string
): Promise<SettlementRequest> {
  const docId = getRequestDocId(fromUserId, toUserId, eventId);
  const docRef = doc(db, COLLECTION, docId);

  const existing = await getDoc(docRef);
  if (existing.exists()) {
    const data = existing.data();
    if (data.status === 'pending') {
      throw new Error('A settlement request is already pending.');
    }
    // Declined or approved — delete first, then create
    await deleteDoc(docRef);
  }

  const newData: Record<string, unknown> = {
    fromUserId,
    toUserId,
    amount,
    status: 'pending',
    createdAt: serverTimestamp(),
    ...(eventId && { eventId }),
  };
  await setDoc(docRef, newData);

  return {
    id: docId,
    fromUserId,
    toUserId,
    amount,
    status: 'pending',
    createdAt: Timestamp.now(),
    ...(eventId && { eventId }),
  } as SettlementRequest;
}

/**
 * Approves a pending request (called by creditor).
 */
async function approveRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, requestId), {
    status: 'approved',
    resolvedAt: serverTimestamp(),
  });
}

/**
 * Declines a pending request (called by creditor).
 */
async function declineRequest(requestId: string): Promise<void> {
  await updateDoc(doc(db, COLLECTION, requestId), {
    status: 'declined',
    resolvedAt: serverTimestamp(),
  });
}

/**
 * Auto-approves a pending request for a pair (cleanup after instant settlement).
 * Silently no-ops if no pending request exists.
 */
async function autoApproveIfPending(
  uid1: string,
  uid2: string,
  eventId?: string
): Promise<void> {
  const docId = getRequestDocId(uid1, uid2, eventId);
  const docRef = doc(db, COLLECTION, docId);
  const snap = await getDoc(docRef);
  if (snap.exists() && snap.data().status === 'pending') {
    await updateDoc(docRef, {
      status: 'approved',
      resolvedAt: serverTimestamp(),
    });
  }
}

export const settlementRequestService = {
  getRequestDocId,
  getPendingRequest,
  createRequest,
  approveRequest,
  declineRequest,
  autoApproveIfPending,
};
