import { describe, it, expect } from 'vitest';
import {
  classifyThrownScanError,
  decayedStreak,
  nextFailureStreak,
  SCAN_STREAK_DECAY_MS,
  shouldSuggestDifferentImage,
  SCAN_FAILURE_STREAK_CAP,
  SCAN_FAILURE_STREAK_MAX,
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
    expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_MAX - 1, SCAN_FAILURE_STREAK_MAX)).toBe(
      false,
    );
  });

  it('clamps a cap above the streak ceiling instead of disabling the guidance', () => {
    // The streak saturates at SCAN_FAILURE_STREAK_MAX, so a Remote Config cap
    // of 10 would be unreachable and the guidance would silently never fire
    // again. Degrading to the closest threshold that CAN fire matches every
    // other fallback in this module.
    expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_MAX, 10)).toBe(true);
    expect(shouldSuggestDifferentImage(SCAN_FAILURE_STREAK_MAX - 1, 10)).toBe(false);
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

describe('decayedStreak', () => {
  const NOW = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;

  it('keeps a streak whose last failure is recent', () => {
    expect(decayedStreak(3, NOW - HOUR, NOW)).toBe(3);
    expect(decayedStreak(1, NOW - 1_000, NOW)).toBe(1);
    // Kept, but clamped — a live legacy tally of 17 is still a live streak, and
    // the ceiling is what stops it being reported as "after 17 tries".
    expect(decayedStreak(17, NOW, NOW)).toBe(SCAN_FAILURE_STREAK_MAX);
  });

  it('forgets a streak whose last failure is older than the decay window', () => {
    // The reported bug: 14 failures last month plus 3 today rendered
    // "after 17 tries". After decay the run starts again from today.
    expect(decayedStreak(14, NOW - 30 * 24 * HOUR, NOW)).toBe(0);
    expect(decayedStreak(3, NOW - 25 * HOUR, NOW)).toBe(0);
    expect(
      nextFailureStreak(decayedStreak(14, NOW - 30 * 24 * HOUR, NOW), 'extraction-failure'),
    ).toBe(1);
  });

  it('treats exactly the decay window as still live, one millisecond past it as expired', () => {
    expect(decayedStreak(2, NOW - SCAN_STREAK_DECAY_MS, NOW)).toBe(2);
    expect(decayedStreak(2, NOW - SCAN_STREAK_DECAY_MS - 1, NOW)).toBe(0);
  });

  it('defaults to a 24 hour window', () => {
    expect(SCAN_STREAK_DECAY_MS).toBe(24 * HOUR);
    expect(decayedStreak(2, NOW - 23 * HOUR, NOW)).toBe(2);
    expect(decayedStreak(2, NOW - 24 * HOUR - 1, NOW)).toBe(0);
  });

  it('honours an explicit decay window', () => {
    expect(decayedStreak(2, NOW - 2 * HOUR, NOW, HOUR)).toBe(0);
    expect(decayedStreak(2, NOW - 30 * 60_000, NOW, HOUR)).toBe(2);
  });

  it('falls back to the default window for an unusable decayMs', () => {
    // Remote Config returns 0 for an unpublished key; a decay of 0 would expire
    // every streak instantly and a negative one would freeze them forever.
    for (const bad of [0, -1, NaN, Infinity, -Infinity]) {
      expect(decayedStreak(2, NOW - HOUR, NOW, bad)).toBe(2);
      expect(decayedStreak(2, NOW - 25 * HOUR, NOW, bad)).toBe(0);
    }
  });

  it('does NOT reset the streak for a backwards clock', () => {
    // Same posture as evaluateScanRate: only forward-elapsed time decays.
    expect(decayedStreak(3, NOW + 10 * 24 * HOUR, NOW)).toBe(3);
    expect(decayedStreak(3, NOW + 1, NOW)).toBe(3);
  });

  it('expires a streak with no timestamp — a doc written before the field existed', () => {
    // Its age cannot be established, and an unbounded lifetime tally is exactly
    // the bug. Costs at most a few generic messages; the next failure re-arms it.
    expect(decayedStreak(9, undefined, NOW)).toBe(0);
    expect(decayedStreak(9, asStreak(NaN), NOW)).toBe(0);
    expect(decayedStreak(9, asStreak('yesterday'), NOW)).toBe(0);
    expect(decayedStreak(9, asStreak(null), NOW)).toBe(0);
  });

  it('expires rather than throwing on a non-finite now', () => {
    expect(decayedStreak(9, NOW - 1_000, NaN)).toBe(0);
    expect(decayedStreak(9, NOW - 1_000, asStreak(undefined) as number)).toBe(0);
  });

  it('sanitizes the stored streak exactly as nextFailureStreak does', () => {
    expect(decayedStreak(undefined, NOW, NOW)).toBe(0);
    expect(decayedStreak(NaN, NOW, NOW)).toBe(0);
    expect(decayedStreak(-5, NOW, NOW)).toBe(0);
    expect(decayedStreak(2.9, NOW, NOW)).toBe(2);
    expect(decayedStreak(asStreak('3'), NOW, NOW)).toBe(0);
  });

  it('never returns NaN for any malformed input pairing', () => {
    const junk = [undefined, null, NaN, Infinity, -Infinity, '3', {}, [], -1, 2.9];
    for (const streak of junk) {
      for (const last of junk) {
        const result = decayedStreak(asStreak(streak), asStreak(last), NOW);
        expect(Number.isFinite(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('is composable with nextFailureStreak without changing its signature', () => {
    // The two stay separate: decay is a property of the stored value, the
    // outcome is applied on top of it.
    const live = decayedStreak(2, NOW - HOUR, NOW);
    expect(nextFailureStreak(live, 'extraction-failure')).toBe(3);
    expect(nextFailureStreak(live, 'infrastructure-failure')).toBe(2);
    expect(nextFailureStreak(live, 'success')).toBe(0);

    const stale = decayedStreak(2, NOW - 48 * HOUR, NOW);
    expect(nextFailureStreak(stale, 'extraction-failure')).toBe(1);
    expect(nextFailureStreak(stale, 'infrastructure-failure')).toBe(0);
  });
});

describe('SCAN_FAILURE_STREAK_MAX (clamp)', () => {
  it('is a small ceiling that still leaves the guidance reachable', () => {
    // Invariant the clamp depends on: below the cap it would switch the
    // guidance off entirely.
    expect(SCAN_FAILURE_STREAK_MAX).toBeGreaterThanOrEqual(SCAN_FAILURE_STREAK_CAP);
    expect(SCAN_FAILURE_STREAK_MAX).toBeLessThanOrEqual(9);
  });

  it('saturates at the ceiling instead of counting forever', () => {
    // The reported bug: one failed scan a day for 40 days keeps restamping
    // lastFailureAt, so decay never fires and the message read "after 40 tries".
    let streak: number | undefined = undefined;
    for (let i = 0; i < 40; i++) {
      streak = nextFailureStreak(streak, 'extraction-failure');
    }
    expect(streak).toBe(SCAN_FAILURE_STREAK_MAX);
  });

  it('holds the ceiling exactly at the boundary', () => {
    expect(nextFailureStreak(SCAN_FAILURE_STREAK_MAX - 2, 'extraction-failure')).toBe(
      SCAN_FAILURE_STREAK_MAX - 1,
    );
    expect(nextFailureStreak(SCAN_FAILURE_STREAK_MAX - 1, 'extraction-failure')).toBe(
      SCAN_FAILURE_STREAK_MAX,
    );
    expect(nextFailureStreak(SCAN_FAILURE_STREAK_MAX, 'extraction-failure')).toBe(
      SCAN_FAILURE_STREAK_MAX,
    );
  });

  it('repairs a legacy stored tally on READ, so no migration is needed', () => {
    // usage/{userId} docs written before the clamp already hold values like 40.
    expect(nextFailureStreak(40, 'infrastructure-failure')).toBe(SCAN_FAILURE_STREAK_MAX);
    expect(decayedStreak(40, Date.now(), Date.now())).toBe(SCAN_FAILURE_STREAK_MAX);
  });

  it('does NOT change the guidance decision anywhere', () => {
    // The whole safety argument for clamping: shouldSuggestDifferentImage is
    // `>= cap`, so saturating the streak can only change the number shown.
    for (let raw = 0; raw <= 60; raw++) {
      const clamped = nextFailureStreak(raw, 'infrastructure-failure');
      expect(clamped).toBeLessThanOrEqual(SCAN_FAILURE_STREAK_MAX);
      expect(shouldSuggestDifferentImage(clamped)).toBe(raw >= SCAN_FAILURE_STREAK_CAP);
    }
  });

  it('still clears instantly on a success from the ceiling', () => {
    expect(nextFailureStreak(SCAN_FAILURE_STREAK_MAX, 'success')).toBe(0);
    expect(shouldSuggestDifferentImage(0)).toBe(false);
  });
});

describe('classifyThrownScanError', () => {
  /** The shape the Gemini SDK actually throws (GoogleGenerativeAIFetchError). */
  const fetchError = (status: number, statusText = 'Bad Request', detail = '') =>
    Object.assign(
      new Error(
        `[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com: [${status} ${statusText}] ${detail}`,
      ),
      { status, statusText },
    );

  it('treats a 400 that names the image part as evidence about the image', () => {
    // The reachable case: the server validates only the `data:image/` prefix,
    // and useImagePicker builds the URI from whatever format the picker returns
    // (image/bmp, image/tiff on the web path). Gemini answers 400
    // INVALID_ARGUMENT naming the offending field, and this used to be
    // classified as infrastructure — so the user burned a rate-limit slot per
    // attempt, the streak never advanced, and the guidance could never fire.
    expect(
      classifyThrownScanError(
        fetchError(400, 'Bad Request', "Invalid value at 'contents[0].parts[0].inline_data.mime_type'"),
      ),
    ).toBe('extraction-failure');
    expect(
      classifyThrownScanError(fetchError(400, 'Bad Request', 'Unsupported MIME type: image/bmp')),
    ).toBe('extraction-failure');
    expect(
      classifyThrownScanError(fetchError(400, 'Bad Request', 'Base64 decoding failed.')),
    ).toBe('extraction-failure');
  });

  it('treats a rejected request BODY as evidence about the image, whatever it says', () => {
    // The body IS the image, so the message does not need to say so.
    expect(classifyThrownScanError(fetchError(413, 'Payload Too Large', 'too big'))).toBe(
      'extraction-failure',
    );
    expect(classifyThrownScanError(fetchError(415, 'Unsupported Media Type', ''))).toBe(
      'extraction-failure',
    );
    expect(classifyThrownScanError(fetchError(422, 'Unprocessable Entity', ''))).toBe(
      'extraction-failure',
    );
  });

  it('does NOT blame the photo for a 400 that is really OUR broken config', () => {
    // The regression that matters most. Gemini returns 400 — not 401/403 — for
    // API_KEY_INVALID and for an unsupported user location. Both fail EVERY
    // user's scan at once, so a blanket 4xx->extraction rule would march the
    // whole user base to "we couldn't read that receipt after 3 tries. Try a
    // clearer photo" during an outage they can do nothing about.
    expect(
      classifyThrownScanError(
        fetchError(400, 'Bad Request', 'API key not valid. Please pass a valid API key.'),
      ),
    ).toBe('infrastructure-failure');
    expect(
      classifyThrownScanError(
        fetchError(400, 'Bad Request', 'User location is not supported for the API use.'),
      ),
    ).toBe('infrastructure-failure');
    expect(
      classifyThrownScanError(fetchError(400, 'Bad Request', 'Request contains an invalid argument.')),
    ).toBe('infrastructure-failure');
  });

  it('never lets a config outage drive the whole user base to the photo guidance', () => {
    // End to end: a bad GEMINI_API_KEY secret version, three attempts.
    const badKey = fetchError(400, 'Bad Request', 'API key not valid. Please pass a valid API key.');
    let streak: number | undefined = undefined;
    for (let i = 0; i < 6; i++) {
      streak = nextFailureStreak(streak, classifyThrownScanError(badKey));
    }
    expect(streak).toBe(0);
    expect(shouldSuggestDifferentImage(streak)).toBe(false);
  });

  it('keeps 5xx and Google-side quota as infrastructure', () => {
    expect(classifyThrownScanError(fetchError(500, 'Internal Server Error'))).toBe(
      'infrastructure-failure',
    );
    expect(classifyThrownScanError(fetchError(503, 'Service Unavailable'))).toBe(
      'infrastructure-failure',
    );
    expect(classifyThrownScanError(fetchError(429, 'Too Many Requests'))).toBe(
      'infrastructure-failure',
    );
  });

  it('keeps OUR broken credentials and config as infrastructure', () => {
    for (const status of [401, 403, 404, 408]) {
      expect(classifyThrownScanError(fetchError(status))).toBe('infrastructure-failure');
    }
  });

  it('keeps network errors, timeouts and aborts as infrastructure', () => {
    expect(classifyThrownScanError(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }))).toBe(
      'infrastructure-failure',
    );
    expect(classifyThrownScanError(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }))).toBe(
      'infrastructure-failure',
    );
    expect(
      classifyThrownScanError(Object.assign(new Error('Request aborted'), { name: 'AbortError' })),
    ).toBe('infrastructure-failure');
    expect(classifyThrownScanError(new Error('Error fetching from https://...: fetch failed'))).toBe(
      'infrastructure-failure',
    );
  });

  it('reads the status from the alternative shapes an SDK might use', () => {
    const imagePart = "Invalid value at 'contents[0].parts[0].inline_data'";
    expect(classifyThrownScanError({ statusCode: 400, message: imagePart })).toBe(
      'extraction-failure',
    );
    expect(classifyThrownScanError({ response: { status: 400 }, message: imagePart })).toBe(
      'extraction-failure',
    );
    expect(classifyThrownScanError({ status: '400', message: imagePart })).toBe(
      'extraction-failure',
    );
    expect(classifyThrownScanError({ statusCode: 413 })).toBe('extraction-failure');
    expect(classifyThrownScanError({ response: { status: 503 } })).toBe('infrastructure-failure');
  });

  it('falls back to the status the SDK bakes into its own message', () => {
    // Same message, no status property at all.
    expect(
      classifyThrownScanError(
        new Error(
          "Error fetching from https://x: [400 Bad Request] Invalid value at 'parts[0].inline_data'",
        ),
      ),
    ).toBe('extraction-failure');
    expect(
      classifyThrownScanError(new Error('Error fetching from https://x: [503 Unavailable]')),
    ).toBe('infrastructure-failure');
  });

  it('defaults to infrastructure when nothing readable is there', () => {
    // It must never INVENT evidence about the user's photo.
    for (const junk of [undefined, null, 'boom', 42, {}, [], new Error('Unknown error')]) {
      expect(classifyThrownScanError(junk)).toBe('infrastructure-failure');
    }
  });

  it('ignores non-HTTP codes rather than reading them as statuses', () => {
    // gRPC/Firestore style codes must not be mistaken for 4xx.
    expect(classifyThrownScanError({ code: 'permission-denied' })).toBe('infrastructure-failure');
    expect(classifyThrownScanError({ code: 7 })).toBe('infrastructure-failure');
    expect(classifyThrownScanError({ status: 200 })).toBe('infrastructure-failure');
  });

  it('does not read an array index in a validation message as a status', () => {
    // No "[NNN Status]" prefix, but an index that falls in the payload-rejected
    // range. An unanchored /\[(\d{3})[ \]]/ reads "parts[422]" as a 422 and
    // advances the streak off a number that is not a status at all; the
    // anchored form finds nothing and correctly stays infrastructure.
    expect(
      classifyThrownScanError(new Error("Invalid value at 'contents[0].parts[422]'")),
    ).toBe('infrastructure-failure');
    // And with a real prefix present, the prefix still wins.
    expect(
      classifyThrownScanError(
        new Error(
          "Error fetching from https://x: [400 Bad Request] Invalid value at 'contents[0].parts[404].inline_data'",
        ),
      ),
    ).toBe('extraction-failure');
  });

  it('never throws, even when the error object fights back', () => {
    const hostile = {
      get status(): number {
        throw new Error('getter exploded');
      },
    };
    expect(() => classifyThrownScanError(hostile)).not.toThrow();
    expect(classifyThrownScanError(hostile)).toBe('infrastructure-failure');
  });
});
