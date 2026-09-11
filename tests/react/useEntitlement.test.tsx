/**
 * `useEntitlement` — the live read of `entitlements/{uid}`.
 *
 * The decision itself is pure and already covered (`tests/entitlements.test.ts`
 * over `resolveEffectivePlan`). What only a render loop can show is the wiring:
 * what the hook reports BEFORE the first snapshot arrives, what it does when
 * the document is absent (the normal steady state for everyone who has never
 * paid), and whether it unsubscribes.
 *
 * The direction that matters: every unknown resolves to `free`, never to a paid
 * plan. `free` is a fully working app, so failing this way degrades entitlement
 * without breaking anything — whereas minting Pro from a malformed document
 * would hand out the product.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => {
  return {
    onSnapshot: vi.fn(),
    doc: vi.fn(() => ({})),
    unsubscribe: vi.fn(),
    user: { uid: 'u1' } as { uid: string } | null | undefined,
  };
});

vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: h.doc, onSnapshot: h.onSnapshot }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));

import { useEntitlement } from '@/hooks/useEntitlement';

/** Stand-in for a Firestore Timestamp: the only thing read is `toMillis`. */
const ts = (ms: number) => ({ toMillis: () => ms });

const NOW = Date.UTC(2026, 8, 15);
const FUTURE = NOW + 30 * 24 * 60 * 60 * 1000;
const PAST = NOW - 24 * 60 * 60 * 1000;

let emit: (snap: unknown) => void = () => {};
let fail: (e: Error) => void = () => {};

function Probe() {
  const { plan, unlimited, expiresAt, loading } = useEntitlement();
  return (
    <div>
      <span data-testid="plan">{plan}</span>
      <span data-testid="unlimited">{String(unlimited)}</span>
      <span data-testid="expires">{expiresAt === undefined ? 'none' : expiresAt}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
}

const read = (id: string) => screen.getByTestId(id).textContent;

/** Every committed value of `loading`, oldest first. */
const renderLog: boolean[] = [];

function LoggingProbe() {
  const { loading } = useEntitlement();
  renderLog.push(loading);
  return null;
}

/** Pushes a document snapshot into the live listener. */
async function push(data: Record<string, unknown> | null) {
  await act(async () => {
    emit({ exists: () => data !== null, data: () => data });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.setSystemTime(NOW);
  h.user = { uid: 'u1' };
  h.onSnapshot.mockImplementation((_ref: unknown, next: unknown, err: unknown) => {
    emit = next as (s: unknown) => void;
    fail = err as (e: Error) => void;
    return h.unsubscribe;
  });
});

describe('useEntitlement — before anything arrives', () => {
  it('reports free and loading, never a paid plan', () => {
    render(<Probe />);
    expect(read('plan')).toBe('free');
    expect(read('unlimited')).toBe('false');
    expect(read('loading')).toBe('true');
  });

  it('settles to free with NO document — the normal state for a new user', async () => {
    render(<Probe />);
    await push(null);
    expect(read('plan')).toBe('free');
    expect(read('unlimited')).toBe('false');
    expect(read('loading')).toBe('false');
  });
});

describe('useEntitlement — resolving the plan', () => {
  it('reports pro for an unexpired subscription', async () => {
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(FUTURE) });
    expect(read('plan')).toBe('pro');
    expect(read('unlimited')).toBe('true');
    expect(read('expires')).toBe(String(FUTURE));
  });

  it('drops an EXPIRED pro subscription back to free', async () => {
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(PAST) });
    expect(read('plan')).toBe('free');
    expect(read('unlimited')).toBe('false');
  });

  it('keeps pro alive during the billing grace period', async () => {
    // RevenueCat still considers the subscription active while a card is being
    // retried, and expiresAt is already in the past. Cutting the user off
    // mid-retry punishes them for a charge that may yet succeed.
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(PAST), inGracePeriod: true });
    expect(read('plan')).toBe('pro');
  });

  it('treats a pro document with no date as MALFORMED, not as pro', async () => {
    // Fail-closed: granting Pro on a document we cannot date would make one bad
    // webhook write permanent.
    render(<Probe />);
    await push({ plan: 'pro' });
    expect(read('plan')).toBe('free');
  });

  it('honours a trip pass, which also lifts the caps', async () => {
    render(<Probe />);
    await push({ plan: 'trip_pass', expiresAt: ts(FUTURE) });
    expect(read('plan')).toBe('trip_pass');
    expect(read('unlimited')).toBe('true');
  });

  it('honours a standalone pass held alongside a lapsed subscription', async () => {
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(PAST), tripPassExpiresAt: ts(FUTURE) });
    expect(read('plan')).toBe('trip_pass');
    expect(read('unlimited')).toBe('true');
  });
});

