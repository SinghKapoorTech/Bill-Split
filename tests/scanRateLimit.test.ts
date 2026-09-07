import { describe, it, expect } from 'vitest';
import {
  describeDuration,
  describeWindow,
  evaluateScanRate,
  SCAN_RATE_LIMIT,
  SCAN_RATE_WINDOW_MS,
  type ScanRateState,
} from '@shared/scanRateLimit';

const T0 = 1_700_000_000_000;

/** Cast helper for the malformed states a real usage/{userId} doc can produce. */
const asState = (value: unknown) => value as ScanRateState;

describe('evaluateScanRate', () => {
  it('allows the first scan and opens a window', () => {
    const d = evaluateScanRate(null, T0);
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0, count: 1 });
    expect(d.retryAfterMs).toBe(0);
  });

  it('increments within an open window without moving the window start', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: 3 }, T0 + 60_000);
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0, count: 4 });
  });

  it('blocks once the limit is reached', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 + 60_000);
    expect(d.allowed).toBe(false);
    expect(d.next).toEqual({ windowStartMs: T0, count: SCAN_RATE_LIMIT });
  });

  it('does not increment the counter when blocked', () => {
    // A blocked caller hammering the endpoint must not extend their own lockout.
    const state = { windowStartMs: T0, count: SCAN_RATE_LIMIT };
    const first = evaluateScanRate(state, T0 + 1_000);
    const second = evaluateScanRate(first.next, T0 + 2_000);
    expect(second.next.count).toBe(SCAN_RATE_LIMIT);
  });

  it('reports how long until the window reopens', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 + 60_000);
    expect(d.retryAfterMs).toBe(SCAN_RATE_WINDOW_MS - 60_000);
  });

  it('opens a fresh window once the old one expires', () => {
    const d = evaluateScanRate(
      { windowStartMs: T0, count: SCAN_RATE_LIMIT },
      T0 + SCAN_RATE_WINDOW_MS,
    );
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0 + SCAN_RATE_WINDOW_MS, count: 1 });
  });

  it('does not reopen the window when the clock goes backwards', () => {
    // nowMs < windowStartMs would make the elapsed check negative. It must not
    // read as "window still open with room", nor grant unlimited scans.
    const d = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 - 5_000);
    expect(d.allowed).toBe(false);
  });

  it('honours an explicitly supplied limit and window', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: 2 }, T0 + 10, 2, 1_000);
    expect(d.allowed).toBe(false);
  });
});

describe('evaluateScanRate — untrusted persisted state', () => {
  // A usage/{userId} doc written before these fields existed reads as `{}`.
  // The limiter must treat that as "no window open yet": one scan allowed, and
  // a persistable window written back — never a bypass, never a lockout.
  const malformed: Array<[string, unknown]> = [
    ['an empty object (doc predating these fields)', {}],
    ['undefined', undefined],
    ['null', null],
    ['a NaN windowStartMs', { windowStartMs: NaN, count: 5 }],
    ['a NaN count', { windowStartMs: T0, count: NaN }],
    ['a missing count', { windowStartMs: T0 }],
    ['a missing windowStartMs', { count: 5 }],
    ['a string windowStartMs', { windowStartMs: String(T0), count: 5 }],
    ['a null count', { windowStartMs: T0, count: null }],
    ['an Infinity windowStartMs', { windowStartMs: Infinity, count: 5 }],
    ['a negative count', { windowStartMs: T0, count: -1_000_000 }],
  ];

  it.each(malformed)('opens a fresh window for %s', (_label, value) => {
    const d = evaluateScanRate(asState(value), T0);
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0, count: 1 });
    expect(d.retryAfterMs).toBe(0);
  });

  it.each(malformed)('never writes back a non-persistable state for %s', (_label, value) => {
    // `next` is written straight back to usage/{userId}. An unvalidated
    // passthrough throws on the write — Timestamp.fromMillis(NaN) for a NaN
    // windowStartMs, or Firestore's `undefined` rejection for a missing one —
    // so the counter would never advance at all.
    const d = evaluateScanRate(asState(value), T0);
    expect(Number.isFinite(d.next.windowStartMs)).toBe(true);
    expect(Number.isFinite(d.next.count)).toBe(true);
    expect(Number.isFinite(d.retryAfterMs)).toBe(true);
  });

  it('does not grant unlimited scans from a malformed state', () => {
    // The recovered window is real: replaying from `next` still hits the limit.
    let state = evaluateScanRate(asState({}), T0).next;
    for (let i = 1; i < SCAN_RATE_LIMIT; i++) {
      const d = evaluateScanRate(state, T0 + i);
      expect(d.allowed).toBe(true);
      state = d.next;
    }
    expect(state.count).toBe(SCAN_RATE_LIMIT);
    expect(evaluateScanRate(state, T0 + SCAN_RATE_LIMIT).allowed).toBe(false);
  });

  it('does not lock a user out permanently after a NaN windowStartMs', () => {
    // Before the fix, elapsed stayed NaN forever: the window never expired and
    // retryAfterMs was NaN.
    const d = evaluateScanRate(asState({ windowStartMs: NaN, count: NaN }), T0);
    expect(d.allowed).toBe(true);
    expect(Number.isNaN(d.retryAfterMs)).toBe(false);

    const later = evaluateScanRate(d.next, T0 + SCAN_RATE_WINDOW_MS);
    expect(later.allowed).toBe(true);
    expect(later.next).toEqual({ windowStartMs: T0 + SCAN_RATE_WINDOW_MS, count: 1 });
  });
});

