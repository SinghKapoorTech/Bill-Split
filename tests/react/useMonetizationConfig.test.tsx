/**
 * `useMonetizationConfig` — the React face of `monetizationConfigService`.
 *
 * The service is already covered as pure logic in
 * `tests/monetizationConfigService.test.ts`. What can ONLY be tested with a
 * real render loop is the part that has bitten this repo before: a state write
 * from a stale closure after an await. Here the specific hazard is resolving a
 * fetch into a component that has already unmounted, and — more importantly for
 * the product — what the hook reports WHILE the fetch is still in flight.
 *
 * The loading value is not cosmetic. `scanDisclosure` mutes itself on
 * `loading`, and that mute is the only thing standing between a Pro subscriber
 * and a wall flashed at them for one render.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ fetchMonetizationConfig: vi.fn() }));

vi.mock('@/services/monetizationConfigService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/monetizationConfigService')>();
  return { ...actual, fetchMonetizationConfig: h.fetchMonetizationConfig };
});

import { useMonetizationConfig } from '@/hooks/useMonetizationConfig';
import { MONETIZATION_FALLBACK } from '@/services/monetizationConfigService';

function Probe() {
  const { paywallEnabled, freeScansPerMonth, freeActiveGroups, loading } = useMonetizationConfig();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="paywall">{String(paywallEnabled)}</span>
      <span data-testid="scans">{freeScansPerMonth}</span>
      <span data-testid="groups">{freeActiveGroups}</span>
    </div>
  );
}

const read = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useMonetizationConfig', () => {
  it('starts loading, with the DARK fallback as the interim value', async () => {
    let release: (v: unknown) => void = () => {};
    h.fetchMonetizationConfig.mockReturnValue(new Promise((r) => (release = r)));

    render(<Probe />);

    // The interim state is what a wall would render against if it ignored
    // `loading`, so it must be the safe one in its own right.
    expect(read('loading')).toBe('true');
    expect(read('paywall')).toBe('false');
    expect(read('scans')).toBe(String(MONETIZATION_FALLBACK.freeScansPerMonth));

    await act(async () => {
      release({ paywallEnabled: true, freeScansPerMonth: 2, freeActiveGroups: 2 });
    });

    expect(read('loading')).toBe('false');
    expect(read('paywall')).toBe('true');
  });

  it('publishes the resolved config', async () => {
    h.fetchMonetizationConfig.mockResolvedValue({
      paywallEnabled: true,
      freeScansPerMonth: 5,
      freeActiveGroups: 3,
    });

    await act(async () => {
      render(<Probe />);
    });

    expect(read('scans')).toBe('5');
    expect(read('groups')).toBe('3');
    expect(read('loading')).toBe('false');
  });

  // SCOPE OF THIS TEST, stated honestly: it proves the hook SETTLES on a
  // rejection and stays dark. It does NOT isolate the `.catch` — the hook's
  // initial state is already the fallback, so deleting the catch keeps these
  // assertions true (verified by mutation). The catch's real job is to stop an
  // unhandled rejection, which is not observable from here. What IS worth
  // pinning is that `loading` reaches false: staying loading forever would mute
  // every disclosure permanently, which looks exactly like "the paywall is off"
  // and would hide a real cap indefinitely.
  it('settles rather than hanging in loading when the service rejects', async () => {
    h.fetchMonetizationConfig.mockRejectedValue(new Error('boom'));

    await act(async () => {
      render(<Probe />);
    });

    expect(read('loading')).toBe('false');
    expect(read('paywall')).toBe('false');
    expect(read('scans')).toBe(String(MONETIZATION_FALLBACK.freeScansPerMonth));
  });

  // NOT TESTED, deliberately: the effect's `active` unmount guard.
  //
  // A previous version of this file asserted `console.error` was never called
  // after resolving into an unmounted component. That test could not fail:
  // React 18.3 made a post-unmount `setState` a silent no-op and removed the
  // warning it used to emit, so the guard has NO observable effect here.
  // Mutation-testing caught it — deleting the guard left all five tests green.
  //
  // The guard stays in the hook (it is standard practice, costs three lines,
  // and protects a future version of the effect that does more than set state),
  // but claiming coverage for it would be a lie.

  // Named for what it actually proves. The service is mocked here, so this
  // cannot show request de-duping (that is asserted in the service's own
  // suite); what it pins is that the hook asks ONCE PER CONSUMER and not once
  // per render — which is what caught a removed dependency array.
  it('reads once per mounted consumer, not once per render', async () => {
    h.fetchMonetizationConfig.mockResolvedValue({
      paywallEnabled: true,
      freeScansPerMonth: 2,
      freeActiveGroups: 2,
    });

    await act(async () => {
      render(
        <>
          <Probe />
          <Probe />
          <Probe />
        </>,
      );
    });

    expect(h.fetchMonetizationConfig).toHaveBeenCalledTimes(3);
    expect(screen.getAllByTestId('paywall').every((n) => n.textContent === 'true')).toBe(true);
  });
});

/**
 * Revalidation. A mount-only fetch makes the service's five-minute TTL
 * unreachable from a screen that stays mounted — and Phase 3 mounts the scan
 * wall inside the uploader, which is exactly where a user sits. Since
 * `paywall_enabled` is the emergency rollback (plan step 8.5: publish false,
 * wait 5 min, confirm walls vanish), a wall that outlives its own kill switch
 * defeats the only emergency control this feature has. Beta QA would miss it,
 * because navigating away remounts.
 */
describe('useMonetizationConfig — revalidation', () => {
  const PRO_ON = { paywallEnabled: true, freeScansPerMonth: 2, freeActiveGroups: 2 };
  const PRO_OFF = { paywallEnabled: false, freeScansPerMonth: 2, freeActiveGroups: 2 };

  it('picks up a kill-switch flip without remounting', async () => {
    vi.useFakeTimers();
    h.fetchMonetizationConfig.mockResolvedValue(PRO_ON);

    await act(async () => {
      render(<Probe />);
    });
    expect(read('paywall')).toBe('true');

    h.fetchMonetizationConfig.mockResolvedValue(PRO_OFF);
    await act(async () => {
      vi.advanceTimersByTime(60 * 1000 + 1);
    });

    expect(read('paywall')).toBe('false');
    vi.useRealTimers();
  });

  it('revalidates when the app returns to the foreground', async () => {
    // Capacitor: a backgrounded app has its timers throttled or suspended, so
    // the interval alone cannot cover a resume hours later.
    h.fetchMonetizationConfig.mockResolvedValue(PRO_ON);

    await act(async () => {
      render(<Probe />);
    });
    expect(h.fetchMonetizationConfig).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(h.fetchMonetizationConfig).toHaveBeenCalledTimes(2);
  });

  it('stops revalidating after unmount', async () => {
    vi.useFakeTimers();
    h.fetchMonetizationConfig.mockResolvedValue(PRO_ON);

    let unmount: () => void = () => {};
    await act(async () => {
      unmount = render(<Probe />).unmount;
    });
    unmount();

    const atUnmount = h.fetchMonetizationConfig.mock.calls.length;
    await act(async () => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(h.fetchMonetizationConfig).toHaveBeenCalledTimes(atUnmount);
    vi.useRealTimers();
  });
});