describe('useEntitlement — expiresAt belongs to the plan IN FORCE', () => {
  it('reports the subscription date for pro', async () => {
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(FUTURE) });
    expect(read('expires')).toBe(String(FUTURE));
  });

  it('reports the PASS date, not the subscription date, for a standalone pass', async () => {
    // A user who bought a pass and then subscribed, whose subscription later
    // lapsed. Emitting the raw field would show the stale subscription date on a
    // "Trip Pass until {date}" line.
    const PASS_END = NOW + 5 * 24 * 60 * 60 * 1000;
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(PAST), tripPassExpiresAt: ts(PASS_END) });
    expect(read('plan')).toBe('trip_pass');
    expect(read('expires')).toBe(String(PASS_END));
  });

  it('reports nothing for free, even when the document carries a past date', async () => {
    // A lapsed Pro doc resolves to free but still holds a timestamp. "Pro until
    // <yesterday>" is worse than showing no date at all.
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(PAST) });
    expect(read('plan')).toBe('free');
    expect(read('expires')).toBe('none');
  });
});

describe('useEntitlement — malformed data cannot mint Pro', () => {
  const junk: Array<[string, Record<string, unknown>]> = [
    ['an unknown plan string', { plan: 'platinum', expiresAt: ts(FUTURE) }],
    ['a numeric expiresAt of NaN', { plan: 'pro', expiresAt: ts(NaN) }],
    ['an expiresAt that is not a timestamp', { plan: 'pro', expiresAt: 'soon' }],
    ['a null expiresAt', { plan: 'pro', expiresAt: null }],
    ['a truthy-but-not-true grace flag', { plan: 'pro', expiresAt: ts(PAST), inGracePeriod: 1 }],
    ['an empty document', {}],
  ];

  it.each(junk)('stays free for %s', async (_name, data) => {
    render(<Probe />);
    await push(data);
    expect(read('plan')).toBe('free');
    expect(read('unlimited')).toBe('false');
  });

  // `resolveEffectivePlan` already refuses to grant Pro on a non-finite date,
  // so the PLAN was never at risk. What leaks is the `expiresAt` this hook
  // EXPOSES: NaN reaches a consumer and renders "Invalid Date" in the Settings
  // plan card. Mutation-testing found this — the plan assertions above all
  // stayed green with the finite check removed.
  // `it.each` rather than a loop with a manual `document.body.innerHTML = ''`.
  // That pattern left N components mounted with N live listeners while the
  // module-level `emit` pointed only at the newest, so every earlier iteration
  // was a dead subscription the assertions could not see.
  it.each([[ts(NaN)], [ts(Infinity)], ['soon'], [null]])(
    'never exposes a non-finite expiresAt (%s)',
    async (bad) => {
      render(<Probe />);
      await push({ plan: 'pro', expiresAt: bad });
      expect(read('expires')).toBe('none');
    },
  );

  it('accepts a raw millisecond number as well as a Timestamp', async () => {
    // Defensive: a future writer, or a document seeded by a test/migration,
    // may store millis directly.
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: FUTURE });
    expect(read('plan')).toBe('pro');
  });
});

