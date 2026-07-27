import { describe, it, expect } from 'vitest';
import {
  isWritableBalancePair,
  isBalanceSettledConsistent,
  sanitizeFootprint,
  BALANCE_THRESHOLD,
} from '@shared/ledgerCalculations';

describe('isWritableBalancePair', () => {
  it('rejects self-pairs (a === b)', () => {
    expect(isWritableBalancePair('uid-abc', 'uid-abc')).toBe(false);
  });

  it('rejects ids starting with "user-"', () => {
    expect(isWritableBalancePair('user-abc123', 'realuid456')).toBe(false);
    expect(isWritableBalancePair('realuid456', 'user-abc123')).toBe(false);
  });

  it('rejects ids starting with "guest-"', () => {
    expect(isWritableBalancePair('guest-abc', 'realuid456')).toBe(false);
    expect(isWritableBalancePair('realuid456', 'guest-abc')).toBe(false);
  });

  it('rejects ids starting with "person-"', () => {
    expect(isWritableBalancePair('person-1700000000', 'realuid456')).toBe(false);
    expect(isWritableBalancePair('realuid456', 'person-1700000000')).toBe(false);
  });

  it('rejects the literal "anonymous"', () => {
    expect(isWritableBalancePair('anonymous', 'realuid456')).toBe(false);
    expect(isWritableBalancePair('realuid456', 'anonymous')).toBe(false);
  });

  it('rejects empty strings', () => {
    expect(isWritableBalancePair('', 'realuid456')).toBe(false);
    expect(isWritableBalancePair('realuid456', '')).toBe(false);
  });

  it('accepts two distinct plausible Firebase UIDs', () => {
    expect(isWritableBalancePair('abc123XYZ', 'def456UVW')).toBe(true);
  });
});

describe('isBalanceSettledConsistent', () => {
  it('returns true for (0, []) — zero balance, no unsettled bills', () => {
    expect(isBalanceSettledConsistent(0, [])).toBe(true);
  });

  it('returns false for (0, ["b"]) — zero balance but has an unsettled bill', () => {
    expect(isBalanceSettledConsistent(0, ['b'])).toBe(false);
  });

  it('returns true for (5, ["b"]) — non-zero balance with an unsettled bill', () => {
    expect(isBalanceSettledConsistent(5, ['b'])).toBe(true);
  });

  it('returns false for (5, []) — non-zero balance but no unsettled bills', () => {
    expect(isBalanceSettledConsistent(5, [])).toBe(false);
  });

  it('returns true for a balance just below BALANCE_THRESHOLD with no unsettled bills', () => {
    // 0.004 < 0.005 → treated as zero → must have zero bills
    expect(isBalanceSettledConsistent(0.004, [])).toBe(true);
  });

  it('returns false for a balance just above BALANCE_THRESHOLD with no unsettled bills', () => {
    // 0.01 >= 0.005 → not near zero → must have at least one bill
    expect(isBalanceSettledConsistent(0.01, [])).toBe(false);
  });

  it('uses BALANCE_THRESHOLD consistently (negative side)', () => {
    // -0.004 is also near zero
    expect(isBalanceSettledConsistent(-0.004, [])).toBe(true);
    expect(isBalanceSettledConsistent(-0.01, [])).toBe(false);
  });
});

describe('sanitizeFootprint', () => {
  it('drops the anchor key itself', () => {
    const input = { anchorUid: 100, debtorUid: 50 };
    const result = sanitizeFootprint(input, 'anchorUid');
    expect(result).not.toHaveProperty('anchorUid');
  });

  it('keeps valid debtor entries with their values intact', () => {
    const input = { anchorUid: 100, debtorA: 30.5, debtorB: 20 };
    const result = sanitizeFootprint(input, 'anchorUid');
    expect(result).toEqual({ debtorA: 30.5, debtorB: 20 });
  });

  it('drops keys that fail isWritableBalancePair (synthetic prefixes, anonymous, empty)', () => {
    const input = {
      anchorUid: 10,
      'user-abc': 5,
      'guest-xyz': 3,
      'person-1234': 7,
      anonymous: 8,
      realDebtorUid: 15,
    };
    const result = sanitizeFootprint(input, 'anchorUid');
    expect(result).not.toHaveProperty('user-abc');
    expect(result).not.toHaveProperty('guest-xyz');
    expect(result).not.toHaveProperty('person-1234');
    expect(result).not.toHaveProperty('anonymous');
    expect(result).toEqual({ realDebtorUid: 15 });
  });

  it('does not mutate the input object', () => {
    const input = { anchorUid: 99, debtorA: 10 };
    const before = { ...input };
    sanitizeFootprint(input, 'anchorUid');
    expect(input).toEqual(before);
  });

  it('returns an empty object when all entries are invalid', () => {
    const input = { anchorUid: 10, 'user-foo': 5 };
    expect(sanitizeFootprint(input, 'anchorUid')).toEqual({});
  });

  it('returns an empty object for an empty footprint', () => {
    expect(sanitizeFootprint({}, 'anchorUid')).toEqual({});
  });
});

// Sanity-check that BALANCE_THRESHOLD is the expected value (used in the tests above)
describe('BALANCE_THRESHOLD (contract)', () => {
  it('is 0.005', () => {
    expect(BALANCE_THRESHOLD).toBe(0.005);
  });
});
