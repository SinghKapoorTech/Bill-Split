import { describe, it, expect } from 'vitest';
import {
  getVenmoUniversalLink,
  getVenmoNativeScheme,
  isValidVenmoHandle,
  sanitizeVenmoHandle,
} from '@/utils/venmo';
import type { VenmoCharge } from '@/types';

/**
 * A-06 — payment redirection via an unescaped `recipientId`.
 *
 * `recipientId` originates from free-text user input (the Venmo handle field in
 * VenmoChargeDialog, and `venmoId` on a friend/shadow-user record that ANOTHER
 * user can set). It is interpolated straight into a payment deep link, so an
 * unescaped `&` lets the value append its own query parameters. Because Venmo
 * reads the LAST occurrence of a repeated parameter, an attacker-controlled
 * handle can silently redirect the payment or rewrite the amount.
 */

const charge = (recipientId: string): VenmoCharge => ({
  recipientId,
  amount: 42.5,
  note: 'Dinner',
  type: 'charge',
});

/** Count how many times a query parameter appears in a URL string. */
function countParam(url: string, key: string): number {
  const query = url.slice(url.indexOf('?') + 1);
  return query.split('&').filter((pair) => pair.split('=')[0] === key).length;
}

describe('A-06 — venmo deep link parameter injection', () => {
  // The payload a hostile handle would carry: it tries to add a second
  // `recipients` (redirect the money) and a second `amount` (change the sum).
  const HOSTILE = 'victim&recipients=attacker&amount=999.00';

  describe.each([
    ['universal link', getVenmoUniversalLink],
    ['native scheme', getVenmoNativeScheme],
  ])('%s', (_label, build) => {
    it('emits exactly one recipients, amount, and note for a hostile recipientId', () => {
      const url = build(charge(HOSTILE));

      expect(countParam(url, 'recipients')).toBe(1);
      expect(countParam(url, 'amount')).toBe(1);
      expect(countParam(url, 'note')).toBe(1);
    });

    it('keeps the caller-supplied amount authoritative', () => {
      const url = build(charge(HOSTILE));
      const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));

      // Not '999.00' — the injected value must never win.
      expect(params.get('amount')).toBe('42.50');
    });

    it('round-trips the hostile handle as a single opaque value', () => {
      const url = build(charge(HOSTILE));
      const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));

      expect(params.get('recipients')).toBe(HOSTILE);
    });

    it.each(['&', '#', '?', '='])('escapes a bare %s in the handle', (ch) => {
      const url = build(charge(`user${ch}x`));
      const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));

      expect(params.get('recipients')).toBe(`user${ch}x`);
      expect(countParam(url, 'note')).toBe(1);
    });

    it('leaves an ordinary handle untouched', () => {
      const url = build(charge('john-smith_1'));

      expect(url).toContain('recipients=john-smith_1');
    });
  });

  it('does not let a "#" truncate the universal link', () => {
    // A raw '#' starts the fragment: everything after it leaves the query,
    // silently dropping amount/note before Venmo ever sees them.
    const url = getVenmoUniversalLink(charge('victim#'));

    expect(url).toContain('amount=42.50');
    expect(url.split('#').length - 1).toBe(0);
  });
});

describe('A-06 — venmo handle validation at persist sites', () => {
  // Venmo's `recipients` accepts a username, an email, OR a phone number, so
  // all three must survive validation. A username-only rule would stop those
  // users saving their profile at all.
  it.each([
    ['username', 'john-smith'],
    ['underscores', 'a_b_c'],
    ['mixed case + digits', 'Jane99'],
    ['contains a period', 'jane.doe'],
    ['email address', 'jane@example.com'],
    ['phone number', '+1(555)123-4567'],
    ['max length', 'x'.repeat(50)],
  ])('accepts %s', (_label, handle) => {
    expect(isValidVenmoHandle(handle)).toBe(true);
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'x'.repeat(51)],
    ['ampersand', 'victim&recipients=attacker'],
    ['space', 'john smith'],
    ['hash', 'john#tag'],
    ['slash', 'a/b/c'],
    ['equals', 'a=b'],
    ['question mark', 'a?b'],
    ['empty', ''],
  ])('rejects %s', (_label, handle) => {
    expect(isValidVenmoHandle(handle)).toBe(false);
  });

  it('strips leading @ and surrounding whitespace', () => {
    expect(sanitizeVenmoHandle('  @john-smith ')).toBe('john-smith');
    expect(sanitizeVenmoHandle('@@doubled')).toBe('doubled');
  });

  it('returns undefined for a handle that cannot be salvaged', () => {
    expect(sanitizeVenmoHandle('victim&recipients=attacker')).toBeUndefined();
    expect(sanitizeVenmoHandle(undefined)).toBeUndefined();
  });
});
