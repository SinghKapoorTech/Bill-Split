import { describe, it, expect } from 'vitest';
import {
  planEntitlementMutation,
  resolveFirebaseUid,
  TRIP_PASS_DURATION_MS,
  PRODUCT_PLANS,
} from '@shared/revenueCatEvents';

const NOW = 1_700_000_000_000;
const base = { id: 'evt-1', app_user_id: 'uid-1', environment: 'PRODUCTION' as const };

// 14 days in ms, written as a literal (not derived from TRIP_PASS_DURATION_MS)
// so a test that asserts against it actually pins the 14-day product decision
// rather than trivially agreeing with whatever the constant happens to say.
const FOURTEEN_DAYS_MS = 1_209_600_000;

describe('TRIP_PASS_DURATION_MS', () => {
  // This is a product decision (spec §4.4: a Trip Pass lasts 14 days), not an
  // implementation detail — pin the literal so the constant can't drift (e.g.
  // to 7 days) without a test noticing.
  it('is exactly 14 days', () => {
    expect(TRIP_PASS_DURATION_MS).toBe(1_209_600_000);
  });
});

describe('planEntitlementMutation', () => {
  it.each([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'PRODUCT_CHANGE',
    'SUBSCRIPTION_EXTENDED',
  ])('grants pro on %s using the event expiry', (type) => {
    const m = planEntitlementMutation(
      { ...base, type, product_id: 'divit_pro_monthly', expiration_at_ms: NOW + 1000 },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'set-pro', expiresAt: NOW + 1000, inGracePeriod: false });
  });

  it('grants pro on divit_pro_annual same as divit_pro_monthly', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_annual',
        expiration_at_ms: NOW + 1000,
      },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'set-pro', expiresAt: NOW + 1000, inGracePeriod: false });
  });

  it('PRODUCT_PLANS has exactly the three known products', () => {
    expect(PRODUCT_PLANS).toEqual({
      divit_pro_monthly: 'pro',
      divit_pro_annual: 'pro',
      divit_trip_pass_14d: 'trip_pass',
    });
  });

  it('ignores SUBSCRIPTION_PAUSED — defers to EXPIRATION, same as CANCELLATION', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'SUBSCRIPTION_PAUSED', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'pause-defers-to-expiration' });
  });

  it('ignores EXPIRATION on a trip-pass product — an expired pass needs no write', () => {
    // Pins the plan !== 'pro' guard: EXPIRATION only clears a subscription's
    // `pro` flag. A trip pass has no persistent "active" flag to clear —
    // resolveEffectivePlan simply stops honouring tripPassExpiresAt once the
    // timestamp passes — so writing clear-pro here would be a no-op at best
    // and, worse, could downgrade an active subscriber who happens to also
    // hold an (irrelevant, already-expired) trip pass.
    const m = planEntitlementMutation(
      { ...base, type: 'EXPIRATION', product_id: 'divit_trip_pass_14d' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'pass-product-on-subscription-event' });
  });

  it('ignores BILLING_ISSUE on a trip-pass product', () => {
    // A Trip Pass is prepaid and non-renewing — there is no billing retry to
    // flag grace for. Same plan !== 'pro' guard as EXPIRATION above.
    const m = planEntitlementMutation(
      { ...base, type: 'BILLING_ISSUE', product_id: 'divit_trip_pass_14d' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'pass-product-on-subscription-event' });
  });

  it('ignores NON_RENEWING_PURCHASE on a pro (subscription) product', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: null,
      },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'non-renewing-non-pass' });
  });

  it.each([NaN, Infinity, '123' as unknown as number])(
    'refuses a pro grant with a non-finite/non-numeric expiry (%p)',
    (expiration_at_ms) => {
      const m = planEntitlementMutation(
        { ...base, type: 'INITIAL_PURCHASE', product_id: 'divit_pro_monthly', expiration_at_ms },
        null,
        NOW,
      );
      expect(m).toEqual({ kind: 'ignore', reason: 'pro-grant-without-expiry' });
    },
  );

  it('ignores an event with no product_id at all', () => {
    const m = planEntitlementMutation({ ...base, type: 'INITIAL_PURCHASE' }, null, NOW);
    expect(m).toEqual({ kind: 'ignore', reason: 'unknown-product' });
  });

  it('does NOT revoke on CANCELLATION — access runs to expiry', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'CANCELLATION', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'cancellation-defers-to-expiration' });
  });

  it('clears pro on EXPIRATION', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'EXPIRATION', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'clear-pro' });
  });

  it('flags grace on BILLING_ISSUE', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'BILLING_ISSUE', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'set-grace' });
  });

  it('starts a trip pass from now when none is active', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_trip_pass_14d',
        expiration_at_ms: null,
      },
      null,
      NOW,
    );
    // Literal, not TRIP_PASS_DURATION_MS — see FOURTEEN_DAYS_MS above.
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: NOW + FOURTEEN_DAYS_MS });
  });

  it('starts a trip pass from now when current entitlement doc exists but has no active pass', () => {
    // current = {} : the entitlement doc exists (e.g. the user already has a
    // pro subscription doc) but simply has no tripPassExpiresAt field yet.
    // Must behave identically to current = null, not throw or misread it as
    // an already-active pass.
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_trip_pass_14d',
        expiration_at_ms: null,
      },
      {},
      NOW,
    );
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: NOW + FOURTEEN_DAYS_MS });
  });

  it('EXTENDS an active trip pass rather than restarting it', () => {
    const active = NOW + 5 * 24 * 60 * 60 * 1000;
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_trip_pass_14d',
        expiration_at_ms: null,
      },
      { tripPassExpiresAt: active },
      NOW,
    );
    expect(m).toEqual({
      kind: 'extend-trip-pass',
      tripPassExpiresAt: active + FOURTEEN_DAYS_MS,
    });
  });

  it('restarts from now when the previous pass already lapsed', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_trip_pass_14d',
        expiration_at_ms: null,
      },
      { tripPassExpiresAt: NOW - 1 },
      NOW,
    );
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: NOW + FOURTEEN_DAYS_MS });
  });

  it('ignores an unknown product id', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'INITIAL_PURCHASE', product_id: 'mystery', expiration_at_ms: NOW + 1 },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'unknown-product' });
  });

  it('ignores an unknown event type', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'SOMETHING_NEW', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'unhandled-event-type' });
  });

  it('ignores a SANDBOX event when the server is production', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        environment: 'SANDBOX',
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: NOW + 1,
      },
      null,
      NOW,
      false,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'sandbox-event-in-production' });
  });

  it('defaults to rejecting SANDBOX when acceptSandbox is omitted entirely', () => {
    // Pins the DEFAULT VALUE of the 4th parameter, not just its explicit
    // false case above. Called with only 3 arguments — if someone flipped
    // `acceptSandbox = false` to `= true` at the function signature, this is
    // the only test that would catch it; the two SANDBOX tests above both
    // pass the argument explicitly and would keep passing either way.
    const m = planEntitlementMutation(
      {
        ...base,
        environment: 'SANDBOX',
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: NOW + 1,
      },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'sandbox-event-in-production' });
  });

  it('accepts a SANDBOX event when sandbox is explicitly allowed', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        environment: 'SANDBOX',
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: NOW + 1,
      },
      null,
      NOW,
      true,
    );
    expect(m.kind).toBe('set-pro');
  });

  it('refuses pro with no expiry rather than granting it forever', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: null,
      },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'ignore', reason: 'pro-grant-without-expiry' });
  });
});

