/**
 * eventDeleteProcessor.ts
 *
 * Cloud Function: Firestore onDocumentDeleted trigger on events/{eventId}
 *
 * When an event is deleted, this function cleans up all orphaned child documents:
 *   - Deletes all bills associated with the event
 *   - Deletes the event_balances cache document
 *   - Deletes all eventInvitations for the event
 *
 * Bill deletions trigger the ledgerProcessor pipeline, which automatically
 * reverses friend_balances footprints for each deleted bill.
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';

// Lazy-initialized
let _db: ReturnType<typeof getFirestore> | null = null;
function db() {
  if (!_db) _db = getFirestore();
  return _db;
}

const BILLS_COLLECTION = 'bills';
const EVENT_BALANCES_COLLECTION = 'event_balances';
const INVITATIONS_COLLECTION = 'eventInvitations';

// Firestore writeBatch limit is 500 operations
const BATCH_LIMIT = 500;

/**
 * Deletes all documents matching a query in batches.
 * Returns the total number of documents deleted.
 */
async function deleteQueryResults(
  queryRef: FirebaseFirestore.Query
): Promise<number> {
  let totalDeleted = 0;
  let snap = await queryRef.get();

  while (!snap.empty) {
    const batch = db().batch();
    const docsToDelete = snap.docs.slice(0, BATCH_LIMIT);

    for (const docSnap of docsToDelete) {
      batch.delete(docSnap.ref);
    }

    await batch.commit();
    totalDeleted += docsToDelete.length;

    // If there are more docs than the batch limit, query again
    if (snap.docs.length > BATCH_LIMIT) {
      snap = await queryRef.get();
    } else {
      break;
    }
  }

  return totalDeleted;
}

export const eventDeleteProcessor = onDocumentDeleted(
  { document: 'events/{eventId}', timeoutSeconds: 120, memory: '256MiB' },
  async (event) => {
    const eventId = event.params.eventId;
    logger.info('Event deleted, starting cascade cleanup', { eventId });

    // 1. Delete all bills for this event
    // Each bill deletion triggers ledgerProcessor which reverses friend_balances
    const billsQuery = db().collection(BILLS_COLLECTION)
      .where('eventId', '==', eventId);
    const billsDeleted = await deleteQueryResults(billsQuery);
    logger.info('Cascade: bills deleted', { eventId, billsDeleted });

    // 2. Delete the event_balances cache document
    const cacheRef = db().collection(EVENT_BALANCES_COLLECTION).doc(eventId);
    const cacheSnap = await cacheRef.get();
    if (cacheSnap.exists) {
      await cacheRef.delete();
      logger.info('Cascade: event_balances cache deleted', { eventId });
    }

    // 3. Delete all eventInvitations for this event
    const invitationsQuery = db().collection(INVITATIONS_COLLECTION)
      .where('eventId', '==', eventId);
    const invitationsDeleted = await deleteQueryResults(invitationsQuery);
    logger.info('Cascade: invitations deleted', { eventId, invitationsDeleted });

    logger.info('Cascade cleanup complete', { eventId, billsDeleted, invitationsDeleted });
  }
);
