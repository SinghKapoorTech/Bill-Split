/**
 * `ScanQuotaWall` — what replaces the scan CTA once the free quota is gone.
 *
 * SELF-GATING ON `level`. It renders nothing unless the level is `'wall'`, so a
 * call site cannot accidentally put an upgrade wall in front of a user with
 * scans left (or, worse, in front of a Pro subscriber whose entitlement was
 * still in flight — `level` is `'hidden'` for the whole of that window).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// `usePlatform` is mocked rather than passed in as a prop: the component reads
// it directly, the way `ReceiptUploader` does, so no call site has to remember
// to drill "am I native" down to a button label.
const h = vi.hoisted(() => ({ isNative: false }));
vi.mock('@/hooks/usePlatform', () => ({
  usePlatform: () => ({
    platform: h.isNative ? 'ios' : 'web',
    isNative: h.isNative,
    isWeb: !h.isNative,
    isIOS: h.isNative,
    isAndroid: false,
  }),
}));

import { ScanQuotaWall } from '@/components/monetization/ScanQuotaWall';

beforeEach(() => {
  h.isNative = false;
});

const OCT_1 = Date.UTC(2026, 9, 1);

describe('ScanQuotaWall — when it is allowed on screen', () => {
  it.each(['hidden', 'silent', 'ambient', 'last'] as const)(
    'renders nothing at level %s',
    (level) => {
      const { container } = render(
        <ScanQuotaWall level={level} limit={2} resetsAtMs={OCT_1} onSeePro={() => {}} />,
      );
      expect(container).toBeEmptyDOMElement();
    },
  );
});

describe('ScanQuotaWall — copy', () => {
  it('names the limit that is actually in force, not a hardcoded 2', () => {
    // `free_scans_per_month` is a LIVE Remote Config key. A test written at
    // limit 2 passes against a hardcoded "2" -- that exact false green already
    // happened once this project (see the handoff's failed-approaches table),
    // because `base.limit` was also 2 and "2" appeared nowhere else in the
    // string. Pinning a limit the fallback cannot produce is what makes this
    // assertion mean something.
    render(<ScanQuotaWall level="wall" limit={7} resetsAtMs={OCT_1} onSeePro={() => {}} />);
    expect(screen.getByText(/You've used all 7 free AI scans this month/)).toBeInTheDocument();
  });

  it('says "scan" singular when the limit really is 1', () => {
    // `resolveLimit`'s LIMIT_MIN is 1, so this is reachable from config.
    render(<ScanQuotaWall level="wall" limit={1} resetsAtMs={OCT_1} onSeePro={() => {}} />);
    expect(screen.getByText(/You've used all 1 free AI scan this month/)).toBeInTheDocument();
  });

  it('gives the reset date and the manual-entry escape hatch', () => {
    render(<ScanQuotaWall level="wall" limit={2} resetsAtMs={OCT_1} onSeePro={() => {}} />);
    expect(screen.getByText(/They reset Oct 1\./)).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro for unlimited scans, or add items by hand\./))
      .toBeInTheDocument();
  });

  it('drops the date rather than naming the wrong day when the boundary is unusable', () => {
    // `resetsAtMs: 0` is what a still-loading quota emits. It used to render
    // "Jan 1" -- 1970. A wrong date is worse than an absent one.
    render(<ScanQuotaWall level="wall" limit={2} resetsAtMs={0} onSeePro={() => {}} />);
    expect(screen.queryByText(/They reset/)).not.toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Pro for unlimited scans/)).toBeInTheDocument();
    expect(screen.queryByText(/1970|Jan 1/)).not.toBeInTheDocument();
  });
});

describe('ScanQuotaWall — buttons', () => {
  it('offers manual entry and Pro, and routes each to its own handler', async () => {
    h.isNative = true;
    const onAddManually = vi.fn();
    const onSeePro = vi.fn();
    render(
      <ScanQuotaWall
        level="wall"
        limit={2}
        resetsAtMs={OCT_1}
        onAddManually={onAddManually}
        onSeePro={onSeePro}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Add items manually' }));
    expect(onAddManually).toHaveBeenCalledTimes(1);
    expect(onSeePro).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    expect(onSeePro).toHaveBeenCalledTimes(1);
  });

  it('on the web tells the user where the purchase actually lives', () => {
    // Guideline 3.1.1: a web build cannot sell the subscription. Offering
    // "See Pro" there leads to a page that can only say "not here".
    render(<ScanQuotaWall level="wall" limit={2} resetsAtMs={OCT_1} onSeePro={() => {}} />);
    expect(screen.getByRole('button', { name: 'Get Pro in the app' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).not.toBeInTheDocument();
  });

  it('omits the manual-entry button when the call site has nowhere to send them', () => {
    // The dialog raised from a SERVER cap race can sit over a screen with no
    // manual-entry affordance. A button that does nothing is worse than none.
    render(<ScanQuotaWall level="wall" limit={2} resetsAtMs={OCT_1} onSeePro={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Add items manually' })).not.toBeInTheDocument();
  });
});
