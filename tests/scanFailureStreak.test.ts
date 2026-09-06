import { describe, it, expect } from 'vitest';
import {
  nextFailureStreak,
  shouldSuggestDifferentImage,
  SCAN_FAILURE_STREAK_CAP,
  type ScanOutcome,
} from '@shared/scanFailureStreak';

/** Cast helper for the malformed values a real usage/{userId} doc can produce. */
const asStreak = (value: unknown) => value as number | undefined;

describe('nextFailureStreak', () => {
  it('counts an extraction failure', () => {
    expect(nextFailureStreak(0, 'extraction-failure')).toBe(1);
    expect(nextFailureStreak(2, 'extraction-failure')).toBe(3);
  });

  it('resets to zero on success', () => {
    expect(nextFailureStreak(0, 'success')).toBe(0);
    expect(nextFailureStreak(9, 'success')).toBe(0);
  });

  it('leaves the streak unchanged on an infrastructure failure', () => {
    // The whole point of the distinction: a Gemini outage is not evidence that
    // the user's photo is bad, so it must not walk them toward the guidance.
    expect(nextFailureStreak(0, 'infrastructure-failure')).toBe(0);
    expect(nextFailureStreak(2, 'infrastructure-failure')).toBe(2);
  });

  it('never reaches the cap from infrastructure failures alone', () => {
    let streak = 0;
    for (let i = 0; i < 50; i++) {
      streak = nextFailureStreak(streak, 'infrastructure-failure');
    }
    expect(streak).toBe(0);
    expect(shouldSuggestDifferentImage(streak)).toBe(false);
  });

  it('reaches the cap after exactly CAP consecutive extraction failures', () => {
    let streak: number | undefined = undefined;
    for (let i = 1; i <= SCAN_FAILURE_STREAK_CAP; i++) {
      streak = nextFailureStreak(streak, 'extraction-failure');
      expect(shouldSuggestDifferentImage(streak)).toBe(i >= SCAN_FAILURE_STREAK_CAP);
    }
    expect(streak).toBe(SCAN_FAILURE_STREAK_CAP);
  });

  it('an infrastructure failure mid-run neither advances nor resets the run', () => {
    let streak = nextFailureStreak(undefined, 'extraction-failure');
    streak = nextFailureStreak(streak, 'extraction-failure');
    streak = nextFailureStreak(streak, 'infrastructure-failure');
    expect(streak).toBe(2);
    expect(shouldSuggestDifferentImage(streak)).toBe(false);

    streak = nextFailureStreak(streak, 'extraction-failure');
    expect(streak).toBe(3);
    expect(shouldSuggestDifferentImage(streak)).toBe(true);
  });

  it('one success clears a streak that had already hit the cap', () => {
    // The cap changes the message only; the user must be able to recover by
    // submitting a better photo, and recovery has to be immediate.
    const capped = SCAN_FAILURE_STREAK_CAP + 5;
    expect(shouldSuggestDifferentImage(capped)).toBe(true);
    const after = nextFailureStreak(capped, 'success');
    expect(after).toBe(0);
    expect(shouldSuggestDifferentImage(after)).toBe(false);
  });

  describe('untrusted stored values', () => {
    it('treats a missing field as zero', () => {
      expect(nextFailureStreak(undefined, 'extraction-failure')).toBe(1);
      expect(nextFailureStreak(undefined, 'infrastructure-failure')).toBe(0);
      expect(nextFailureStreak(undefined, 'success')).toBe(0);
    });

    it('repairs NaN instead of making it permanent', () => {
      // NaN + 1 is NaN forever, and both `NaN >= cap` and `NaN < cap` are false,
      // so an unsanitized NaN would freeze the streak and the guidance could
      // never fire for that user again.
      expect(nextFailureStreak(NaN, 'extraction-failure')).toBe(1);
      expect(nextFailureStreak(NaN, 'infrastructure-failure')).toBe(0);
      expect(Number.isNaN(nextFailureStreak(NaN, 'extraction-failure'))).toBe(false);
    });

    it('repairs Infinity', () => {
      expect(nextFailureStreak(Infinity, 'extraction-failure')).toBe(1);
      expect(nextFailureStreak(-Infinity, 'extraction-failure')).toBe(1);
    });

    it('repairs a negative streak rather than counting up from it', () => {
      // A stored -5 would otherwise need 8 failures before the guidance fired.
      expect(nextFailureStreak(-5, 'extraction-failure')).toBe(1);
      expect(nextFailureStreak(-1, 'infrastructure-failure')).toBe(0);
    });

    it('floors a non-integer streak so it cannot hit the cap early', () => {
      expect(nextFailureStreak(2.9, 'extraction-failure')).toBe(3);
      expect(nextFailureStreak(0.9, 'extraction-failure')).toBe(1);
      expect(nextFailureStreak(2.9, 'infrastructure-failure')).toBe(2);
    });

    it('treats non-numeric junk as zero', () => {
      expect(nextFailureStreak(asStreak('3'), 'extraction-failure')).toBe(1);
      expect(nextFailureStreak(asStreak(null), 'extraction-failure')).toBe(1);
      expect(nextFailureStreak(asStreak({}), 'infrastructure-failure')).toBe(0);
      expect(nextFailureStreak(asStreak([]), 'success')).toBe(0);
    });

    it('always returns a finite non-negative integer', () => {
      const junk = [undefined, NaN, Infinity, -Infinity, -7, 2.5, '3', null, {}, []];
      const outcomes: ScanOutcome[] = ['success', 'extraction-failure', 'infrastructure-failure'];
      for (const value of junk) {
        for (const outcome of outcomes) {
          const result = nextFailureStreak(asStreak(value), outcome);
          expect(Number.isInteger(result)).toBe(true);
          expect(result).toBeGreaterThanOrEqual(0);
        }
      }
    });
  });
});

describe('shouldSuggestDifferentImage', () => {
  it('fires at the cap, not before', () => {
    expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_CAP - 1)).toBe(false);
    expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_CAP)).toBe(true);
    expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_CAP + 1)).toBe(true);
  });

  it('never fires on a fresh or unknown streak', () => {
    expect(shouldSuggestDifferentImage(0)).toBe(false);
    expect(shouldSuggestDifferentImage(asStreak(undefined) as number)).toBe(false);
    expect(shouldSuggestDifferentImage(NaN)).toBe(false);
    expect(shouldSuggestDifferentImage(-3)).toBe(false);
  });

  it('honours an explicit cap', () => {
    expect(shouldSuggestDifferentImage(1, 2)).toBe(false);
    expect(shouldSuggestDifferentImage(2, 2)).toBe(true);
    expect(shouldSuggestDifferentImage(9, 10)).toBe(false);
  });

  it('falls back to the default cap for an unusable one', () => {
    // Remote Config returns 0 for an unpublished key. A cap of 0 would make the
    // guidance fire on a streak of zero — i.e. before the user has failed at all.
    for (const badCap of [0, -1, NaN, Infinity, 0.5]) {
      expect(shouldSuggestDifferentImage(0, badCap)).toBe(false);
      expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_CAP, badCap)).toBe(true);
    }
  });

  it('floors a fractional cap rather than rounding it up', () => {
    expect(shouldSuggestDifferentImage(2, 2.9)).toBe(true);
  });
});
