import { describe, it, expect } from 'vitest';
import {
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
