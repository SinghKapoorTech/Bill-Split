/**
 * friendAddProcessor.ts
 *
 * Cloud Function: Firestore onDocumentUpdated trigger on users/{userId}
 *
 * When a user adds a new friend, this function retroactively triggers the
 * ledger pipeline for all shared bills between the two users. This ensures
 * that historical bills (created before the friendship was established)
 * correctly appear in friend_balances.
 *
 * How it works:
 *   1. Diffs before.friends vs after.friends to detect newly added UIDs
 *   2. Queries bills owned by this user that include the new friend
 *      (uses existing participantIds + ownerId composite index)
 *   3. Touches each bill with _friendScanTrigger to re-trigger the pipeline
 *   4. The ledgerProcessor fires, now sees the new friend in resolveLinkedFriends(),
 *      computes the footprint delta, and updates friend_balances
 *
 * Only processes bills owned by the user who added the friend.
 * Bills owned by the new friend are processed when/if the friend adds
 * the user back (consistent with the pipeline's resolveLinkedFriends design).
 */

import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Lazy-initialized: getFirestore() must not run at import time because
// initializeApp() in index.ts may not have executed yet.
let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const MAX_BILLS_PER_SCAN = 50;

/**
 * Extracts friend UIDs from the friends array.
 * Handles both modern (string[]) and legacy ({ userId, id }) formats.
 */
function extractFriendUids(friends: any[]): Set<string> {
  const uids = new Set<string>();
  for (const f of friends) {
    const uid = typeof f === 'string' ? f : (f.userId || f.id);
    if (uid && typeof uid === 'string') uids.add(uid);
  }
  return uids;
}

export const friendAddProcessor = onDocumentUpdated(
  { document: 'users/{userId}', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    const userId = event.params.userId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!before || !after) return;

    // Extract friend UIDs from before and after
    const beforeFriends = extractFriendUids(before.friends || []);
    const afterFriends = extractFriendUids(after.friends || []);

    // Find newly added friend UIDs
    const newFriendUids: string[] = [];
    for (const uid of afterFriends) {
      if (!beforeFriends.has(uid)) {
        newFriendUids.push(uid);
      }
    }

    if (newFriendUids.length === 0) {
      return; // No new friends added, nothing to do
    }

    console.log(
      `[friendAddProcessor] User ${userId} added ${newFriendUids.length} new friend(s): ${newFriendUids.join(', ')}`
    );

    // For each new friend, find shared bills and trigger re-processing
    let totalBillsTouched = 0;

    for (const newFriendUid of newFriendUids) {
      if (totalBillsTouched >= MAX_BILLS_PER_SCAN) {
        console.log(
          `[friendAddProcessor] Reached batch limit (${MAX_BILLS_PER_SCAN}), stopping`
        );
        break;
      }

      // Query bills owned by this user that include the new friend.
      // Uses existing composite index: participantIds ARRAY-CONTAINS + ownerId
      const billsSnap = await db()
        .collection(BILLS_COLLECTION)
        .where('participantIds', 'array-contains', newFriendUid)
        .where('ownerId', '==', userId)
        .get();

      if (billsSnap.empty) {
        console.log(
          `[friendAddProcessor] No shared bills found for friend ${newFriendUid}`
        );
        continue;
      }

      const remaining = MAX_BILLS_PER_SCAN - totalBillsTouched;
      const billsToTouch = billsSnap.docs.slice(0, remaining);

      // Batch-write _friendScanTrigger to re-trigger the ledger pipeline.
      // The pipeline's hasRelevantChange() includes _friendScanTrigger,
      // so changing it causes the pipeline to re-process the bill.
      const batch = db().batch();
      const now = Timestamp.now();

      for (const billDoc of billsToTouch) {
        batch.update(billDoc.ref, { _friendScanTrigger: now });
      }

      await batch.commit();
      totalBillsTouched += billsToTouch.length;

      console.log(
        `[friendAddProcessor] Touched ${billsToTouch.length} bill(s) for friend ${newFriendUid}`
      );
    }

    console.log(
      `[friendAddProcessor] Done. Total bills touched: ${totalBillsTouched}`
    );
  }
);
