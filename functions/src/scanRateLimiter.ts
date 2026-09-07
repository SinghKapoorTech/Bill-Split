import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { evaluateScanRate, type ScanRateState } from '../../shared/scanRateLimit.js';
import {
  decayedStreak,
  nextFailureStreak,
  type ScanOutcome,
} from '../../shared/scanFailureStreak.js';

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
 * and returns the resulting streak — for every outcome, including
 * 'infrastructure-failure', which returns the stored streak unchanged.
 *
 * NEVER THROWS. This runs on the success path and, more importantly, inside
 * `analyzeBill`'s catch block: a Firestore blip here must not replace the real
 * failure the user needs to see with a bookkeeping error. On any error it logs
 * and reports 0, which degrades to the generic message — the safe direction.
 *
 * NEVER TAKES A TRANSACTION. usage/{userId} is the same doc `reserveScanSlot`
 * transacts on, and the limiter FAILS CLOSED. Two contending transactions made
 * the abort a coin flip, and the two outcomes are not symmetric: this path
 * losing is free (it is caught below and degrades to a generic message), while
 * the RESERVE side losing and exhausting its retries denies a legitimate,
 * in-quota scan. A blind merge write cannot abort, so it can never be the
 * winner that forces that denial — it does NOT eliminate contention (the
 * reserve transaction still retries if this write lands mid-transaction), it
 * removes this path as a contender. The streak is message-only, so the lost
 * update that a blind write risks costs at most one extra generic message.
 *
 * Gemini being down ('infrastructure-failure') is not evidence that the user's
 * photo is bad, so it never raises the streak and never pushes them toward the
 * "take a better photo" message. `analyzeBill` skips the call entirely in that
 * case, so the infrastructure path normally costs no I/O at all; the outcome is
 * still handled correctly here rather than depending on that guard.
 */
export async function recordScanOutcome(uid: string, outcome: ScanOutcome): Promise<number> {
  // Everything, including getFirestore(), is inside the try — the NEVER THROWS
  // contract above is worthless if the handle acquisition can throw past it.
  try {
    const db = getFirestore();
    const ref = db.collection('usage').doc(uid);

    const data = (await ref.get()).data();
    const stored = data?.consecutiveScanFailures as number | undefined;
    const lastFailureAtMs =
      data?.lastFailureAt instanceof Timestamp ? data.lastFailureAt.toMillis() : undefined;

    // Decay BEFORE applying the outcome. Without this the streak is a lifetime
    // tally — 14 failures last month plus 3 today reads "after 17 tries".
    const nowMs = Date.now();
    const base = decayedStreak(stored, lastFailureAtMs, nowMs);
    const streak = nextFailureStreak(base, outcome);

    // Nothing to persist. Covers the steady state (a success on a doc already
    // at 0) and every infrastructure failure on an intact streak: one cheap
    // read, no write, no lock. `stored ?? 0` so a doc that simply predates the
    // field is not written to merely to record the 0 it already implies.
    if (outcome !== 'extraction-failure' && streak === (stored ?? 0)) {
      return streak;
    }

    await ref.set(
      {
        // Relative ONLY when both of these hold, absolute otherwise:
        //
        //  - `(stored ?? 0) === base`: the base is not a CORRECTION. When decay
        //    fired, or the stored value was missing or corrupt, only an
        //    absolute write lands the right number. The `?? 0` is load-bearing:
        //    a doc that simply predates the field reads `undefined` while the
        //    sanitized base is 0, and comparing them raw sent BOTH of two
        //    concurrent FIRST failures down the absolute branch — each writing
        //    1, so the counter landed on 1 instead of 2. Same for the first
        //    failure after a decay or after a corrupt value was repaired.
        //
        //  - `streak === base + 1`: the outcome actually advanced the streak.
        //    At SCAN_FAILURE_STREAK_MAX it saturates instead, and an increment
        //    there would grow the stored value without bound behind the clamp.
        //
        // What this buys is only that concurrent failures are not LOST — it is
        // still a blind write, so two increments racing past the ceiling can
        // overshoot by the number in flight. `sanitize` clamps that on read, and
        // the next failure takes the absolute branch (stored !== base) and
        // repairs the stored value.
        consecutiveScanFailures:
          outcome === 'extraction-failure' && (stored ?? 0) === base && streak === base + 1
            ? FieldValue.increment(1)
            : streak,
        // Only a real extraction failure restarts the decay clock. Writing this
        // on success or on an outage would keep a dead streak alive.
        ...(outcome === 'extraction-failure' && { lastFailureAt: Timestamp.fromMillis(nowMs) }),
      },
      // merge: the same doc holds the rate-limit window; a plain set would wipe it.
      { merge: true },
    );

    return streak;
  } catch (error) {
    // Reported as 0 so the guidance simply does not fire — the safe direction.
    // This log line is the only truthful record that nothing was persisted;
    // the caller's `consecutiveFailures: 0` must be read alongside it.
    logger.error('scanRateLimiter: failed to record scan outcome', { uid, outcome, error });
    return 0;
  }
}
