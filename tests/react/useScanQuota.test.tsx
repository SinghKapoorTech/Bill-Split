/**
 * `useScanQuota` — the live read of `usage/{uid}`, evaluated with the same pure
 * function the server enforces with.
 *
 * `usage/{uid}` is SHARED with the hourly rate limiter in disjoint fields. This
 * hook must read only `scanPeriodStart` / `scansThisPeriod` and must not be
 * confused by the limiter's fields sitting beside them.
 *
 * The period is a UTC calendar month. A stored period that is not the current
 * one has rolled, and the count restarts — including a period in the FUTURE,
 * which can only come from a bad write and must not freeze the counter.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  doc: vi.fn(() => ({})),
  unsubscribe: vi.fn(),
  user: { uid: 'u1' } as { uid: string } | null | undefined,
  config: {
    paywallEnabled: true,
    freeScansPerMonth: 2,
    freeActiveGroups: 2,
    loading: false,
  },
}));

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: h.doc, onSnapshot: h.onSnapshot }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/hooks/useMonetizationConfig', () => ({
  useMonetizationConfig: () => h.config,
}));

import { useScanQuota } from '@/hooks/useScanQuota';

const ts = (ms: number) => ({ toMillis: () => ms });

const SEP = Date.UTC(2026, 8, 1);
const SEP_MID = Date.UTC(2026, 8, 15, 12);
const OCT = Date.UTC(2026, 9, 1);
const AUG = Date.UTC(2026, 7, 1);

let emit: (snap: unknown) => void = () => {};
let fail: (e: Error) => void = () => {};

function Probe() {
  const { used, remaining, limit, resetsAtMs, loading } = useScanQuota();
  return (
    <div>
      <span data-testid="used">{used}</span>
      <span data-testid="remaining">{remaining}</span>
      <span data-testid="limit">{limit}</span>
      <span data-testid="resets">{resetsAtMs}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
}

const read = (id: string) => screen.getByTestId(id).textContent;

async function push(data: Record<string, unknown> | null) {
  await act(async () => {
    emit({ exists: () => data !== null, data: () => data });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(SEP_MID);
  h.user = { uid: 'u1' };
  h.config = { paywallEnabled: true, freeScansPerMonth: 2, freeActiveGroups: 2, loading: false };
  h.onSnapshot.mockImplementation((_ref: unknown, next: unknown, err: unknown) => {
    emit = next as (s: unknown) => void;
    fail = err as (e: Error) => void;
    return h.unsubscribe;
  });
});

describe('useScanQuota — counting', () => {
  it('reports a full allowance when the document is absent', async () => {
    render(<Probe />);
    await push(null);
    expect(read('used')).toBe('0');
    expect(read('remaining')).toBe('2');
    expect(read('limit')).toBe('2');
    expect(read('loading')).toBe('false');
  });

  it('counts scans inside the current period', async () => {
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 1 });
    expect(read('used')).toBe('1');
    expect(read('remaining')).toBe('1');
  });

  it('reports zero remaining at the cap', async () => {
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 2 });
    expect(read('used')).toBe('2');
    expect(read('remaining')).toBe('0');
  });

  it('rolls a LAST-MONTH period back to a full allowance', async () => {
    render(<Probe />);
    await push({ scanPeriodStart: ts(AUG), scansThisPeriod: 2 });
    expect(read('used')).toBe('0');
    expect(read('remaining')).toBe('2');
  });

  it('rolls a FUTURE period too, so a bad write cannot freeze the counter', async () => {
    render(<Probe />);
    await push({ scanPeriodStart: ts(OCT), scansThisPeriod: 2 });
    expect(read('used')).toBe('0');
    expect(read('remaining')).toBe('2');
  });

  it('reports the next UTC month boundary as the reset instant', async () => {
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 1 });
    expect(read('resets')).toBe(String(OCT));
  });

  it('never reports a negative remainder when a stored count exceeds the cap', async () => {
    // Remote Config tightened the limit under a user mid-period — exactly what
    // the 5 -> 2 change did.
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 7 });
    expect(read('used')).toBe('7');
    expect(read('remaining')).toBe('0');
  });
});

describe('useScanQuota — the limit comes from Remote Config', () => {
  it('uses the configured limit, not a hardcoded 2', async () => {
    h.config = { ...h.config, freeScansPerMonth: 5 };
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 1 });
    expect(read('limit')).toBe('5');
    expect(read('remaining')).toBe('4');
  });
});

describe('useScanQuota — shares a document with the hourly limiter', () => {
  it('ignores the rate limiter fields sitting beside the quota ones', async () => {
    render(<Probe />);
    await push({
      scanPeriodStart: ts(SEP),
      scansThisPeriod: 1,
      // The hourly limiter's disjoint fields.
      scanWindowStart: ts(SEP_MID),
      scansThisWindow: 29,
    });
    expect(read('used')).toBe('1');
    expect(read('remaining')).toBe('1');
  });

  // Generous on unusable data: the worst case is a few extra scans, whereas
  // failing closed denies the product over a bookkeeping glitch.
  //
  // `it.each`, not a loop with a manual `document.body.innerHTML = ''`. That
  // pattern left N components mounted with N live listeners while the
  // module-level `emit` pointed only at the newest, so every earlier iteration
  // was a dead subscription no assertion could reach.
  it.each([
    [{ scanPeriodStart: 'nope', scansThisPeriod: 2 }],
    [{ scanPeriodStart: ts(SEP), scansThisPeriod: 'two' }],
    [{ scanPeriodStart: ts(NaN), scansThisPeriod: 2 }],
    [{ scanPeriodStart: ts(SEP), scansThisPeriod: -3 }],
    [{ scansThisPeriod: 2 }],
    [{}],
  ])('treats a malformed quota pair as a fresh period (%o)', async (data) => {
    render(<Probe />);
    await push(data as Record<string, unknown>);
    expect(read('remaining')).toBe('2');
  });
});

describe('useScanQuota — loading and lifecycle', () => {
  it('reports loading BEFORE the first snapshot, for a signed-in user', () => {
    // The gap that let two mutations through together: with the initializer
    // inert AND setSnapshotLoading(true) deleted, the hook reported
    // `loading:false, remaining:limit` for the whole window between mount and
    // the first snapshot — a "2 scans left" chip shown to a user who has none.
    // Nothing asserted this; the existing both-must-settle test got its `true`
    // from the config mock only.
    h.config = { ...h.config, loading: false };
    render(<Probe />);
    expect(read('loading')).toBe('true');
  });

  it('CLEARS a previous count when the listener later errors', async () => {
    // The error test below fires from the initial state, where the reset is a
    // no-op — deleting `setState(null)` from the error handler left 16/16 green.
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 2 });
    expect(read('remaining')).toBe('0');

    await act(async () => {
      fail(new Error('permission-denied'));
    });
    expect(read('remaining')).toBe('2');
  });

  it('clears the previous account\'s count when the user signs out', async () => {
    // Account switch on a shared device. No test transitioned a MOUNTED hook,
    // so deleting these resets survived mutation.
    const { rerender } = render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 2 });
    expect(read('remaining')).toBe('0');

    h.user = null;
    await act(async () => {
      rerender(<Probe />);
    });
    expect(read('remaining')).toBe('2');
    expect(read('loading')).toBe('false');
  });

  it('re-evaluates when the UTC month rolls, without a new snapshot', async () => {
    // The wall must not outlive its own expiry. Nothing re-renders at a month
    // boundary on its own: the usage doc is unchanged so no snapshot fires, and
    // useMonetizationConfig's poll returns an equal config that React bails out
    // of. A user in UTC-7 at 17:02 on Sep 30 is already past the boundary; the
    // server serves their scan while the uploader still shows the wall.
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 8, 30, 23, 59, 50));
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 2 });
    expect(read('remaining')).toBe('0');

    await act(async () => {
      vi.advanceTimersByTime(20 * 1000);
    });

    expect(read('remaining')).toBe('2');
    expect(read('used')).toBe('0');
    vi.useRealTimers();
  });

  it('is loading until BOTH the config and the snapshot have settled', async () => {
    h.config = { ...h.config, loading: true };
    render(<Probe />);
    expect(read('loading')).toBe('true');

    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 1 });
    // Snapshot in, config still resolving — the limit is not yet trustworthy,
    // so a wall drawn now could name the wrong number.
    expect(read('loading')).toBe('true');
  });

  it('settles once both are in', async () => {
    render(<Probe />);
    await push({ scanPeriodStart: ts(SEP), scansThisPeriod: 1 });
    expect(read('loading')).toBe('false');
  });

  it('stays loading while auth is unresolved', () => {
    h.user = undefined;
    render(<Probe />);
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(read('loading')).toBe('true');
  });

  it('settles to a full allowance when signed out', () => {
    h.user = null;
    render(<Probe />);
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(read('remaining')).toBe('2');
    expect(read('loading')).toBe('false');
  });

  it('degrades to a full allowance when the listener errors', async () => {
    render(<Probe />);
    await act(async () => {
      fail(new Error('permission-denied'));
    });
    expect(read('remaining')).toBe('2');
    expect(read('loading')).toBe('false');
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<Probe />);
    unmount();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
