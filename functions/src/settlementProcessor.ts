/**
 * settlementProcessor.ts
 *
 * Cloud Function: processSettlement
 *
 * Atomically settles outstanding bills between two users.
 *   - Queries only unsettled shared bills (via unsettledParticipantIds array-contains index)
 *   - Marks bills settled: updates settledPersonIds, processedBalances
 *   - Updates friend_balances ledger (all bills)
 *   - Removes user from unsettledParticipantIds on each settled bill
 *   - Writes immutable settlement record
 *   All writes happen inside a SINGLE Firestore admin transaction — atomic by design.
 *
 *   event_balances is NOT written here — the ledgerProcessor pipeline rebuilds
 *   the event cache automatically when settledPersonIds changes on bills.
 */

import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError } from 'firebase-functions/v2/https';
import { calculatePersonTotals as calcSharedTotals } from '../../shared/calculations.js';
import type { PersonTotal } from '../../shared/types.js';

const db = getFirestore();

const BILLS_COLLECTION       = 'bills';
const FRIEND_BALANCES_COLLECTION = 'friend_balances';
const SETTLEMENTS_COLLECTION     = 'settlements';

// Max bills per transaction to stay safely under Firestore's 500 operation limit.
// Each bill requires ~4 operations (2 reads + 2 writes), plus friend_balance reads/writes.
const MAX_BILLS_PER_TX = 50;

// ─── Types ──────────────────────────────────────────────────────────────────

interface Person { id: string; name: string; venmoId?: string; }
interface BillData { items: { id: string; name: string; price: number }[]; subtotal: number; tax: number; tip: number; total: number; }

interface Bill {
  id: string;
  ownerId: string;
  eventId?: string;
  people: Person[];
  billData: BillData;
  itemAssignments: Record<string, string[]>;
  splitEvenly: boolean;
  paidById?: string;
  settledPersonIds?: string[];
  processedBalances?: Record<string, number>;
  unsettledParticipantIds?: string[];
  participantIds?: string[];
  createdAt: Timestamp;
}

// ─── Exported request/response types ────────────────────────────────────────

export interface SettlementRequest {
  fromUserId: string;   // the person paying
  toUserId: string;     // the person receiving
  amount: number;       // the settlement amount
  eventId?: string;     // if set, restrict to this event's bills only
  idempotencyKey?: string; // client-generated UUID — prevents duplicate settlements on retry
}