describe('evaluateScanRate — invalid config falls back to the defaults', () => {
  // Remote Config getNumber() returns 0 for an unpublished or mistyped key.
  const badLimits: Array<[string, number]> = [
    ['0 (an unpublished Remote Config key)', 0],
    ['-1', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['0.5 (below one whole scan)', 0.5],
  ];

  it.each(badLimits)('ignores a limit of %s and keeps the default limit', (_label, limit) => {
    // Blocked at the default limit rather than allowed by a broken one.
    const atLimit = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 + 1, limit);
    expect(atLimit.allowed).toBe(false);
    expect(atLimit.usedConfigFallback).toBe(true);

    // And not blocked below it — the fallback must not tighten either.
    const belowLimit = evaluateScanRate(
      { windowStartMs: T0, count: SCAN_RATE_LIMIT - 1 },
      T0 + 1,
      limit,
    );
    expect(belowLimit.allowed).toBe(true);
  });

  it('enforces the default limit across a window rollover when the limit is 0', () => {
    // The old fresh-window paths returned `allowed: true` unconditionally, so a
    // limit of 0 granted exactly one scan per window forever and never blocked.
    // The fallback must yield a real 30-scan window, not a 1-scan trickle and
    // not an unlimited one — so the first scan IS allowed here, by design.
    let state = evaluateScanRate(null, T0, 0).next;
    for (let i = 1; i < SCAN_RATE_LIMIT; i++) {
      const d = evaluateScanRate(state, T0 + i, 0);
      expect(d.allowed).toBe(true);
      state = d.next;
    }
    expect(evaluateScanRate(state, T0 + SCAN_RATE_LIMIT, 0).allowed).toBe(false);
  });

  it('floors a fractional limit instead of granting the extra scan', () => {
    // 1.5 must mean 1, not 2 — otherwise rejecting 0.5 as "below one whole
    // scan" while accepting 1.5 as "1.5 scans" is incoherent.
    const d = evaluateScanRate({ windowStartMs: T0, count: 1 }, T0 + 1, 1.5);
    expect(d.allowed).toBe(false);
    expect(d.usedConfigFallback).toBeUndefined();
  });

  it('clamps retryAfterMs to one window for a windowStartMs in the future', () => {
    // Blocking is correct here (same branch as a backwards clock), but the raw
    // arithmetic would hand a client a Retry-After of centuries.
    const d = evaluateScanRate(
      { windowStartMs: T0 + 1e15, count: SCAN_RATE_LIMIT },
      T0,
      SCAN_RATE_LIMIT,
      SCAN_RATE_WINDOW_MS,
    );
    expect(d.allowed).toBe(false);
    expect(d.retryAfterMs).toBe(SCAN_RATE_WINDOW_MS);
  });

  const badWindows: Array<[string, number]> = [
    ['0', 0],
    ['-1', -1],
    ['NaN', NaN],
    ['Infinity', Infinity],
  ];

  it.each(badWindows)('ignores a window of %s and keeps the default window', (_label, windowMs) => {
    // With windowMs <= 0, `elapsed >= windowMs` was true on every call, so every
    // request opened a fresh window and the limiter was silently off.
    const d = evaluateScanRate(
      { windowStartMs: T0, count: SCAN_RATE_LIMIT },
      T0 + 1,
      SCAN_RATE_LIMIT,
      windowMs,
    );
    expect(d.allowed).toBe(false);
    expect(d.usedConfigFallback).toBe(true);
    expect(d.retryAfterMs).toBe(SCAN_RATE_WINDOW_MS - 1);
  });

  it('still expires the window at the default length when the window config is invalid', () => {
    const d = evaluateScanRate(
      { windowStartMs: T0, count: SCAN_RATE_LIMIT },
      T0 + SCAN_RATE_WINDOW_MS,
      SCAN_RATE_LIMIT,
      0,
    );
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0 + SCAN_RATE_WINDOW_MS, count: 1 });
  });

  it('never throws on invalid config', () => {
    expect(() => evaluateScanRate(null, T0, NaN, NaN)).not.toThrow();
    expect(() => evaluateScanRate(asState({}), T0, -1, -1)).not.toThrow();
  });

  it('sets usedConfigFallback exactly when a parameter was rejected', () => {
    const state = { windowStartMs: T0, count: 1 };

    // Both valid — flag absent, on both the allowed and the blocked path.
    expect(evaluateScanRate(state, T0 + 1).usedConfigFallback).toBeUndefined();
    expect(evaluateScanRate(state, T0 + 1, 5, 1_000).usedConfigFallback).toBeUndefined();
    expect(
      evaluateScanRate({ windowStartMs: T0, count: 5 }, T0 + 1, 5, 1_000).usedConfigFallback,
    ).toBeUndefined();
    // Defaulted arguments are valid config, not a fallback.
    expect(evaluateScanRate(null, T0).usedConfigFallback).toBeUndefined();
    // A limit of exactly 1 and a sub-millisecond window are valid.
    expect(evaluateScanRate(state, T0 + 1, 1, 0.5).usedConfigFallback).toBeUndefined();

    // Either parameter rejected — flag set.
    expect(evaluateScanRate(state, T0 + 1, 0).usedConfigFallback).toBe(true);
    expect(evaluateScanRate(state, T0 + 1, SCAN_RATE_LIMIT, 0).usedConfigFallback).toBe(true);
    expect(evaluateScanRate(state, T0 + 1, NaN, NaN).usedConfigFallback).toBe(true);
    // Set on the fresh-window path too, not just the in-window one.
    expect(evaluateScanRate(null, T0, 0, 0).usedConfigFallback).toBe(true);
  });
});

