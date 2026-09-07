import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  evaluateScanQuota,
  type ScanQuotaDecision,
  type ScanQuotaState,
} from '../../shared/scanQuota.js';

/**
 * The monthly free-tier scan quota, persisted on `usage/{userId}`.
 *
 * SHARES A DOCUMENT WITH THE HOURLY RATE LIMITER, IN DISJOINT FIELDS:
 *
 *   rateWindowStart / rateCount        → scanRateLimiter.ts (abuse, all plans)
 *   consecutiveScanFailures / lastFailureAt → scanRateLimiter.ts (guidance)
 *   scanPeriodStart / scansThisPeriod  → THIS FILE (free-tier business cap)
 *
 * Every write here therefore uses `{ merge: true }`. A plain `set` would wipe
 * the rate-limit window and hand the user 30 fresh abuse-limit slots.
 *
 * The two mechanisms must not be merged — see the table in `shared/scanQuota.ts`.
 * The short version: the abuse limiter RESERVES before the Gemini call and keeps
 * the slot on failure (closing the "deliberately error to scan free" bypass),
 * while this quota is CHECKED before and COMMITTED only after success, so a
 * failed scan costs the user nothing (spec §4.3.1).
 *
 * Every relative import ends in `.js` — see remoteConfigLimits.ts for why.
 */

const USAGE_COLLECTION = 'usage';

/**
 * Reads the user's quota position. Does NOT reserve or consume anything.
 *
 * NEVER THROWS. On a read failure it returns a permissive decision: the scan is
 * allowed and `degraded` is set. That direction is deliberate — this is a
 * business cap, not a security control, and the abuse limiter (which fails
 * CLOSED) has already run by this point, so the blast radius of a permissive
 * failure is bounded at 30 scans/hour rather than unbounded.
 */
export async function checkScanQuota(
  uid: string,
  limit: number,
  nowMs: number = Date.now(),
): Promise<ScanQuotaDecision & { degraded: boolean }> {
  try {
    const snap = await getFirestore().collection(USAGE_COLLECTION).doc(uid).get();
    const data = snap.data();

    const current: ScanQuotaState | null =
      data?.scanPeriodStart instanceof Timestamp && typeof data.scansThisPeriod === 'number'
        ? { periodStartMs: data.scanPeriodStart.toMillis(), count: data.scansThisPeriod }
        : null;

    return { ...evaluateScanQuota(current, nowMs, limit), degraded: false };
  } catch (error) {
    logger.error('scanQuotaLimiter: quota read failed, allowing scan', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
    // Synthesised from an empty state so the shape is identical to the happy
    // path and callers need no special case.
    return { ...evaluateScanQuota(null, nowMs, limit), degraded: true };
  }
}

/**
 * Consumes one scan from the monthly quota. Call ONLY after a scan has
 * genuinely succeeded.
 *
 * Takes the decision produced by `checkScanQuota` rather than re-reading, so the
 * increment lands in the period the check was made against — a scan checked at
 * 23:59:59.9 on the last of the month must not commit into the next one.
 *
 * NEVER THROWS. A bookkeeping failure here must not turn a successful scan into
 * an error for the user; the receipt data is already extracted and is what they
 * actually asked for. The cost of a lost increment is one extra free scan.
 *
 * NOT TRANSACTIONAL, and deliberately so: `usage/{uid}` is the same document
 * `reserveScanSlot` transacts on, and that limiter fails CLOSED. A transaction
 * here could lose the contention coin-flip and force the reserve side to exhaust
 * its retries, denying a legitimate in-quota scan. A blind merge write cannot
 * abort, so it can never be the winner that causes that denial.
 *
 * WHICH IS WHY THE INCREMENT IS RELATIVE, NOT ABSOLUTE. Writing
 * `scansThisPeriod: used + 1` looked equivalent and was not: N scans racing the
 * read in `checkScanQuota` all see `used = 0` and all write `1`, so the stored
 * count cannot climb faster than one per serialized round trip. That does not
 * cost "one uncounted scan" — it makes the effective free tier the ABUSE
 * limiter's 30/hour ceiling instead of 5/month. `FieldValue.increment` is still
 * a blind, non-aborting write, so it keeps the property above while actually
 * counting every scan. Covered by `groupCapAndQuota.int.test.ts`.
 *
 * A ROLLOVER CANNOT USE EITHER FORM, which is why it takes the one transaction
 * in this file. An increment would add to last month's total; a blind absolute
 * write loses concurrent scans exactly as described above — and "rollover" is
 * true for EVERY racer on the first scan of a month, so that is the common case,
 * not a rare one. The transaction re-reads and decides: reset if the stored
 * period really is stale, increment if another racer already reset it.
 *
 * Transacting here does not revive the contention problem. It runs at most once
 * per user per month (every later scan in the period takes the blind-increment
 * path), and it runs AFTER `reserveScanSlot` has already finished for this
 * request, so the two only ever meet across concurrent requests from the same
 * user at a month boundary. That is far inside Firestore's retry budget.
 */
export async function commitScanQuotaUsage(
  uid: string,
  decision: ScanQuotaDecision & { degraded?: boolean },
): Promise<void> {
  // A degraded decision was synthesised from an EMPTY state because the read
  // failed — `used` is 0 regardless of what is actually stored. Committing it
  // would write `1` over a user who was at 4, so a transient Firestore blip
  // would silently refund the month. Skipping keeps the failure merely
  // generous (this scan goes uncounted) instead of destructive.
  if (decision.degraded) {
    logger.warn('scanQuotaLimiter: skipping commit for a degraded decision', { uid });
    return;
  }

  try {
    const db = getFirestore();
    const ref = db.collection(USAGE_COLLECTION).doc(uid);
    const periodStart = Timestamp.fromMillis(decision.periodStartMs);

    if (!decision.periodRolled) {
      // Steady state: a blind, non-aborting increment that counts every
      // concurrent scan. merge, because the rate-limit window and failure
      // streak live on this same document.
      await ref.set({ scanPeriodStart: periodStart, scansThisPeriod: FieldValue.increment(1) }, { merge: true });
      return;
    }

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const storedStart = snap.data()?.scanPeriodStart;
      const storedCount = snap.data()?.scansThisPeriod;

      // Another racer already opened this period — join it rather than
      // stamping 1 over their count.
      const alreadyOpen =
        storedStart instanceof Timestamp && storedStart.toMillis() === decision.periodStartMs;

      const count =
        alreadyOpen && typeof storedCount === 'number' && Number.isFinite(storedCount)
          ? Math.max(0, Math.floor(storedCount)) + 1
          : 1;

      tx.set(ref, { scanPeriodStart: periodStart, scansThisPeriod: count }, { merge: true });
    });
  } catch (error) {
    logger.error('scanQuotaLimiter: failed to commit quota usage', {
      uid,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
