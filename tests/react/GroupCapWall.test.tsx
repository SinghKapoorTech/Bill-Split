/**
 * The active-group cap modal — the group-side twin of `ScanQuotaWall`.
 *
 * SAME SHAPE ON PURPOSE. The owner rejected the inline-wall design for scans in
 * favour of standing text plus a tap-raised modal, and two caps in the same app
 * that behave differently is a worse outcome than either design on its own. So
 * this self-gates on `atCap` exactly as the scan wall self-gates on `level`,
 * and its escape-hatch button is optional for the same reason: a call site with
 * nowhere to send the user omits it rather than rendering a no-op.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

import { GroupCapWall } from '@/components/monetization/GroupCapWall';

beforeEach(() => {
  h.isNative = false;
});

describe('GroupCapWall — when it may appear', () => {
  it('renders nothing below the cap', () => {
    // `atCap` is false while ANYTHING is loading, and false when the kill
    // switch is dark or the user is Pro. Self-gating means a call site cannot
    // put this in front of any of them.
    const { container } = render(<GroupCapWall atCap={false} activeCount={1} limit={2} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('GroupCapWall — copy', () => {
  it('states the count in force, not a hardcoded 2', () => {
    // `free_active_groups` is a live Remote Config key. Asserting at a limit
    // the fallback cannot produce is what stops a hardcoded "2" passing.
    render(<GroupCapWall atCap activeCount={5} limit={5} />);
    expect(screen.getByText('You have 5 active groups.')).toBeInTheDocument();
  });

  it('says "group" singular when the user has exactly one', () => {
    // Reachable: `resolveLimit` permits a limit of 1.
    render(<GroupCapWall atCap activeCount={1} limit={1} />);
    expect(screen.getByText('You have 1 active group.')).toBeInTheDocument();
  });

  it('names both ways out, and says how many the plan allows', () => {
    // The limit is what makes the message explain itself. Asserted at a limit
    // the fallback cannot produce, so a hardcoded "2" cannot pass.
    render(<GroupCapWall atCap activeCount={7} limit={4} />);
    expect(
      screen.getByText(
        /Your free plan includes 4\. Archive one you're finished with, or go unlimited with Pro\./,
      ),
    ).toBeInTheDocument();
  });

  it('reports the real count when the cap was tightened underneath the user', () => {
    // The 5 -> 2 change did exactly this. "You have 3 active groups." is
    // accurate and is not the self-contradiction "3 of 2 groups active" would be.
    render(<GroupCapWall atCap activeCount={3} limit={2} />);
    expect(screen.getByText('You have 3 active groups.')).toBeInTheDocument();
  });
});

describe('GroupCapWall — actions', () => {
  it('routes archive and Pro to their own handlers', async () => {
    h.isNative = true;
    const onArchive = vi.fn();
    const onSeePro = vi.fn();
    render(
      <GroupCapWall atCap activeCount={2} limit={2} onArchive={onArchive} onSeePro={onSeePro} />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Archive a group' }));
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onSeePro).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    expect(onSeePro).toHaveBeenCalledTimes(1);
  });

  it('on the web says where the purchase actually lives', () => {
    render(<GroupCapWall atCap activeCount={2} limit={2} onSeePro={() => {}} />);
    expect(screen.getByRole('button', { name: 'Get Pro in the app' })).toBeInTheDocument();
  });

  it('omits each button the call site cannot honour', () => {
    // Not cosmetic. A dialog raised from a SERVER refusal can sit over a screen
    // with no archive affordance, and a button that does nothing is worse than
    // no button — the rule this project has now broken twice.
    render(<GroupCapWall atCap activeCount={2} limit={2} />);
    expect(screen.queryByRole('button', { name: 'Archive a group' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Pro/ })).not.toBeInTheDocument();
  });
});
