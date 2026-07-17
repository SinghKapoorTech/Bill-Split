import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { toSingleBalance } from '../../../shared/ledgerCalculations.js';

const BILLS = 'bills';
const EVENT_BALANCES = 'event_balances';

/**
 * One-time reconciliation for event footprints orphaned BEFORE processedEventId
 * existed.
 *
 * Such a bill left its event (its eventId was removed) but still carries a
 * non-empty processedEventBalances and was never stamped with a processedEventId
 * — so the live pipeline cannot identify which event to reverse, and the bill's
 * contribution stays stranded in that event's pair docs forever.
 *
 * We find the pair docs that still list the bill (array-contains) and reverse
 * this bill's contribution DIRECTLY against each of them, inferring the anchor
 * from the doc's own participants (the footprint records the debtor; the anchor
 * is the other member). That is immune to a drifted paidById — re-deriving the
 * doc id from the bill's anchor could miss the real doc and strand the balance.
 *
 * The bill's stale footprint fields are cleared only once every listing doc was
 * resolved; if any doc's participants don't match the footprint, we leave the
 * footprint intact (recoverable) and log, rather than stranding it.
 *
 * Idempotent: a pair doc that no longer lists the bill is a no-op, and a bill
 * whose footprint was already cleared is skipped on any later run.
 */
export async function reconcileOrphanedEventFootprints(
  database: Firestore
): Promise<{ scanned: number; reconciled: number }> {
  const billsSnap = await database.collection(BILLS).get();
  let scanned = 0;
  let reconciled = 0;

  for (const doc of billsSnap.docs) {
    const bill = doc.data();
    const footprint: Record<string, number> = bill.processedEventBalances || {};

    // Orphan = left its event (no eventId) AND never stamped with the event it
    // was applied to (processedEventId), yet still carries a footprint. Bills
    // that still have an eventId, or that carry processedEventId, are handled
    // by the live pipeline (applyEventPairLedger / clearStaleEventFootprint).
    if (bill.eventId) continue;
    if (bill.processedEventId) continue;
    if (Object.keys(footprint).length === 0) continue;
    scanned++;

    // Every pair doc that still lists this bill.
    const pairSnap = await database
      .collection(EVENT_BALANCES)
      .where('unsettledBillIds', 'array-contains', doc.id)
      .get();

    let unresolved = 0;
    for (const pairDoc of pairSnap.docs) {
      const ok = await database.runTransaction(async (tx) => {
        const fresh = await tx.get(pairDoc.ref);
        if (!fresh.exists) return true; // doc gone — nothing to reverse
        const data = fresh.data()!;
        const unsettled: string[] = data.unsettledBillIds || [];
        if (!unsettled.includes(doc.id)) return true; // already reversed (idempotent)

        const participants: string[] = data.participants || [];
        // The footprint records the DEBTOR (non-anchor). Infer the anchor as the
        // pair member the footprint does NOT name — independent of paidById.
        const debtor = participants.find((p) => footprint[p] !== undefined);
        if (!debtor) return false; // footprint doesn't match this pair — leave it
        const anchor = participants.find((p) => p !== debtor) ?? debtor;

        const reversalDelta = toSingleBalance(anchor, debtor, -footprint[debtor]);
        tx.set(
          pairDoc.ref,
          {
            balance: (data.balance ?? 0) + reversalDelta,
            unsettledBillIds: FieldValue.arrayRemove(doc.id),
            lastUpdatedAt: Timestamp.now(),
            lastBillId: doc.id,
          },
          { merge: true }
        );
        return true;
      });
      if (!ok) unresolved++;
    }

    if (unresolved > 0) {
      logger.warn('Orphan reconcile: pair doc(s) did not match the footprint; leaving bill footprint intact for manual review', {
        billId: doc.id,
        unresolved,
      });
      continue; // recoverable — do NOT clear the footprint
    }

    await doc.ref.update({
      processedEventBalances: {},
      processedEventBalancesAnchorId: FieldValue.delete(),
      processedEventId: FieldValue.delete(),
    });
    reconciled++;
    logger.info('Reconciled orphaned event footprint', { billId: doc.id });
  }

  logger.info('Orphaned event footprint reconciliation complete', { scanned, reconciled });
  return { scanned, reconciled };
}
