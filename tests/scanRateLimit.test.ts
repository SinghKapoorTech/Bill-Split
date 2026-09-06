import { describe, it, expect } from 'vitest';
import { evaluateScanRate, SCAN_RATE_LIMIT, SCAN_RATE_WINDOW_MS } from '@shared/scanRateLimit';

const T0 = 1_700_000_000_000;

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

  it('treats a clock that went backwards as a fresh window rather than a free pass', () => {
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