describe('resolveFirebaseUid', () => {
  // `aliases` feeds a Firestore DOCUMENT ID, so a malformed value is not a
  // cosmetic problem. These two pin the narrowing; without it the first grants
  // a paid entitlement to a one-character doc belonging to nobody, and the
  // second throws (a 500, so the purchase is lost after 6 delivery attempts).
  it('ignores a STRING aliases instead of spreading it into characters', () => {
    expect(
      resolveFirebaseUid({
        id: 'e',
        type: 'x',
        app_user_id: '$RCAnonymousID:abc',
        aliases: 'user_1234' as unknown as string[],
      }),
    ).toBeUndefined();
  });

  it('ignores a non-array aliases instead of throwing on spread', () => {
    expect(() =>
      resolveFirebaseUid({
        id: 'e',
        type: 'x',
        app_user_id: 'uid-1',
        aliases: 42 as unknown as string[],
      }),
    ).not.toThrow();
  });

  it('prefers a real app_user_id', () => {
    expect(resolveFirebaseUid({ id: 'e', type: 'x', app_user_id: 'uid-1' })).toBe('uid-1');
  });
  it('falls back to a non-anonymous alias', () => {
    expect(
      resolveFirebaseUid({
        id: 'e',
        type: 'x',
        app_user_id: '$RCAnonymousID:abc',
        aliases: ['$RCAnonymousID:abc', 'uid-2'],
      }),
    ).toBe('uid-2');
  });
  it('returns undefined when every id is anonymous', () => {
    expect(
      resolveFirebaseUid({ id: 'e', type: 'x', app_user_id: '$RCAnonymousID:abc' }),
    ).toBeUndefined();
  });

  it('falls back to original_app_user_id when app_user_id and aliases are all anonymous', () => {
    expect(
      resolveFirebaseUid({
        id: 'e',
        type: 'x',
        app_user_id: '$RCAnonymousID:abc',
        aliases: ['$RCAnonymousID:abc'],
        original_app_user_id: 'uid-3',
      }),
    ).toBe('uid-3');
  });

  it('skips an empty-string app_user_id and falls through to a real alias', () => {
    expect(
      resolveFirebaseUid({
        id: 'e',
        type: 'x',
        app_user_id: '',
        aliases: ['uid-4'],
      }),
    ).toBe('uid-4');
  });
});