describe('evaluateScanRate — parameter type', () => {
  it('accepts undefined as well as null for the persisted state', () => {
    // snap.data()?.x yields `undefined` under strict, never `null`.
    expect(evaluateScanRate(undefined, T0).allowed).toBe(true);
    expect(evaluateScanRate(undefined, T0).next).toEqual({ windowStartMs: T0, count: 1 });
  });
});

describe('evaluateScanRate — effective config is surfaced to the caller', () => {
  // Finding 3: the caller built "up to 30 receipts per hour" from the module
  // constants while the decision was made against something else entirely. The
  // decision now carries the numbers it actually used, so the sentence and the
  // enforcement cannot drift apart.
  it('reports the defaults when no config is supplied', () => {
    const d = evaluateScanRate(null, T0);
    expect(d.effectiveLimit).toBe(SCAN_RATE_LIMIT);
    expect(d.effectiveWindowMs).toBe(SCAN_RATE_WINDOW_MS);
  });

  it('reports supplied config on both the allowed and the blocked path', () => {
    const allowed = evaluateScanRate(null, T0, 10, 15 * 60_000);
    expect(allowed.allowed).toBe(true);
    expect(allowed.effectiveLimit).toBe(10);
    expect(allowed.effectiveWindowMs).toBe(15 * 60_000);

    const blocked = evaluateScanRate({ windowStartMs: T0, count: 10 }, T0 + 1, 10, 15 * 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.effectiveLimit).toBe(10);
    expect(blocked.effectiveWindowMs).toBe(15 * 60_000);
  });

  it('reports the FLOORED limit, matching what is enforced', () => {
    // A message promising 1.5 scans would be nonsense, and one promising 2
    // would be a lie — the in-window check blocks at 1.
    const d = evaluateScanRate({ windowStartMs: T0, count: 1 }, T0 + 1, 1.5);
    expect(d.allowed).toBe(false);
    expect(d.effectiveLimit).toBe(1);
  });

  it('reports the FALLBACK values when config was rejected, not the bad input', () => {
    // Otherwise a broken config would produce "up to 0 receipts per 0 minutes"
    // while the limiter enforced 30 per hour.
    const d = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 + 1, 0, -1);
    expect(d.usedConfigFallback).toBe(true);
    expect(d.effectiveLimit).toBe(SCAN_RATE_LIMIT);
    expect(d.effectiveWindowMs).toBe(SCAN_RATE_WINDOW_MS);
  });

  it('keeps retryAfterMs consistent with the reported window', () => {
    const windowMs = 15 * 60_000;
    const d = evaluateScanRate({ windowStartMs: T0, count: 10 }, T0, 10, windowMs);
    expect(d.retryAfterMs).toBe(d.effectiveWindowMs);
    expect(d.effectiveWindowMs).toBe(windowMs);
  });
});