describe('useEntitlement — failure and lifecycle', () => {
  it('never throws out of the render tree when the listener errors', async () => {
    render(<Probe />);
    await act(async () => {
      fail(new Error('permission-denied'));
    });
    expect(read('plan')).toBe('free');
    expect(read('unlimited')).toBe('false');
    // NOTE: it does NOT settle. See 'stays MUTED rather than asserting free'
    // below — an error here is terminal, so settling would be a durable claim.
  });

  it('does not subscribe at all when there is no signed-in user', () => {
    h.user = null;
    render(<Probe />);
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(read('plan')).toBe('free');
    // Auth resolved to "nobody" — this is settled, not loading.
    expect(read('loading')).toBe('false');
  });

  it('stays loading while auth itself is unresolved', () => {
    // AuthContext uses `undefined` for "not yet known" and `null` for "resolved,
    // signed out". Treating undefined as signed-out would flash a free-tier wall
    // at a Pro subscriber during every cold start.
    h.user = undefined;
    render(<Probe />);
    expect(h.onSnapshot).not.toHaveBeenCalled();
    expect(read('loading')).toBe('true');
  });

  it('CLEARS a previously good plan when the listener later errors', async () => {
    // The error tests used to fire from the initial state, where the reset is a
    // no-op — deleting `setState(FREE)` from the error handler left 21/21 green.
    // A listener can also fail after delivering data (token expiry, rules
    // change), and continuing to display a stale `pro` would be a claim we can
    // no longer support.
    render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(FUTURE) });
    expect(read('plan')).toBe('pro');

    await act(async () => {
      fail(new Error('permission-denied'));
    });
    expect(read('plan')).toBe('free');
    expect(read('unlimited')).toBe('false');
  });

  it('stays MUTED rather than asserting free after a listener error', () => {
    // onSnapshot's error callback is terminal and the effect only re-runs on
    // [uid, user], so `{free, loading:false}` would be durable, not a flash. The
    // permission-denied race (listener attaches before a fresh ID token
    // propagates) would then pin a paying subscriber behind a wall all session.
    render(<Probe />);
    act(() => {
      fail(new Error('permission-denied'));
    });
    expect(read('loading')).toBe('true');
  });

  it('clears the previous account when the user signs out mid-session', async () => {
    // Account switch on a shared device. No test used to transition a MOUNTED
    // hook, so deleting these resets survived mutation.
    const { rerender } = render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(FUTURE) });
    expect(read('plan')).toBe('pro');

    h.user = null;
    await act(async () => {
      rerender(<Probe />);
    });

    expect(read('plan')).toBe('free');
    expect(read('unlimited')).toBe('false');
    expect(read('loading')).toBe('false');
  });

  it('re-mutes when auth goes back to unresolved', async () => {
    const { rerender } = render(<Probe />);
    await push({ plan: 'pro', expiresAt: ts(FUTURE) });

    h.user = undefined;
    await act(async () => {
      rerender(<Probe />);
    });

    expect(read('plan')).toBe('free');
    expect(read('loading')).toBe('true');
  });

  it('settles when auth resolves from UNRESOLVED to SIGNED OUT', async () => {
    // Why `user` belongs in the effect deps alongside `uid`. `uid` is undefined
    // for BOTH `user === undefined` (unresolved) and `user === null` (signed
    // out), so with deps of `[uid]` alone the effect never re-runs on that
    // transition and `loading` sticks at true forever — on every signed-out
    // visit to the landing page. Mutation-testing found deps `[uid]` surviving
    // because no test made this exact transition.
    h.user = undefined;
    const { rerender } = render(<Probe />);
    expect(read('loading')).toBe('true');

    h.user = null;
    await act(async () => {
      rerender(<Probe />);
    });

    expect(read('loading')).toBe('false');
    expect(read('plan')).toBe('free');
  });

  it('reports loading on the FIRST committed render for a signed-in user', () => {
    // The initializer used to be `useState(user === undefined)`, which is FALSE
    // for someone already signed in — so the first commit was
    // {free, unlimited:false, loading:false} and a wall could paint for one
    // frame in front of a Pro subscriber. The effect runs AFTER commit and
    // cannot beat it; the browser may paint in between.
    //
    // Asserting after `render()` cannot see this: RTL flushes effects inside
    // act(), so the effect's setLoading(true) has already landed. The mutation
    // `useState(true)` -> `useState(false)` survived for exactly that reason.
    // Recording every committed value is what makes the first one observable.
    renderLog.length = 0;
    render(<LoggingProbe />);
    expect(renderLog[0]).toBe(true);
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = render(<Probe />);
    expect(h.onSnapshot).toHaveBeenCalledTimes(1);
    unmount();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('resubscribes to the new uid when the user changes', async () => {
    const { rerender } = render(<Probe />);
    expect(h.doc).toHaveBeenLastCalledWith({}, 'entitlements', 'u1');

    h.user = { uid: 'u2' };
    await act(async () => {
      rerender(<Probe />);
    });

    expect(h.unsubscribe).toHaveBeenCalled();
    expect(h.doc).toHaveBeenLastCalledWith({}, 'entitlements', 'u2');
  });
});
