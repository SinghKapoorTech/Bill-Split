import { describe, it, expect } from 'vitest';
import { planEntitlementMutation, resolveFirebaseUid, TRIP_PASS_DURATION_MS } from '@shared/revenueCatEvents';

const NOW = 1_700_000_000_000;
const base = { id: 'evt-1', app_user_id: 'uid-1', environment: 'PRODUCTION' as const };

describe('planEntitlementMutation', () => {
  it('grants pro on INITIAL_PURCHASE using the event expiry', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'INITIAL_PURCHASE', product_id: 'divit_pro_monthly', expiration_at_ms: NOW + 1000 },
      null, NOW,
    );
    expect(m).toEqual({ kind: 'set-pro', expiresAt: NOW + 1000, inGracePeriod: false });
  });

  it('does NOT revoke on CANCELLATION — access runs to expiry', () => {
    const m = planEntitlementMutation({ ...base, type: 'CANCELLATION', product_id: 'divit_pro_monthly' }, null, NOW);
    expect(m.kind).toBe('ignore');
  });

  it('clears pro on EXPIRATION', () => {
    const m = planEntitlementMutation({ ...base, type: 'EXPIRATION', product_id: 'divit_pro_monthly' }, null, NOW);
    expect(m).toEqual({ kind: 'clear-pro' });
  });

  it('flags grace on BILLING_ISSUE', () => {
    const m = planEntitlementMutation({ ...base, type: 'BILLING_ISSUE', product_id: 'divit_pro_monthly' }, null, NOW);
    expect(m).toEqual({ kind: 'set-grace' });
  });

  it('starts a trip pass from now when none is active', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'NON_RENEWING_PURCHASE', product_id: 'divit_trip_pass_14d', expiration_at_ms: null },
      null, NOW,
    );
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: NOW + TRIP_PASS_DURATION_MS });
  });

  it('EXTENDS an active trip pass rather than restarting it', () => {
    const active = NOW + 5 * 24 * 60 * 60 * 1000;
    const m = planEntitlementMutation(
      { ...base, type: 'NON_RENEWING_PURCHASE', product_id: 'divit_trip_pass_14d', expiration_at_ms: null },
      { tripPassExpiresAt: active }, NOW,
    );
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: active + TRIP_PASS_DURATION_MS });
  });

  it('restarts from now when the previous pass already lapsed', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'NON_RENEWING_PURCHASE', product_id: 'divit_trip_pass_14d', expiration_at_ms: null },
      { tripPassExpiresAt: NOW - 1 }, NOW,
    );
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: NOW + TRIP_PASS_DURATION_MS });
  });

  it('ignores an unknown product id', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'INITIAL_PURCHASE', product_id: 'mystery', expiration_at_ms: NOW + 1 }, null, NOW,
    );
    expect(m.kind).toBe('ignore');
  });

  it('ignores an unknown event type', () => {
    const m = planEntitlementMutation({ ...base, type: 'SOMETHING_NEW', product_id: 'divit_pro_monthly' }, null, NOW);
    expect(m.kind).toBe('ignore');
  });

  it('ignores a SANDBOX event when the server is production', () => {
    const m = planEntitlementMutation(
      { ...base, environment: 'SANDBOX', type: 'INITIAL_PURCHASE', product_id: 'divit_pro_monthly', expiration_at_ms: NOW + 1 },
      null, NOW, false,
    );
    expect(m.kind).toBe('ignore');
  });

  it('accepts a SANDBOX event when sandbox is explicitly allowed', () => {
    const m = planEntitlementMutation(
      { ...base, environment: 'SANDBOX', type: 'INITIAL_PURCHASE', product_id: 'divit_pro_monthly', expiration_at_ms: NOW + 1 },
      null, NOW, true,
    );
    expect(m.kind).toBe('set-pro');
  });

  it('refuses pro with no expiry rather than granting it forever', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'INITIAL_PURCHASE', product_id: 'divit_pro_monthly', expiration_at_ms: null }, null, NOW,
    );
    expect(m.kind).toBe('ignore');
  });
});

describe('resolveFirebaseUid', () => {
  it('prefers a real app_user_id', () => {
    expect(resolveFirebaseUid({ id: 'e', type: 'x', app_user_id: 'uid-1' })).toBe('uid-1');
  });
  it('falls back to a non-anonymous alias', () => {
    expect(resolveFirebaseUid({
      id: 'e', type: 'x', app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', 'uid-2'],
    })).toBe('uid-2');
  });
  it('returns undefined when every id is anonymous', () => {
    expect(resolveFirebaseUid({ id: 'e', type: 'x', app_user_id: '$RCAnonymousID:abc' })).toBeUndefined();
  });
});
