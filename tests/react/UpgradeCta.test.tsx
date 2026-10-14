/**
 * `UpgradeCta` — wiring only. What the card SAYS is `planCardModel`'s job
 * (tests/planCard.test.ts); this pins which controls exist per platform and
 * that the card stays dark with the kill switch off.
 *
 * Every hook is mocked with a FULL factory (no `importOriginal`): a partial
 * mock drags `src/config/firebase.ts` in and fails in CI without `.env`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const h = vi.hoisted(() => ({
  isNative: false,
  paywallEnabled: true,
  plan: 'free' as 'free' | 'pro' | 'trip_pass',
  loading: { entitlement: false, quota: false, config: false, groups: false },
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
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({
    plan: h.plan,
    unlimited: h.plan !== 'free',
    expiresAt: h.plan === 'free' ? undefined : Date.now() + 86_400_000,
    loading: h.loading.entitlement,
  }),
}));
vi.mock('@/hooks/useScanQuota', () => ({
  useScanQuota: () => ({
    used: 1,
    remaining: 1,
    limit: 2,
    resetsAtMs: Date.UTC(2026, 10, 1),
    loading: h.loading.quota,
  }),
}));
vi.mock('@/hooks/useMonetizationConfig', () => ({
  useMonetizationConfig: () => ({
    paywallEnabled: h.paywallEnabled,
    freeScansPerMonth: 2,
    freeActiveGroups: 2,
    loading: h.loading.config,
  }),
}));
vi.mock('@/hooks/useEventManager', () => ({
  useEventManager: () => ({ events: [], loading: false }),
}));
vi.mock('@/hooks/useGroupCap', () => ({
  useGroupCap: () => ({
    activeCount: 2,
    limit: 2,
    atCap: true,
    text: '',
    unlimited: h.plan !== 'free',
    loading: h.loading.groups,
  }),
}));

import { UpgradeCta } from '@/components/settings/UpgradeCta';

function renderCard() {
  return render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<UpgradeCta />} />
        <Route path="/upgrade" element={<p>UPGRADE PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  h.isNative = false;
  h.paywallEnabled = true;
  h.plan = 'free';
  h.loading = { entitlement: false, quota: false, config: false, groups: false };
});

describe('UpgradeCta', () => {
  it('renders nothing while the paywall kill switch is dark', () => {
    h.paywallEnabled = false;
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('free user on native: the banner opens /upgrade', async () => {
    h.isNative = true;
    renderCard();
    expect(screen.getByText('Go unlimited with Pro')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    expect(screen.getByText('UPGRADE PAGE')).toBeInTheDocument();
  });

  it('free user on web: no purchase button, links to both store apps', () => {
    renderCard();
    expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).toBeNull();
    expect(screen.getByRole('link', { name: 'iOS app' })).toHaveAttribute(
      'href',
      'https://apps.apple.com/app/id6760331853',
    );
    expect(screen.getByRole('link', { name: 'Android app' })).toHaveAttribute(
      'href',
      'https://play.google.com/store/apps/details?id=com.singhkapoortech.divit',
    );
  });

  it('Pro user: is never offered the upgrade', () => {
    // Pinned against the free-user tests above, which render the banner from
    // the same mocks — so an always-empty component cannot pass both.
    h.isNative = true;
    h.plan = 'pro';
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  // One per source hook. The banner's model composes FOUR loading flags; dropping any
  // one of them from `usePlanCardModel`'s `loading:` line must fail a test here,
  // or a subscriber can be shown "Free" + Upgrade while that hook settles.
  // The entitlement mock reports `free` while loading, as the real hook does.
  it.each(['entitlement', 'quota', 'config', 'groups'] as const)(
    'renders nothing while %s is still loading',
    (which) => {
      h.isNative = true;
      h.loading[which] = true;
      const { container } = renderCard();
      expect(container).toBeEmptyDOMElement();
    },
  );
});
