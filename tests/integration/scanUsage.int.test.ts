/**
 * Emulator-backed tests for the scan usage bookkeeping on `usage/{userId}`.
 *
 * The pure decisions (`nextFailureStreak`, `decayedStreak`, `evaluateScanRate`)
 * are unit-tested in tests/. What can only be proven against a real Firestore
 * is the persistence behaviour: that the failure path writes without taking a
 * lock on the doc the rate limiter is transacting on, that a merge write leaves
 * the limiter's own window fields intact, and that a stale streak is aged out
 * rather than accumulated forever.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { recordScanOutcome, reserveScanSlot } from '../../functions/src/scanRateLimiter';
import {
  SCAN_FAILURE_STREAK_MAX,
  SCAN_STREAK_DECAY_MS,
  shouldSuggestDifferentImage,
} from '../../shared/scanFailureStreak';

const UID = 'scan-user-1';
const usageRef = () => db.collection('usage').doc(UID);
const readUsage = async () => (await usageRef().get()).data();

describe('recordScanOutcome (usage/{userId})', () => {
  beforeEach(clearFirestore);

  it('records the first extraction failure and stamps the decay clock', async () => {
    const before = Date.now();
    const streak = await recordScanOutcome(UID, 'extraction-failure');

    expect(streak).toBe(1);
    const data = await readUsage();
    expect(data?.consecutiveScanFailures).toBe(1);
    expect(data?.lastFailureAt).toBeInstanceOf(Timestamp);
    expect(data?.lastFailureAt.toMillis()).toBeGreaterThanOrEqual(before);
  });

  it('counts consecutive extraction failures up to the guidance cap', async () => {
    expect(await recordScanOutcome(UID, 'extraction-failure')).toBe(1);
    expect(await recordScanOutcome(UID, 'extraction-failure')).toBe(2);
    const third = await recordScanOutcome(UID, 'extraction-failure');
    expect(third).toBe(3);
    expect(shouldSuggestDifferentImage(third)).toBe(true);
    expect((await readUsage())?.consecutiveScanFailures).toBe(3);
  });

  it('clears the streak on a success', async () => {
    await recordScanOutcome(UID, 'extraction-failure');
    await recordScanOutcome(UID, 'extraction-failure');

    expect(await recordScanOutcome(UID, 'success')).toBe(0);
    expect((await readUsage())?.consecutiveScanFailures).toBe(0);
  });

  it('writes nothing on a success against a doc that has never failed', async () => {
    await usageRef().set({ rateCount: 4 });

    expect(await recordScanOutcome(UID, 'success')).toBe(0);
    // The field is not created merely to record the 0 the doc already implies.
    expect((await readUsage())?.consecutiveScanFailures).toBeUndefined();
  });

  // Finding 2: the infrastructure branch used to return a hardcoded 0 while its
  // JSDoc promised "the resulting streak". A user at streak 3 who hit one Gemini
  // outage silently reported 0, which is below the guidance cap.
  it('returns the stored streak UNCHANGED for an infrastructure failure', async () => {
    await recordScanOutcome(UID, 'extraction-failure');
    await recordScanOutcome(UID, 'extraction-failure');
    await recordScanOutcome(UID, 'extraction-failure');
    const stampBefore = (await readUsage())?.lastFailureAt.toMillis();

    const streak = await recordScanOutcome(UID, 'infrastructure-failure');

    expect(streak).toBe(3);
    expect(shouldSuggestDifferentImage(streak)).toBe(true);
    const data = await readUsage();
    // Neither raised (an outage is not evidence about the photo) nor reset, and
    // the decay clock is not restarted by someone else's outage.
    expect(data?.consecutiveScanFailures).toBe(3);
    expect(data?.lastFailureAt.toMillis()).toBe(stampBefore);
  });

  // Finding 4: the failure path used to open a transaction on the very doc
  // reserveScanSlot writes. With the limiter failing closed, losing that
  // contention denied an in-quota scan.
  it('does not clobber the rate-limit window it shares the doc with', async () => {
    const first = await reserveScanSlot(UID);
    expect(first.allowed).toBe(true);

    await recordScanOutcome(UID, 'extraction-failure');

    const data = await readUsage();
    expect(data?.rateCount).toBe(1);
    expect(data?.rateWindowStart).toBeInstanceOf(Timestamp);
    expect(data?.consecutiveScanFailures).toBe(1);

    // And the limiter keeps counting from where it was, not from scratch.
    expect((await reserveScanSlot(UID)).allowed).toBe(true);
    expect((await readUsage())?.rateCount).toBe(2);
  });

  it('runs concurrently with the limiter without denying an in-quota scan', async () => {
    const results = await Promise.all([
      reserveScanSlot(UID),
      recordScanOutcome(UID, 'extraction-failure'),
      reserveScanSlot(UID),
      recordScanOutcome(UID, 'extraction-failure'),
      reserveScanSlot(UID),
    ]);

    const reservations = [results[0], results[2], results[4]] as Awaited<
      ReturnType<typeof reserveScanSlot>
    >[];
    for (const r of reservations) {
      expect(r.allowed).toBe(true);
    }
    expect((await readUsage())?.rateCount).toBe(3);
  });

  it('counts concurrent failures relatively rather than losing one', async () => {
    await usageRef().set({
      consecutiveScanFailures: 1,
      lastFailureAt: Timestamp.fromMillis(Date.now()),
    });

    await Promise.all([
      recordScanOutcome(UID, 'extraction-failure'),
      recordScanOutcome(UID, 'extraction-failure'),
      recordScanOutcome(UID, 'extraction-failure'),
      recordScanOutcome(UID, 'extraction-failure'),
    ]);

    expect((await readUsage())?.consecutiveScanFailures).toBe(5);
  });

  // Finding 6: the streak never decayed, so 14 failures last month plus today's
  // rendered "we couldn't read that receipt after 15 tries".
  it('ages out a streak whose last failure is older than the decay window', async () => {
    await usageRef().set({
      consecutiveScanFailures: 14,
      lastFailureAt: Timestamp.fromMillis(Date.now() - SCAN_STREAK_DECAY_MS - 60_000),
    });

    const streak = await recordScanOutcome(UID, 'extraction-failure');

    expect(streak).toBe(1);
    expect(shouldSuggestDifferentImage(streak)).toBe(false);
    expect((await readUsage())?.consecutiveScanFailures).toBe(1);
  });

  it('keeps a streak whose last failure is inside the decay window', async () => {
    await usageRef().set({
      consecutiveScanFailures: 2,
      lastFailureAt: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
    });

    expect(await recordScanOutcome(UID, 'extraction-failure')).toBe(3);
  });

  it('restarts a pre-existing streak that has no timestamp at all', async () => {
    // Exactly the shape of a usage doc written before lastFailureAt existed.
    await usageRef().set({ consecutiveScanFailures: 9 });

    const streak = await recordScanOutcome(UID, 'extraction-failure');

    expect(streak).toBe(1);
    const data = await readUsage();
    expect(data?.consecutiveScanFailures).toBe(1);
    expect(data?.lastFailureAt).toBeInstanceOf(Timestamp);
  });

  it('repairs a corrupt stored counter instead of incrementing it', async () => {
    await usageRef().set({ consecutiveScanFailures: 'lots' });

    expect(await recordScanOutcome(UID, 'extraction-failure')).toBe(1);
    expect((await readUsage())?.consecutiveScanFailures).toBe(1);
  });

  // The relative-write guard used to read `stored === base`. On a doc that has
  // never failed, `stored` is undefined while the sanitized `base` is 0, so the
  // comparison was false and BOTH concurrent first failures took the absolute
  // branch — each writing 1, landing the counter on 1 instead of 2.
  it('counts concurrent FIRST failures relatively, from a doc with no counter', async () => {
    await usageRef().set({ rateCount: 1 });

    await Promise.all([
      recordScanOutcome(UID, 'extraction-failure'),
      recordScanOutcome(UID, 'extraction-failure'),
      recordScanOutcome(UID, 'extraction-failure'),
    ]);

    expect((await readUsage())?.consecutiveScanFailures).toBe(3);
  });

  it('counts concurrent first failures relatively on a completely absent doc', async () => {
    await Promise.all([
      recordScanOutcome(UID, 'extraction-failure'),
      recordScanOutcome(UID, 'extraction-failure'),
    ]);

    expect((await readUsage())?.consecutiveScanFailures).toBe(2);
  });

  // Same hole, reached through a correction: the failure right after a decay
  // (or after a corrupt value is repaired) is a "first" failure too.
  it('counts concurrent first failures after a decay', async () => {
    await usageRef().set({
      consecutiveScanFailures: 2,
      lastFailureAt: Timestamp.fromMillis(Date.now() - SCAN_STREAK_DECAY_MS - 60_000),
    });

    await Promise.all([
      recordScanOutcome(UID, 'extraction-failure'),
      recordScanOutcome(UID, 'extraction-failure'),
    ]);

    // The decayed base is a CORRECTION, so at least one absolute write of 1 has
    // to land — but the counter must not be left below the true run either.
    const stored = (await readUsage())?.consecutiveScanFailures;
    expect(stored).toBeGreaterThanOrEqual(1);
    expect(stored).toBeLessThanOrEqual(2);
  });

  // Finding 1: nothing clamped the counter, so one failed scan a day kept
  // restamping lastFailureAt, decay never fired, and the message eventually
  // read "we couldn't read that receipt after 40 tries".
  it('saturates the stored counter at the ceiling instead of counting forever', async () => {
    for (let i = 0; i < SCAN_FAILURE_STREAK_MAX + 4; i++) {
      const streak = await recordScanOutcome(UID, 'extraction-failure');
      expect(streak).toBeLessThanOrEqual(SCAN_FAILURE_STREAK_MAX);
    }

    expect((await readUsage())?.consecutiveScanFailures).toBe(SCAN_FAILURE_STREAK_MAX);
    // Clamping changes the number shown, never the decision.
    expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_MAX)).toBe(true);
  });

  it('repairs a legacy tally already stored above the ceiling', async () => {
    // usage/{userId} docs written before the clamp hold values like 40. No
    // migration: the next failure reads, clamps and rewrites them.
    await usageRef().set({
      consecutiveScanFailures: 40,
      lastFailureAt: Timestamp.fromMillis(Date.now() - 60 * 60 * 1000),
    });

    expect(await recordScanOutcome(UID, 'extraction-failure')).toBe(SCAN_FAILURE_STREAK_MAX);
    expect((await readUsage())?.consecutiveScanFailures).toBe(SCAN_FAILURE_STREAK_MAX);
  });

  it('does not resurrect a decayed streak on a success', async () => {
    await usageRef().set({
      consecutiveScanFailures: 7,
      lastFailureAt: Timestamp.fromMillis(Date.now() - SCAN_STREAK_DECAY_MS - 1),
    });

    expect(await recordScanOutcome(UID, 'success')).toBe(0);
    expect((await readUsage())?.consecutiveScanFailures).toBe(0);
  });
});
