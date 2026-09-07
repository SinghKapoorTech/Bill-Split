import { describe, it, expect } from 'vitest';
import {
  resolveEffectivePlan,
  hasUnlimitedUsage,
  type EntitlementState,
} from '@shared/entitlements';

const NOW = Date.UTC(2026, 8, 6, 12, 0, 0); // 2026-09-06T12:00:00Z
const FUTURE = NOW + 86_400_000;
const PAST = NOW - 86_400_000;

describe('resolveEffectivePlan', () => {
  describe('absence and malformed input all resolve to free', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['empty object', {}],
      ['unknown plan string', { plan: 'enterprise', expiresAt: FUTURE }],
      ['pro with no expiry and no grace flag', { plan: 'pro' }],
      ['pro with a non-finite expiry', { plan: 'pro', expiresAt: Number.NaN }],
      ['pro with an Infinity expiry', { plan: 'pro', expiresAt: Number.POSITIVE_INFINITY }],
      [
        'pro with a string expiry',
        { plan: 'pro', expiresAt: '9999999999999' as unknown as number },
      ],
      ['expired pro', { plan: 'pro', expiresAt: PAST }],
      ['expired trip pass', { plan: 'trip_pass', expiresAt: PAST }],
    ])('%s → free', (_label, state) => {
      expect(resolveEffectivePlan(state as EntitlementState | null | undefined, NOW)).toBe('free');
    });

    it('NEVER fails open to pro when the document is unreadable garbage', () => {
      const garbage = { plan: 123, expiresAt: {}, inGracePeriod: 'yes' } as unknown;
      expect(resolveEffectivePlan(garbage as EntitlementState, NOW)).toBe('free');
    });

    // Infinity would otherwise pass a naive `expiresAt > now` and grant a
    // permanent, unrevocable subscription from one bad webhook write.
    it('rejects Infinity rather than granting an eternal subscription', () => {
      expect(resolveEffectivePlan({ plan: 'pro', expiresAt: Number.POSITIVE_INFINITY }, NOW)).toBe(
        'free',
      );
    });
  });

  describe('pro', () => {
    it('is active while unexpired', () => {
      expect(resolveEffectivePlan({ plan: 'pro', expiresAt: FUTURE }, NOW)).toBe('pro');
    });

    // During a billing retry RevenueCat reports the subscription active while
    // expiresAt is already past. Cutting the user off mid-retry punishes them
    // for a card that is still being charged.
    it('is active while expired but in the grace period', () => {
      expect(resolveEffectivePlan({ plan: 'pro', expiresAt: PAST, inGracePeriod: true }, NOW)).toBe(
        'pro',
      );
    });

    it('requires grace to be literally true, not merely truthy', () => {
      const truthy = { plan: 'pro', expiresAt: PAST, inGracePeriod: 'true' as unknown as boolean };
      expect(resolveEffectivePlan(truthy, NOW)).toBe('free');
    });

    it('expires exactly AT the boundary, not after it', () => {
      expect(resolveEffectivePlan({ plan: 'pro', expiresAt: NOW }, NOW)).toBe('free');
      expect(resolveEffectivePlan({ plan: 'pro', expiresAt: NOW + 1 }, NOW)).toBe('pro');
    });
  });

  describe('trip pass', () => {
    it('is active while unexpired', () => {
      expect(resolveEffectivePlan({ plan: 'trip_pass', expiresAt: FUTURE }, NOW)).toBe('trip_pass');
    });

    // A pass is a non-renewing consumable — there is no billing retry to be in,
    // so honouring a grace flag would extend something already fully used.
    it('ignores inGracePeriod', () => {
      expect(
        resolveEffectivePlan({ plan: 'trip_pass', expiresAt: PAST, inGracePeriod: true }, NOW),
      ).toBe('free');
    });
  });

  describe('holding both a pass and a subscription (spec §5.1)', () => {
    it('pro outranks an active pass', () => {
      expect(
        resolveEffectivePlan({ plan: 'pro', expiresAt: FUTURE, tripPassExpiresAt: FUTURE }, NOW),
      ).toBe('pro');
    });

    // The pass is never consumed or refunded when a subscription supersedes it —
    // it stops mattering, and matters again if the subscription lapses first.
    it('falls back to the pass when the subscription has lapsed', () => {
      expect(
        resolveEffectivePlan({ plan: 'pro', expiresAt: PAST, tripPassExpiresAt: FUTURE }, NOW),
      ).toBe('trip_pass');
    });

    it('resolves free once both have expired', () => {
      expect(
        resolveEffectivePlan({ plan: 'pro', expiresAt: PAST, tripPassExpiresAt: PAST }, NOW),
      ).toBe('free');
    });
  });
});

describe('hasUnlimitedUsage', () => {
  it('lifts the caps for both paid plans and for neither free user', () => {
    expect(hasUnlimitedUsage('pro')).toBe(true);
    expect(hasUnlimitedUsage('trip_pass')).toBe(true);
    expect(hasUnlimitedUsage('free')).toBe(false);
  });
});