describe('describeWindow', () => {
  it('describes the default one-hour window without a number', () => {
    expect(describeWindow(SCAN_RATE_WINDOW_MS)).toBe('hour');
    expect(describeWindow(60 * 60 * 1000)).toBe('hour');
  });

  it('describes sub-hour windows in minutes', () => {
    expect(describeWindow(15 * 60_000)).toBe('15 minutes');
    expect(describeWindow(30 * 60_000)).toBe('30 minutes');
  });

  it('describes a one-minute window without a number', () => {
    expect(describeWindow(60_000)).toBe('minute');
  });

  it('describes 90 minutes in minutes, not a lossy "2 hours"', () => {
    expect(describeWindow(90 * 60_000)).toBe('90 minutes');
  });

  it('describes multi-hour windows in hours', () => {
    expect(describeWindow(2 * 60 * 60 * 1000)).toBe('2 hours');
    expect(describeWindow(24 * 60 * 60 * 1000)).toBe('24 hours');
  });

  it('describes sub-minute windows in seconds', () => {
    expect(describeWindow(30_000)).toBe('30 seconds');
    expect(describeWindow(1_000)).toBe('second');
  });

  it('never contradicts the "try again in N minutes" half of the sentence', () => {
    // 59_999ms rounds to 60 seconds but `Math.ceil(59_999 / 60_000)` is 1
    // minute, so describing it in seconds would make the two halves of the
    // message disagree — the exact failure this helper was added to prevent.
    expect(describeWindow(59_999)).toBe('minute');
    expect(describeWindow(59_500)).toBe('minute');
    // Still genuinely sub-minute values keep their seconds.
    expect(describeWindow(45_000)).toBe('45 seconds');
  });

  it('never emits NaN or a negative count to a user', () => {
    // Same broken-Remote-Config shapes evaluateScanRate guards against; these
    // reach describeWindow only via effectiveWindowMs, but the helper is public.
    for (const bad of [NaN, Infinity, -Infinity, 0, -1, -60_000]) {
      const text = describeWindow(bad);
      expect(text).toBe('hour');
      expect(text).not.toMatch(/NaN|-|Infinity/);
    }
    // A sub-second window still reads as a whole unit rather than "0 seconds".
    expect(describeWindow(1)).toBe('second');
  });

  it('reads correctly as the tail of the user-facing sentence', () => {
    const sentence = (limit: number, windowMs: number) =>
      `You can scan up to ${limit} receipts per ${describeWindow(windowMs)}.`;
    expect(sentence(30, 60 * 60 * 1000)).toBe('You can scan up to 30 receipts per hour.');
    expect(sentence(10, 15 * 60_000)).toBe('You can scan up to 10 receipts per 15 minutes.');
    expect(sentence(5, 2 * 60 * 60 * 1000)).toBe('You can scan up to 5 receipts per 2 hours.');
  });
});