export interface SettlementResult {
  settlementId: string;
  billsSettled: number;
  amountApplied: number;
  remainingAmount: number;
  hasMore: boolean;     // true if more bills remain beyond the batch limit
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Normalizes "user-{uid}" format to a raw Firebase UID. */
function toUid(personId: string): string {
  return personId.startsWith('user-') ? personId.slice(5) : personId;
}

/** Returns the sorted deterministic document ID for a friend-balance pair. */
function friendBalanceId(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

/**
 * Calculates per-person totals for a bill.
 * Delegates to the shared calculatePersonTotals and converts to Map<string, number>.
 */
function calculatePersonTotals(bill: Bill): Map<string, number> {
  const totals = new Map<string, number>();
  const { items, subtotal, tax, tip } = bill.billData;
  const people = bill.people;

  if (!items || items.length === 0 || subtotal <= 0) return totals;

  if (bill.splitEvenly) {
    const share = bill.billData.total / people.length;
    for (const p of people) totals.set(p.id, parseFloat(share.toFixed(2)));
    return totals;
  }

  // Delegate item-based split to the shared implementation
  const personTotals: PersonTotal[] = calcSharedTotals(
    bill.billData,
    people,
    bill.itemAssignments || {},
    tip,
    tax
  );

  for (const pt of personTotals) {
    totals.set(pt.personId, parseFloat(pt.total.toFixed(2)));
  }

  return totals;
}

// ─── Core processor ──────────────────────────────────────────────────────────

export async function processSettlementCore(
  callerId: string,
  req: SettlementRequest
): Promise<SettlementResult> {
  const { fromUserId, toUserId, eventId, idempotencyKey } = req;
  const amount = parseFloat(req.amount.toFixed(2));

  // ── Validate ─────────────────────────────────────────────────────────────
  if (!fromUserId || !toUserId) throw new HttpsError('invalid-argument', 'fromUserId and toUserId are required');
  if (fromUserId === toUserId)  throw new HttpsError('invalid-argument', 'Cannot settle with yourself');
  if (amount <= 0)              throw new HttpsError('invalid-argument', 'amount must be positive');
  if (callerId !== fromUserId && callerId !== toUserId) {
    throw new HttpsError('permission-denied', 'Caller must be one of the settlement participants');
  }

  // ── Idempotency check: reject duplicate settlement if key was already used ──
  if (idempotencyKey) {
    const existingSnap = await db.collection(SETTLEMENTS_COLLECTION)
      .where('idempotencyKey', '==', idempotencyKey)
      .limit(1)
      .get();

    if (!existingSnap.empty) {
      const existing = existingSnap.docs[0].data();
      logger.info('Duplicate settlement detected', { idempotencyKey, existingId: existingSnap.docs[0].id });
      return {
        settlementId: existingSnap.docs[0].id,
        billsSettled: existing.billsSettled ?? 0,
        amountApplied: existing.amount - (existing.remainingAmount ?? 0),
        remainingAmount: existing.remainingAmount ?? 0,
        hasMore: false,
      };
    }
  }

  // ── Fetch only shared bills between these two users ──
  const billsRef = db.collection(BILLS_COLLECTION);
  let allBillsDocs: FirebaseFirestore.DocumentSnapshot[] = [];

  if (eventId) {
    // Event specific: fetch all bills for the event and filter in memory.
    // Bypasses missing indexes and handles legacy bills correctly.
    const eventBillsSnap = await billsRef.where('eventId', '==', eventId).get();
    allBillsDocs = eventBillsSnap.docs;
  } else {
    // Global Settle Up: Try O(1) fetch via contributingBillIds
    const balId = friendBalanceId(fromUserId, toUserId);
    const balSnap = await db.collection(FRIEND_BALANCES_COLLECTION).doc(balId).get();
    const contributingBillIds: string[] = balSnap.exists ? (balSnap.data()?.contributingBillIds || []) : [];

    if (contributingBillIds.length > 0) {
      const chunks = [];
      for (let i = 0; i < contributingBillIds.length; i += 100) {
        chunks.push(contributingBillIds.slice(i, i + 100));
      }
      const chunkPromises = chunks.map(chunk => db.getAll(...chunk.map(id => billsRef.doc(id))));
      const chunkResults = await Promise.all(chunkPromises);
      for (const results of chunkResults) {
        for (const doc of results) {
          if (doc.exists) allBillsDocs.push(doc);
        }
      }
    } else {
      // Fallback: For legacy users lacking contributingBillIds.
      // We query strictly by participantIds (which uses default single-field auto-index)
      // to bypass ownerId entirely so third-party event bills are safely caught.
      const fallbackSnap = await billsRef.where('participantIds', 'array-contains', fromUserId).get();
      // Filter in memory for bills that also involve the other user
      allBillsDocs = fallbackSnap.docs.filter(doc => {
        const pIds = doc.data().participantIds || [];
        return pIds.includes(toUserId);
      });
    }
  }

  type TaggedBill = Bill & { _ownerOfBill: string; _unsettlingUid: string; isForgiveness: boolean };
  const allBills: TaggedBill[] = [];

  for (const doc of allBillsDocs) {
    const bill = doc.data() as Bill;
    const creditorUid = toUid(bill.paidById || bill.ownerId);

    // Derive participant UIDs directly from bill.people — `participantIds` is optional
    // and may not be populated on older bills.
    const peopleUids = new Set((bill.people ?? []).map((p: Person) => toUid(p.id)));

    // Direction 1 (Standard Debt): fromUserId owes toUserId.
    // Settling this consumes the 'remaining' cash pool.
    if (creditorUid === toUserId && peopleUids.has(fromUserId)) {
      allBills.push({ ...bill, id: doc.id, _ownerOfBill: bill.ownerId, _unsettlingUid: fromUserId, isForgiveness: false });
    }
    // Direction 2 (Forgiveness): toUserId owes fromUserId.
    // By settling this, fromUserId "forgives" the debt, which mathematically
    // acts as an infusion of virtual cash into the 'remaining' pool.
    else if (creditorUid === fromUserId && peopleUids.has(toUserId)) {
      allBills.push({ ...bill, id: doc.id, _ownerOfBill: bill.ownerId, _unsettlingUid: toUserId, isForgiveness: true });
    }
  }

  // Sort: Process Forgiveness bills FIRST (to inflate the cash pool before tackling debts)
  // Within the same category, sort oldest-first
  allBills.sort((a, b) => {
    if (a.isForgiveness && !b.isForgiveness) return -1;
    if (!a.isForgiveness && b.isForgiveness) return 1;
    const tA = a.createdAt?.toMillis?.() ?? 0;
    const tB = b.createdAt?.toMillis?.() ?? 0;
    return tA - tB;
  });

  // ── Determine which bills to settle within the requested amount ───────────
  interface BillSettlementPlan {
    bill: TaggedBill;
    internalPersonId: string;   // bill-local person ID (may be "user-{uid}")
    billOwner: string;          // Firebase UID of bill owner
    unsettlingUid: string;      // Firebase UID of person being settled
    personTotals: Map<string, number>;
  }

  let remaining = amount;
  const toSettle: BillSettlementPlan[] = [];

  for (const bill of allBills) {
    // If we've exhausted our cash pool AND we aren't looking at a forgiveness bill
    // that would inject more virtual cash, we stop.
    if (remaining <= 0 && !bill.isForgiveness) break;
    if (toSettle.length >= MAX_BILLS_PER_TX) break;
    if (!bill.billData?.items?.length) continue;

    const personTotals = calculatePersonTotals(bill);
    if (personTotals.size === 0) continue;

    const unsettlingUid = bill._unsettlingUid;
    let internalPersonId: string | null = null;
    for (const p of (bill.people ?? [])) {
      if (toUid(p.id) === unsettlingUid) { internalPersonId = p.id; break; }
    }
    if (!internalPersonId) continue;

    if ((bill.settledPersonIds ?? []).includes(internalPersonId)) continue;

    const personShare = personTotals.get(internalPersonId) ?? 0;
    if (personShare <= 0) continue;

    // Forgiveness bills INFLATE the pool because we are forgiving debt owed TO us.
    if (bill.isForgiveness) {
      toSettle.push({ bill, internalPersonId, billOwner: bill._ownerOfBill, unsettlingUid, personTotals });
      remaining += personShare;
    } 
    // Standard debts CONSUME the pool.
    else if (remaining >= personShare) {
      toSettle.push({ bill, internalPersonId, billOwner: bill._ownerOfBill, unsettlingUid, personTotals });
      remaining -= personShare;
    } else {
      // Not enough strictly to cover this single bill — stop.
      break;
    }
  }

  const hasMore = toSettle.length >= MAX_BILLS_PER_TX && remaining > 0.01;

  // ── Single admin transaction: all writes are atomic ───────────────────────
  const settlementRef = db.collection(SETTLEMENTS_COLLECTION).doc();

  await db.runTransaction(async (tx) => {
    // ── Reads phase (Firestore requires all reads before writes in a tx) ───
    // Read all bill docs inside the transaction to get the freshest state
    const billRefs   = toSettle.map(p => db.collection(BILLS_COLLECTION).doc(p.bill.id));
    const billSnaps  = await Promise.all(billRefs.map(r => tx.get(r)));

    // Read all friend_balance docs that will be updated (both private and event bills)
    const affectedFriendPairs = new Set<string>();
    for (const plan of toSettle) {
      const creditorUid = toUid(plan.bill.paidById || plan.billOwner);
      if (plan.unsettlingUid === plan.billOwner) {
         affectedFriendPairs.add(friendBalanceId(plan.billOwner, creditorUid));
      } else {
         affectedFriendPairs.add(friendBalanceId(plan.billOwner, plan.unsettlingUid));
      }
    }
    // Also read the direct settlement ledger pair (for any remaining amount)
    affectedFriendPairs.add(friendBalanceId(fromUserId, toUserId));

    const friendBalRefs  = [...affectedFriendPairs].map(id => db.collection(FRIEND_BALANCES_COLLECTION).doc(id));
    const friendBalSnaps = await Promise.all(friendBalRefs.map(r => tx.get(r)));
    const friendBalMap   = new Map(friendBalSnaps.map(s => [s.id, s]));

    // ── Writes phase ──────────────────────────────────────────────────────
    const now = Timestamp.now();

    for (let i = 0; i < toSettle.length; i++) {
      const plan    = toSettle[i];
      const billSnap = billSnaps[i];
      if (!billSnap.exists) continue; // race condition guard

      const billData = billSnap.data() as Bill;
      const { internalPersonId, billOwner, unsettlingUid, personTotals } = plan;

      // 1. Mark person as settled on the bill
      //    Remove from unsettledParticipantIds (so future queries skip this bill)
      tx.update(billRefs[i], {
        settledPersonIds: FieldValue.arrayUnion(internalPersonId),
        unsettledParticipantIds: FieldValue.arrayRemove(unsettlingUid),
      });

      // 2. Re-compute friend ledger footprint for this bill (all bill types).
      //    Matches client-side behavior: applyBillToLedgers always updates friend_balances.
      {
        const prevProcessed   = billData.processedBalances ?? {};
        const newProcessed: Record<string, number> = {};

        // Compute new footprint: how much each linked participant owes the bill owner
        // with the newly settled person zeroed out
        const creditorId      = billData.paidById ?? billOwner;
        const isOwnerCreditor = creditorId === billOwner;
        const creditorUid     = toUid(creditorId);

        const ownerPersonEntry = (billData.people ?? []).find(p => toUid(p.id) === billOwner);
        const ownerPersonId    = ownerPersonEntry?.id ?? billOwner;
        const ownerTotalRaw    = personTotals.get(ownerPersonId) ?? 0;
        const newSettledIds    = [...(billData.settledPersonIds ?? []), internalPersonId];
        const ownerIsSettled   = newSettledIds.includes(ownerPersonId);
        const ownerShare       = ownerIsSettled ? 0 : ownerTotalRaw;

        for (const person of (billData.people ?? [])) {
          if (toUid(person.id) === billOwner) continue;
          const uid       = toUid(person.id);
          const isSettled = newSettledIds.includes(person.id);

          let newAmt = 0;
          if (isOwnerCreditor) {
            newAmt = isSettled ? 0 : (personTotals.get(person.id) ?? 0);
          } else {
            newAmt = uid === creditorUid ? -ownerShare : 0;
          }
          if (newAmt !== 0) newProcessed[uid] = newAmt;
        }

        // Apply delta to friend_balances
        const allUids = new Set([...Object.keys(prevProcessed), ...Object.keys(newProcessed)]);
        for (const friendUid of allUids) {
          const prev  = prevProcessed[friendUid] ?? 0;
          const next  = newProcessed[friendUid] ?? 0;
          const delta = next - prev;
          if (Math.abs(delta) < 0.001) continue;

          const balId  = friendBalanceId(billOwner, friendUid);
          const balSnap = friendBalMap.get(balId);
          const existing = balSnap?.exists ? balSnap.data()! : null;
          const ownerBal  = (existing?.balances?.[billOwner]  ?? 0) as number;
          const friendBal = (existing?.balances?.[friendUid] ?? 0) as number;
          const balRef    = db.collection(FRIEND_BALANCES_COLLECTION).doc(balId);

          const isFullySettled = Math.abs(next) < 0.001;

          tx.set(balRef, {
            id: balId,
            participants: [billOwner, friendUid],
            balances: {
              [billOwner]:  ownerBal  + delta,
              [friendUid]: friendBal - delta,
            },
            ...(isFullySettled ? { contributingBillIds: FieldValue.arrayRemove(plan.bill.id) } : {}),
            lastUpdatedAt: now,
            lastBillId: plan.bill.id,
          }, { merge: true });
        }

        // Save updated processedBalances footprint on the bill
        tx.update(billRefs[i], { processedBalances: newProcessed });
      }

      // Event cache: NOT updated here. The ledgerProcessor pipeline auto-fires
      // when settledPersonIds changes and rebuilds event_balances as a cache.
    }

    // 4. Apply remaining amount (not covered by bills) to the direct friend ledger.
    //    ONLY if we've exhausted all bills — if we hit the batch limit, the remaining
    //    represents unprocessed bills, not overpayment.
    if (remaining > 0.01 && !hasMore) {
      const balId    = friendBalanceId(fromUserId, toUserId);
      const balSnap  = friendBalMap.get(balId);
      const existing = balSnap?.exists ? balSnap.data()! : null;
      const fromBal  = (existing?.balances?.[fromUserId] ?? 0) as number;
      const toBal    = (existing?.balances?.[toUserId]   ?? 0) as number;
      const balRef   = db.collection(FRIEND_BALANCES_COLLECTION).doc(balId);

      // fromUser pays toUser the remaining amount
      // fromUser's balance improves (less negative or more positive)
      // toUser's balance decreases
      tx.set(balRef, {
        id: balId,
        participants: [fromUserId, toUserId],
        balances: {
          [fromUserId]: fromBal + remaining,
          [toUserId]:   toBal   - remaining,
        },
        lastUpdatedAt: now,
      }, { merge: true });
    }

    // 5. Write the immutable settlement record
    tx.set(settlementRef, {
      id: settlementRef.id,
      fromUserId,
      toUserId,
      amount,
      remainingAmount: parseFloat(remaining.toFixed(2)),
      date: now,
      billsSettled: toSettle.length,
      settledBillIds: toSettle.map(p => p.bill.id),
      ...(eventId ? { eventId } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
  });

  return {
    settlementId: settlementRef.id,
    billsSettled: toSettle.length,
    amountApplied: parseFloat((amount - remaining).toFixed(2)),
    remainingAmount: parseFloat(remaining.toFixed(2)),
    hasMore,
  };
}
