/**
 * The paywall screen. App Review Guideline 3.1.2 sets most of this list, and
 * every item on it is a rejection if it is missing:
 *   - both plans with PRICE and DURATION visible
 *   - what the subscription actually unlocks
 *   - a Restore purchases control
 *   - Terms of Use and Privacy Policy links
 *
 * Prices are placeholders until Phase 4 swaps them for RevenueCat `Offerings`,
 * so these assertions pin the SHAPE (a price and a period are on screen), and
 * the exact figures are asserted once so a silent edit is visible in review.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  isNative: false,
  available: false,
  plan: 'free' as 'free' | 'pro' | 'trip_pass',
  toast: vi.fn(),
  navigate: vi.fn(),
  loadPaywallPackages: vi.fn(),
  purchasePlan: vi.fn(),
  restoreProAccess: vi.fn(),
}));
vi.mock('@/hooks/usePlatform', () => ({
  usePlatform: () => ({
    platform: h.isNative ? 'ios' : 'web',
    isNative: h.isNative,
    isWeb: !h.isNative,
    isIOS: h.isNative,
    isAndroid: false,
  }),
}));
vi.mock('@/services/purchaseService', () => ({
  isPurchasingAvailable: () => h.available,
  loadPaywallPackages: h.loadPaywallPackages,
  purchasePlan: h.purchasePlan,
  restoreProAccess: h.restoreProAccess,
}));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({ plan: h.plan, unlimited: h.plan !== 'free', loading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => h.navigate };
});

import UpgradeView from '@/pages/UpgradeView';

const renderView = () =>
  render(
    <MemoryRouter>
      <UpgradeView />
    </MemoryRouter>,
  );

const LIVE = [
  { id: '$rc_annual', packageType: 'ANNUAL', price: 34.99, priceString: '$34.99',
    intro: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 2 }, trialEligible: true },
  { id: '$rc_monthly', packageType: 'MONTHLY', price: 4.99, priceString: '$4.99', intro: null, trialEligible: true },
];

beforeEach(() => {
  h.isNative = false;
  h.available = false;
  h.plan = 'free';
  h.toast.mockReset();
  h.navigate.mockReset();
  h.loadPaywallPackages.mockReset().mockResolvedValue(LIVE);
  h.purchasePlan.mockReset().mockResolvedValue('purchased');
  h.restoreProAccess.mockReset().mockResolvedValue(true);
});

const goLive = () => {
  h.isNative = true;
  h.available = true;
};

describe('UpgradeView — Guideline 3.1.2 required content', () => {
  it('shows both plans with a price AND a duration', () => {
    renderView();
    expect(screen.getByText('$4.99')).toBeInTheDocument();
    expect(screen.getByText('per month')).toBeInTheDocument();
    expect(screen.getByText('$34.99')).toBeInTheDocument();
    expect(screen.getByText('per year')).toBeInTheDocument();
  });

  it('says what Pro actually unlocks', () => {
    renderView();
    expect(screen.getByText(/Unlimited AI receipt scans/)).toBeInTheDocument();
    expect(screen.getByText(/Unlimited active groups/)).toBeInTheDocument();
  });

  it('offers Restore purchases', () => {
    renderView();
    expect(screen.getByRole('button', { name: /Restore purchases/ })).toBeInTheDocument();
  });

  it('links Privacy Policy at a route that actually exists', () => {
    // The previous version of this test asserted an ABSOLUTE URL for each link
    // and therefore blessed a dead one: divit-bill.com is a client-routed SPA,
    // so every path returns HTTP 200 with the same shell, and `/terms` — which
    // has no route in App.tsx — renders the app's own 404. Asserting the
    // in-app path is what makes this checkable against the router.
    renderView();
    expect(screen.getByRole('link', { name: /Privacy Policy/ })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('links Terms of Use at Apple\u2019s standard EULA', () => {
    // Guideline 3.1.2 requires a FUNCTIONAL Terms of Use link on a subscription
    // screen. Divit has no Terms page of its own, and the earlier absolute URL
    // (divit-bill.com/terms) was dead: that site is a client-routed SPA, so
    // every path returns HTTP 200 with the same shell while App.tsx has no
    // /terms route -- it rendered the app's own 404, and the test that asserted
    // the URL string blessed it.
    //
    // Apple's standard EULA is the documented default for apps that do not
    // supply custom terms, and it is a real page on a host we do not operate,
    // so it cannot rot with our router.
    renderView();
    expect(screen.getByRole('link', { name: /Terms of Use/ })).toHaveAttribute(
      'href',
      'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/',
    );
  });

  it('opens the external EULA without handing it a window handle', () => {
    // target=_blank without rel=noreferrer lets the opened page reach back via
    // window.opener. It matters more than usual here: this link is tapped from
    // inside a Capacitor webview.
    renderView();
    const terms = screen.getByRole('link', { name: /Terms of Use/ });
    expect(terms).toHaveAttribute('target', '_blank');
    expect(terms).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });

});

describe('UpgradeView — a build that cannot sell (web, or no store key) never pretends to', () => {
  it('disables the purchase control on a native build without a store key', () => {
    // A button that takes a tap and does nothing is the worst outcome on a
    // paywall: the user believes they have bought something.
    h.isNative = true;
    renderView();
    expect(screen.getByRole('button', { name: /Coming soon/ })).toBeDisabled();
  });

  it('disables Restore too on a native build without a store key', () => {
    h.isNative = true;
    renderView();
    expect(screen.getByRole('button', { name: /Restore purchases/ })).toBeDisabled();
  });

  it('on the web, points at the app stores instead of a purchase button', () => {
    // A web build cannot sell the subscription at all (Guideline 3.1.1).
    renderView();
    expect(screen.getByText(/Divit Pro is purchased in the iOS or Android app/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Coming soon/ })).not.toBeInTheDocument();
  });
});

describe('UpgradeView — selling on iOS', () => {
  it('shows live store prices with durations (Guideline 3.1.2)', async () => {
    goLive();
    h.loadPaywallPackages.mockResolvedValue([
      { ...LIVE[0], priceString: '₹3,499.00' },
      { ...LIVE[1], priceString: '₹449.00' },
    ]);
    renderView();
    expect(await screen.findByText('₹3,499.00')).toBeInTheDocument();
    expect(screen.getByText('₹449.00')).toBeInTheDocument();
    expect(screen.getByText('per year')).toBeInTheDocument();
    expect(screen.getByText('per month')).toBeInTheDocument();
    // The hardcoded placeholder must never ship next to a live price.
    expect(screen.queryByText('$34.99')).not.toBeInTheDocument();
  });

  it('preselects yearly and offers the trial when eligible', async () => {
    goLive();
    renderView();
    expect(await screen.findByRole('button', { name: 'Start 14-day free trial' })).toBeEnabled();
    expect(screen.getByText(/14-day free trial, then \$34\.99 per year/)).toBeInTheDocument();
  });

  it('buys the selected plan, then thanks the user and leaves', async () => {
    goLive();
    renderView();
    fireEvent.click(await screen.findByRole('radio', { name: /\$4\.99/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Subscribe' }));
    await waitFor(() => expect(h.purchasePlan).toHaveBeenCalledWith('$rc_monthly'));
    await waitFor(() => expect(h.navigate).toHaveBeenCalledWith(-1));
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Pro/) }));
  });

  it('stays put and says nothing when the user cancels the sheet', async () => {
    goLive();
    h.purchasePlan.mockResolvedValue('cancelled');
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Start 14-day free trial' }));
    await waitFor(() => expect(h.purchasePlan).toHaveBeenCalled());
    // Wait until the 'cancelled' result has been HANDLED — the button re-enables
    // in `finally`, after the outcome branch. Asserting before that point would
    // pass even if cancel showed a toast.
    await h.purchasePlan.mock.results[0].value;
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start 14-day free trial' })).toBeEnabled());
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('explains a pending purchase instead of claiming success', async () => {
    goLive();
    h.purchasePlan.mockResolvedValue('pending');
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Start 14-day free trial' }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/pending/i) })),
    );
    expect(h.navigate).not.toHaveBeenCalled();
  });

  it('shows an error toast when the store fails, and re-enables the button', async () => {
    goLive();
    h.purchasePlan.mockRejectedValue(new Error('store down'));
    renderView();
    const cta = await screen.findByRole('button', { name: 'Start 14-day free trial' });
    fireEvent.click(cta);
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' })),
    );
    expect(screen.getByRole('button', { name: 'Start 14-day free trial' })).toBeEnabled();
  });

  it('never sells without a price: a failed load shows retry, not a buy button', async () => {
    goLive();
    h.loadPaywallPackages.mockRejectedValueOnce(new Error('offline'));
    renderView();
    expect(await screen.findByText(/Couldn.t load prices/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subscribe|free trial/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('button', { name: 'Start 14-day free trial' })).toBeInTheDocument();
  });

  it('restores and reports the result', async () => {
    goLive();
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /Restore purchases/ }));
    await waitFor(() => expect(h.restoreProAccess).toHaveBeenCalled());
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/Subscription found/i) })),
    );
  });

  it('says so when there is nothing to restore', async () => {
    goLive();
    h.restoreProAccess.mockResolvedValue(false);
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: /Restore purchases/ }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringMatching(/No active subscription/i),
          // Restore keeps a subscription with the Divit account that bought it
          // (RevenueCat "Keep with original App User ID"), so point there.
          description: expect.stringMatching(/other Divit account/i),
        }),
      ),
    );
  });

  it('does not offer to sell Pro to someone who already has it', async () => {
    goLive();
    h.plan = 'pro';
    renderView();
    expect(await screen.findByText(/You.re on Divit Pro/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subscribe|free trial/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Manage subscription/ })).toHaveAttribute(
      'href',
      'https://apps.apple.com/account/subscriptions',
    );
  });
});
