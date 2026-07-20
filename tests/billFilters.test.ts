import { describe, it, expect } from 'vitest';
import { billMatchesFilter, recurringMatchesFilter, BillFilter } from '@/utils/billFilters';
import { Bill } from '@/types/bill.types';

// Helpers to build minimal Bill fixtures with a given aggregate settlement status.
// A bill is 'settled' when settledPersonIds.length >= people.length - 1 (or <=1 person),
// 'unsettled' when 0 settled, 'partial' in between.
const settledBill = (): Bill =>
  ({ ownerId: 'owner', people: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], settledPersonIds: ['b', 'c'] } as unknown as Bill);

const unsettledBill = (): Bill =>
  ({ ownerId: 'owner', people: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], settledPersonIds: [] } as unknown as Bill);

const partialBill = (): Bill =>
  ({ ownerId: 'owner', people: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], settledPersonIds: ['b'] } as unknown as Bill);

const OWNER = 'owner';

// Debtor-perspective fixtures: viewer is NOT the owner, so getSettlementStatusForUser
// reads the unsettledParticipantIds branch.
const VIEWER = 'viewer';

const debtorUnsettledBill = (): Bill =>
  ({
    ownerId: OWNER,
    people: [{ id: 'owner' }, { id: 'viewer' }],
    unsettledParticipantIds: [VIEWER],
  } as unknown as Bill);

const debtorSettledBill = (): Bill =>
  ({
    ownerId: OWNER,
    people: [{ id: 'owner' }, { id: 'viewer' }],
    unsettledParticipantIds: [],
  } as unknown as Bill);

// Solo bill: only one person → getSettlementStatus returns 'settled'.
const soloBill = (): Bill =>
  ({ ownerId: OWNER, people: [{ id: 'owner' }], settledPersonIds: [] } as unknown as Bill);

describe('billMatchesFilter', () => {
  describe('settled bill', () => {
    it('matches "all"', () => {
      expect(billMatchesFilter('all', settledBill(), OWNER)).toBe(true);
    });
    it('does NOT match "unsettled"', () => {
      expect(billMatchesFilter('unsettled', settledBill(), OWNER)).toBe(false);
    });
    it('matches "settled"', () => {
      expect(billMatchesFilter('settled', settledBill(), OWNER)).toBe(true);
    });
    it('does NOT match "recurring"', () => {
      expect(billMatchesFilter('recurring', settledBill(), OWNER)).toBe(false);
    });
  });

  describe('unsettled bill', () => {
    it('matches "all"', () => {
      expect(billMatchesFilter('all', unsettledBill(), OWNER)).toBe(true);
    });
    it('matches "unsettled"', () => {
      expect(billMatchesFilter('unsettled', unsettledBill(), OWNER)).toBe(true);
    });
    it('does NOT match "settled"', () => {
      expect(billMatchesFilter('settled', unsettledBill(), OWNER)).toBe(false);
    });
    it('does NOT match "recurring"', () => {
      expect(billMatchesFilter('recurring', unsettledBill(), OWNER)).toBe(false);
    });
  });

  describe('partial bill (counts as unsettled, not settled)', () => {
    it('matches "all"', () => {
      expect(billMatchesFilter('all', partialBill(), OWNER)).toBe(true);
    });
    it('matches "unsettled" (status !== settled)', () => {
      expect(billMatchesFilter('unsettled', partialBill(), OWNER)).toBe(true);
    });
    it('does NOT match "settled"', () => {
      expect(billMatchesFilter('settled', partialBill(), OWNER)).toBe(false);
    });
    it('does NOT match "recurring"', () => {
      expect(billMatchesFilter('recurring', partialBill(), OWNER)).toBe(false);
    });
  });

  describe('debtor perspective (unsettledParticipantIds branch)', () => {
    it('viewer in unsettledParticipantIds → unsettled → matches "unsettled", not "settled"', () => {
      expect(billMatchesFilter('unsettled', debtorUnsettledBill(), VIEWER)).toBe(true);
      expect(billMatchesFilter('settled', debtorUnsettledBill(), VIEWER)).toBe(false);
    });
    it('viewer NOT in unsettledParticipantIds → settled → matches "settled", not "unsettled"', () => {
      expect(billMatchesFilter('settled', debtorSettledBill(), VIEWER)).toBe(true);
      expect(billMatchesFilter('unsettled', debtorSettledBill(), VIEWER)).toBe(false);
    });
  });

  describe('solo bill (people.length <= 1 → settled)', () => {
    it('matches "settled", not "unsettled"', () => {
      expect(billMatchesFilter('settled', soloBill(), OWNER)).toBe(true);
      expect(billMatchesFilter('unsettled', soloBill(), OWNER)).toBe(false);
    });
  });

  describe('no userId fallback (uses getSettlementStatus aggregate)', () => {
    it('settled bill matches "settled" with undefined userId', () => {
      expect(billMatchesFilter('settled', settledBill(), undefined)).toBe(true);
      expect(billMatchesFilter('unsettled', settledBill(), undefined)).toBe(false);
    });
    it('unsettled bill matches "unsettled" with undefined userId', () => {
      expect(billMatchesFilter('unsettled', unsettledBill(), undefined)).toBe(true);
      expect(billMatchesFilter('settled', unsettledBill(), undefined)).toBe(false);
    });
  });
});

describe('recurringMatchesFilter', () => {
  it('matches "all"', () => {
    expect(recurringMatchesFilter('all')).toBe(true);
  });
  it('does NOT match "unsettled"', () => {
    expect(recurringMatchesFilter('unsettled')).toBe(false);
  });
  it('does NOT match "settled"', () => {
    expect(recurringMatchesFilter('settled')).toBe(false);
  });
  it('matches "recurring"', () => {
    expect(recurringMatchesFilter('recurring')).toBe(true);
  });

  it('covers all BillFilter values exhaustively', () => {
    const filters: BillFilter[] = ['all', 'unsettled', 'settled', 'recurring'];
    const results = filters.map(recurringMatchesFilter);
    expect(results).toEqual([true, false, false, true]);
  });
});
