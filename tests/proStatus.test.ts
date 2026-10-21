import { describe, it, expect } from 'vitest';
import {
  proStatus,
  APP_STORE_SUBSCRIPTIONS_URL,
  PLAY_STORE_SUBSCRIPTIONS_URL,
} from '@/utils/proStatus';

// Local noon, so the formatted day is the same in every test timezone.
const OCT_13_2027 = new Date(2027, 9, 13, 12).getTime();
const NOW = new Date(2026, 9, 20, 12).getTime();

describe('proStatus — what a paying user is told', () => {
  it('says nothing while the entitlement is loading, whatever it reads', () => {
    expect(proStatus({ loading: true, plan: 'pro', expiresAtMs: OCT_13_2027, platform: 'ios', nowMs: NOW })).toBeNull();
  });

  it('says nothing to a free user', () => {
    expect(proStatus({ loading: false, plan: 'free', platform: 'ios', nowMs: NOW })).toBeNull();
  });

  it('names Pro and dates it with the year', () => {
    expect(proStatus({ loading: false, plan: 'pro', expiresAtMs: OCT_13_2027, platform: 'ios', nowMs: NOW })).toEqual({
      title: 'Divit Pro',
      badge: 'Pro',
      detail: 'Active through Oct 13, 2027',
      manageUrl: APP_STORE_SUBSCRIPTIONS_URL,
    });
  });

  it('still names Pro when the date is unknown (grace period), without inventing one', () => {
    const s = proStatus({ loading: false, plan: 'pro', platform: 'ios', nowMs: NOW });
    expect(s?.title).toBe('Divit Pro');
    expect(s?.detail).toBeNull();
    expect(proStatus({ loading: false, plan: 'pro', expiresAtMs: NaN, platform: 'ios', nowMs: NOW })?.detail).toBeNull();
  });

  it('drops a date that has already passed (billing grace period) but keeps the plan', () => {
    // RevenueCat keeps Pro active while it retries a failed renewal; the stored
    // date is then in the past and must not be shown as "Active through".
    const yesterday = NOW - 86_400_000;
    const s = proStatus({ loading: false, plan: 'pro', expiresAtMs: yesterday, platform: 'ios', nowMs: NOW });
    expect(s?.title).toBe('Divit Pro');
    expect(s?.detail).toBeNull();
    // Positive anchor: the same call one day the other side of NOW is dated.
    expect(
      proStatus({ loading: false, plan: 'pro', expiresAtMs: NOW + 86_400_000, platform: 'ios', nowMs: NOW })?.detail,
    ).toBe('Active through Oct 21, 2026');
  });

  it('sends each platform to its own store to manage, and the web nowhere', () => {
    const base = { loading: false, plan: 'pro' as const, expiresAtMs: OCT_13_2027, nowMs: NOW };
    expect(proStatus({ ...base, platform: 'ios', nowMs: NOW })?.manageUrl).toBe(APP_STORE_SUBSCRIPTIONS_URL);
    expect(proStatus({ ...base, platform: 'android', nowMs: NOW })?.manageUrl).toBe(PLAY_STORE_SUBSCRIPTIONS_URL);
    expect(proStatus({ ...base, platform: 'web', nowMs: NOW })?.manageUrl).toBeNull();
  });

  it('names a Trip Pass as such, with nothing to manage (one-time purchase)', () => {
    expect(
      proStatus({ loading: false, plan: 'trip_pass', expiresAtMs: OCT_13_2027, platform: 'ios', nowMs: NOW }),
    ).toEqual({ title: 'Trip Pass', badge: 'Trip Pass', detail: 'Active through Oct 13, 2027', manageUrl: null });
  });
});
