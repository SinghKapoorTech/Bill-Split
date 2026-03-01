/**
 * eventDeleteProcessor.ts
 *
 * Cloud Function: Firestore onDocumentDeleted trigger on events/{eventId}
 *
 * When an event is deleted, this function:
 *   1. Explicitly reverses ledger footprints for each bill (friend_balances + event_balances)
 *      — the same reversal that happens when a single bill is deleted
 *   2. Deletes all bills associated with the event
 *   3. Deletes all event_balances pair documents for the event
 *   4. Deletes all eventInvitations for the event
 *
 * The reversal functions are idempotent, so if the cascading ledgerProcessor
 * also fires on bill deletion, the double-reversal is safely skipped.
 */

import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { reverseFootprint, reverseEventFootprint } from './ledgerProcessor.js';

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

    // 1. Read all bills for this event and explicitly reverse their ledger footprints
    //    This mirrors what ledgerProcessor does when a single bill is deleted.
    const billsSnap = await db().collection(BILLS_COLLECTION)
      .where('eventId', '==', eventId)
      .get();

    let billsReversed = 0;
    for (const billDoc of billsSnap.docs) {
      const bill = billDoc.data();
      const billId = billDoc.id;
      const ownerId = bill.ownerId;

      if (!ownerId) continue;

      // Stage 2: Reverse friend_balances (same as single bill delete)
      const processedBalances = bill.processedBalances;
      if (processedBalances && Object.keys(processedBalances).length > 0) {
        try {
          await reverseFootprint(billId, ownerId, processedBalances);
          logger.info('Reversed friend footprint', { billId, eventId, friendsReversed: Object.keys(processedBalances).length });
        } catch (err) {
          logger.error('Failed to reverse friend footprint', { billId, eventId, error: String(err) });
        }
      }

      // Stage 3: Reverse event_balances (same as single bill delete)
      const processedEventBalances = bill.processedEventBalances;
      if (processedEventBalances && Object.keys(processedEventBalances).length > 0) {
        try {
          await reverseEventFootprint(billId, eventId, ownerId, processedEventBalances);
          logger.info('Reversed event footprint', { billId, eventId, participantsReversed: Object.keys(processedEventBalances).length });
        } catch (err) {
          logger.error('Failed to reverse event footprint', { billId, eventId, error: String(err) });
        }
      }

      billsReversed++;
    }
    logger.info('Ledger reversals complete', { eventId, billsReversed, totalBills: billsSnap.size });

    // 2. Delete all bills for this event
    //    Cascading ledgerProcessor triggers are safe — reversals are idempotent
    const billsQuery = db().collection(BILLS_COLLECTION)
      .where('eventId', '==', eventId);
    const billsDeleted = await deleteQueryResults(billsQuery);
    logger.info('Cascade: bills deleted', { eventId, billsDeleted });

    // 3. Delete all event_balances pair documents for this event
    const eventBalancesQuery = db().collection(EVENT_BALANCES_COLLECTION)
      .where('eventId', '==', eventId);
    const eventBalancesDeleted = await deleteQueryResults(eventBalancesQuery);
    logger.info('Cascade: event_balances pair docs deleted', { eventId, eventBalancesDeleted });

    // 4. Delete all eventInvitations for this event
    const invitationsQuery = db().collection(INVITATIONS_COLLECTION)
      .where('eventId', '==', eventId);
    const invitationsDeleted = await deleteQueryResults(invitationsQuery);
    logger.info('Cascade: invitations deleted', { eventId, invitationsDeleted });

    logger.info('Cascade cleanup complete', { eventId, billsReversed, billsDeleted, eventBalancesDeleted, invitationsDeleted });
  }
);
