/**
 * `ProMembershipCard` — wiring only; the wording is `proStatus`'s job
 * (tests/proStatus.test.ts). Hooks are mocked with FULL factories: a partial
 * mock drags `src/config/firebase.ts` in and fails in CI without `.env`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({
  platform: 'ios',
  plan: 'pro' as 'free' | 'pro' | 'trip_pass',
  loading: false,
}));

vi.mock('@/hooks/usePlatform', () => ({
  usePlatform: () => ({
    platform: h.platform,
    isNative: h.platform !== 'web',
    isWeb: h.platform === 'web',
    isIOS: h.platform === 'ios',
    isAndroid: h.platform === 'android',
  }),
}));
vi.mock('@/hooks/useEntitlement', () => ({
  useEntitlement: () => ({
    plan: h.plan,
    unlimited: h.plan !== 'free',
    expiresAt: h.plan === 'free' ? undefined : new Date(2027, 9, 13, 12).getTime(),
    loading: h.loading,
  }),
}));

import { ProMembershipCard } from '@/components/settings/ProMembershipCard';
import { APP_STORE_SUBSCRIPTIONS_URL } from '@/utils/proStatus';

beforeEach(() => {
  h.platform = 'ios';
  h.plan = 'pro';
  h.loading = false;
  vi.restoreAllMocks();
});

describe('ProMembershipCard', () => {
  it('tells a Pro user they are Pro, until when, and what it includes', () => {
    render(<ProMembershipCard />);
    expect(screen.getByRole('heading', { name: 'Divit Pro' })).toBeInTheDocument();
    expect(screen.getByText('Active through Oct 13, 2027')).toBeInTheDocument();
    expect(screen.getByText('Unlimited AI receipt scans')).toBeInTheDocument();
  });

  it('opens the App Store subscription page to manage it', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<ProMembershipCard />);
    await userEvent.click(screen.getByRole('button', { name: /Manage subscription/ }));
    expect(open).toHaveBeenCalledWith(APP_STORE_SUBSCRIPTIONS_URL, '_blank');
  });

  it('offers no manage button on the web, which cannot know the store', () => {
    h.platform = 'web';
    render(<ProMembershipCard />);
    expect(screen.getByRole('heading', { name: 'Divit Pro' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Manage subscription/ })).not.toBeInTheDocument();
  });

  it('renders nothing for a free user', () => {
    h.plan = 'free';
    const { container } = render(<ProMembershipCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the plan is loading', () => {
    h.loading = true;
    const { container } = render(<ProMembershipCard />);
    expect(container).toBeEmptyDOMElement();
  });
});
