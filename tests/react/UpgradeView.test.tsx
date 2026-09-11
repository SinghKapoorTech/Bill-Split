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
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

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

import UpgradeView from '@/pages/UpgradeView';

const renderView = () =>
  render(
    <MemoryRouter>
      <UpgradeView />
    </MemoryRouter>,
  );

beforeEach(() => {
  h.isNative = false;
});

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

describe('UpgradeView — nothing here pretends to sell yet', () => {
  it('disables the purchase control until Phase 4 wires RevenueCat', () => {
    // A button that takes a tap and does nothing is the worst outcome on a
    // paywall: the user believes they have bought something.
    h.isNative = true;
    renderView();
    expect(screen.getByRole('button', { name: /Coming soon/ })).toBeDisabled();
  });

  it('disables Restore too — there is nothing to restore before Phase 4', () => {
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
