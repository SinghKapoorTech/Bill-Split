import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  evaluateScanRate,
  SCAN_RATE_LIMIT,
  type ScanRateState,
} from '../../shared/scanRateLimit.js';

/** Per-instance latch so a broken config warns once, not once per request. */
let warnedConfigFallback = false;

/**
 * Reserves one scan slot for `uid`, or reports that the window is exhausted.
 *
 * Writes to usage/{userId}, which denies all client writes (firestore.rules).
 * The decision is returned rather than thrown from inside the transaction so a
 * rejection can never be mistaken for transaction contention and retried.
 */
export async function reserveScanSlot(
  uid: string,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const db = getFirestore();
  const ref = db.collection('usage').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();

    const current: ScanRateState | null =
      data?.rateWindowStart instanceof Timestamp && typeof data.rateCount === 'number'
        ? { windowStartMs: data.rateWindowStart.toMillis(), count: data.rateCount }
        : null;

    const decision = evaluateScanRate(current, Date.now());

    if (decision.usedConfigFallback && !warnedConfigFallback) {
      // The limiter is still enforcing, but on the module defaults rather than
      // the supplied config. Once limit/windowMs come from Remote Config this
      // is the only signal that a key is unpublished or mistyped.
      //
      // Once per instance: this runs inside runTransaction, so an unguarded
      // warn would fire per request AND again on every transaction retry —
      // one bad config key would become unbounded log spend. Instances recycle
      // often enough that a persistently broken key still stays visible.
      warnedConfigFallback = true;
      logger.warn('scanRateLimiter: invalid limit/window config, using defaults', { uid });
    }

    if (decision.allowed) {
      tx.set(
        ref,
        {
          rateWindowStart: Timestamp.fromMillis(decision.next.windowStartMs),
          rateCount: decision.next.count,
        },
        { merge: true },
      );
    }

    return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs };
  });
}

export { SCAN_RATE_LIMIT };
