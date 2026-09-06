import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  evaluateScanRate,
  SCAN_RATE_LIMIT,
  type ScanRateState,
} from '../../shared/scanRateLimit.js';
import { nextFailureStreak, type ScanOutcome } from '../../shared/scanFailureStreak.js';

/** Per-instance latch so a broken config warns once, not once per request. */
let warnedConfigFallback = false;

export interface ScanSlotReservation {
  allowed: boolean;
  /** Milliseconds until the window reopens. Zero when allowed. */
  retryAfterMs: number;
  /**
   * The limit/window the decision was actually made against. The caller MUST
   * build its user-facing message from these rather than from the module
   * constants — once Remote Config supplies the values, a hardcoded "30 per
   * hour" contradicts both the enforcement and `retryAfterMs`.
   */
  effectiveLimit: number;
  effectiveWindowMs: number;
}

/**
 * Reserves one scan slot for `uid`, or reports that the window is exhausted.
 *
 * Writes to usage/{userId}, which denies all client writes (firestore.rules).
 * The decision is returned rather than thrown from inside the transaction so a
 * rejection can never be mistaken for transaction contention and retried.
 */
export async function reserveScanSlot(uid: string): Promise<ScanSlotReservation> {
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

    // effectiveLimit/effectiveWindowMs are surfaced so the caller's message and
    // the enforcement can never disagree — see ScanRateDecision.
    return {
      allowed: decision.allowed,
      retryAfterMs: decision.retryAfterMs,
      effectiveLimit: decision.effectiveLimit,
      effectiveWindowMs: decision.effectiveWindowMs,
    };
  });
}

/**
 * Applies `outcome` to the user's consecutive-failure streak on usage/{userId}
 * and returns the resulting streak.
 *
 * NEVER THROWS. This runs on the success path and, more importantly, inside
 * `analyzeBill`'s catch block: a Firestore blip here must not replace the real
 * failure the user needs to see with a bookkeeping error. On any error it logs
 * and reports 0, which degrades to the generic message — the safe direction.
 *
 * An 'infrastructure-failure' leaves the stored value alone entirely (no write,
 * no transaction): Gemini being down is not evidence that the user's photo is
 * bad, and it must never push them toward the "take a better photo" message.
 */
export async function recordScanOutcome(uid: string, outcome: ScanOutcome): Promise<number> {
  // Everything, including getFirestore(), is inside the try — the NEVER THROWS
  // contract above is worthless if the handle acquisition can throw past it.
  try {
    if (outcome === 'infrastructure-failure') {
      // No read, no write, no I/O at all. Gemini being down says nothing about
      // the user's photo, and the caller does not use this value.
      return 0;
    }

    const db = getFirestore();
    const ref = db.collection('usage').doc(uid);

    // Non-transactional read first. The steady state — a success on a doc that
    // is already at 0 — then costs one cheap read and no lock. Taking a
    // transaction here would contend on the same usage/{uid} doc that
    // reserveScanSlot writes, and since the limiter now FAILS CLOSED, losing
    // that contention would deny a legitimate scan. The transaction below
    // re-reads, so this fast path cannot introduce a lost update.
    const stored = (await ref.get()).data()?.consecutiveScanFailures as number | undefined;
    if (nextFailureStreak(stored, outcome) === stored) {
      return stored as number;
    }

    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const streak = nextFailureStreak(
        snap.data()?.consecutiveScanFailures as number | undefined,
        outcome,
      );
      // merge: the same doc holds the rate-limit window; a plain set would wipe it.
      tx.set(ref, { consecutiveScanFailures: streak }, { merge: true });
      return streak;
    });
  } catch (error) {
    // Reported as 0 so the guidance simply does not fire — the safe direction.
    // This log line is the only truthful record that nothing was persisted;
    // the caller's `consecutiveFailures: 0` must be read alongside it.
    logger.error('scanRateLimiter: failed to record scan outcome', { uid, outcome, error });
    return 0;
  }
}

export { SCAN_RATE_LIMIT };