describe('describeDuration', () => {
  /** Parses either renderer's output back to milliseconds, for the properties below. */
  const toMs = (text: string): number => {
    const [countPart, unitPart] = text.split(' ');
    const unit = unitPart ?? countPart; // describeWindow drops the count at 1
    const count = unitPart ? Number(countPart) : 1;
    expect(Number.isFinite(count)).toBe(true);
    const scale = unit.startsWith('second')
      ? 1_000
      : unit.startsWith('minute')
        ? 60_000
        : 3_600_000;
    return count * scale;
  };

  it('describes sub-minute waits in seconds, not a rounded-up minute', () => {
    // The bug this replaces: the hint was `Math.ceil(ms / 60_000)` minutes, so
    // every wait under a minute read "1 minute". Next to a 30-second window
    // that told the user to wait twice the whole window.
    expect(describeDuration(30_000)).toBe('30 seconds');
    expect(describeDuration(1_000)).toBe('1 second');
    expect(describeDuration(45_000)).toBe('45 seconds');
    expect(describeDuration(59_000)).toBe('59 seconds');
  });

  it('rounds to nearest — the same rule describeWindow uses', () => {
    // Deliberately NOT ceil. Rounding the hint up while the window rounds to
    // nearest is what lets the hint out-scale the window it sits beside; see
    // the sentence-coherence test at the end of this block.
    expect(describeDuration(1)).toBe('1 second');
    expect(describeDuration(1_001)).toBe('1 second');
    expect(describeDuration(1_500)).toBe('2 seconds');
    expect(describeDuration(30_500)).toBe('31 seconds');
  });

  it('switches to minutes at exactly 60 seconds', () => {
    expect(describeDuration(59_999)).toBe('1 minute');
    expect(describeDuration(60_000)).toBe('1 minute');
    expect(describeDuration(60_001)).toBe('1 minute');
    expect(describeDuration(90_001)).toBe('2 minutes');
  });

  it('describes 90 seconds as a rounded-up 2 minutes', () => {
    expect(describeDuration(90_000)).toBe('2 minutes');
  });

  it('describes multi-minute waits in minutes', () => {
    expect(describeDuration(15 * 60_000)).toBe('15 minutes');
    expect(describeDuration(59 * 60_000)).toBe('59 minutes');
  });

  it('describes exact hours in hours', () => {
    expect(describeDuration(60 * 60_000)).toBe('1 hour');
    expect(describeDuration(2 * 60 * 60 * 1000)).toBe('2 hours');
    expect(describeDuration(24 * 60 * 60 * 1000)).toBe('24 hours');
  });

  it('keeps inexact multi-hour waits in minutes rather than over-stating hours', () => {
    // 90 minutes as "2 hours" would tell the user to wait 30 minutes too long.
    expect(describeDuration(90 * 60_000)).toBe('90 minutes');
    expect(describeDuration(60 * 60_000 + 1)).toBe('60 minutes');
  });

  it('always keeps the count, unlike describeWindow', () => {
    // "Try again in minute" is not a sentence; "per minute" is.
    expect(describeDuration(60_000)).toBe('1 minute');
    expect(describeWindow(60_000)).toBe('minute');
  });

  it('never emits NaN, zero, or a negative wait to a user', () => {
    for (const bad of [NaN, Infinity, -Infinity, 0, -1, -60_000]) {
      const text = describeDuration(bad);
      expect(text).toBe('1 second');
      expect(text).not.toMatch(/NaN|-|Infinity/);
    }
  });

  it('renders the blocked sentence coherently for the reported 30-second window', () => {
    // The reported case: with a 30s window the old minutes-only hint said
    // "Try again in 1 minute" — twice the window it sat next to.
    const windowMs = 30_000;
    const d = evaluateScanRate({ windowStartMs: T0, count: 30 }, T0 + 1_000, 30, windowMs);
    expect(d.allowed).toBe(false);
    const sentence = `You can scan up to ${d.effectiveLimit} receipts per ${describeWindow(
      d.effectiveWindowMs,
    )}. Try again in ${describeDuration(d.retryAfterMs)}.`;
    expect(sentence).toBe('You can scan up to 30 receipts per 30 seconds. Try again in 29 seconds.');
    expect(sentence).not.toMatch(/minute/);
  });

  it('NEVER tells the user to wait longer than the window they were just quoted', () => {
    // The property, not one example of it. evaluateScanRate clamps retryAfterMs
    // to at most one window, so the rendered hint must never exceed the rendered
    // window for ANY window Remote Config could supply. A hint rounded UP while
    // the window rounds to nearest breaks this for roughly half of all whole
    // second windows — e.g. windowMs 61_000 would read
    // "per minute. Try again in 2 minutes."
    for (let windowMs = 1_000; windowMs <= 2 * 60 * 60 * 1000; windowMs += 1_000) {
      const windowText = describeWindow(windowMs);
      const windowValue = toMs(windowText);
      for (const retryAfterMs of [windowMs, windowMs - 1, Math.ceil(windowMs / 2), 1]) {
        const hintValue = toMs(describeDuration(retryAfterMs));
        expect(
          hintValue,
          `windowMs=${windowMs} ("${windowText}") retryAfterMs=${retryAfterMs} ("${describeDuration(retryAfterMs)}")`,
        ).toBeLessThanOrEqual(windowValue);
      }
    }
  });

  it('never under-promises by more than half a unit', () => {
    // The cost of rounding to nearest instead of up: the hint can be short, but
    // only ever by half a unit, and the rejection that follows carries a fresh,
    // smaller hint. Rounding up instead would cost sentence coherence — a far
    // worse trade, since the user is quoted the window in the same breath.
    expect(describeDuration(89_000)).toBe('1 minute');
    for (let ms = 1_000; ms <= 2 * 60 * 60 * 1000; ms += 1_000) {
      expect(ms - toMs(describeDuration(ms)), `ms=${ms}`).toBeLessThanOrEqual(30_000);
    }
  });
});
