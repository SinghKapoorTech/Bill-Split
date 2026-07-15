import { describe, it, expect } from 'vitest';
import {
  personIdToFirebaseUid,
  getFriendBalanceId,
  getEventBalanceId,
  toSingleBalance,
  calculateFriendFootprint,
  BALANCE_THRESHOLD,
} from '@shared/ledgerCalculations';
import type { PersonTotal } from '@shared/types';

describe('personIdToFirebaseUid', () => {
  it('strips the user- prefix', () => {
    expect(personIdToFirebaseUid('user-abc123')).toBe('abc123');
  });

  it('leaves raw UIDs and guest ids untouched', () => {
    expect(personIdToFirebaseUid('abc123')).toBe('abc123');
    expect(personIdToFirebaseUid('person-1700000000')).toBe('person-1700000000');
  });
});

describe('getFriendBalanceId / getEventBalanceId', () => {
  it('is deterministic regardless of argument order', () => {
    expect(getFriendBalanceId('bob', 'alice')).toBe('alice_bob');
    expect(getFriendBalanceId('alice', 'bob')).toBe('alice_bob');
  });

  it('prefixes the event id', () => {
    expect(getEventBalanceId('evt1', 'bob', 'alice')).toBe('evt1_alice_bob');
    expect(getEventBalanceId('evt1', 'alice', 'bob')).toBe('evt1_alice_bob');
  });
});

describe('toSingleBalance', () => {
  it('is positive when the anchor (creditor) sorts first', () => {
    // participants sorted: [alice, bob] — alice owed → balance > 0
    expect(toSingleBalance('alice', 'bob', 25)).toBe(25);
  });

  it('is negative when the anchor sorts second', () => {
    // participants sorted: [alice, bob] — bob owed → balance < 0
    expect(toSingleBalance('bob', 'alice', 25)).toBe(-25);
  });

  it('round-trips: the two views are consistent', () => {
    expect(toSingleBalance('alice', 'bob', 10)).toBe(-toSingleBalance('bob', 'alice', 10));
  });
});

describe('calculateFriendFootprint', () => {
  const personTotal = (personId: string, total: number): PersonTotal => ({
    personId, name: personId, itemsSubtotal: total, tax: 0, tip: 0, otherFees: 0, total,
  });

  const base = {
    people: [{ id: 'user-owner1' }, { id: 'user-friendA' }, { id: 'person-guest' }],
    personTotals: [
      personTotal('user-owner1', 20),
      personTotal('user-friendA', 15.5),
      personTotal('person-guest', 4.5),
    ],
    settledPersonIds: [] as string[],
    linkedFriendUids: new Set(['owner1', 'friendA']),
    ownerId: 'owner1',
    creditorId: 'user-owner1',
  };

  it('records what each linked friend owes the creditor', () => {
    expect(calculateFriendFootprint(base)).toEqual({ friendA: 15.5 });
  });

  it('excludes the creditor and unlinked guests', () => {
    const footprint = calculateFriendFootprint(base);
    expect(footprint).not.toHaveProperty('owner1');
    expect(footprint).not.toHaveProperty('person-guest');
  });

  it('zeroes settled people instead of dropping them', () => {
    const footprint = calculateFriendFootprint({
      ...base,
      settledPersonIds: ['user-friendA'],
    });
    expect(footprint).toEqual({ friendA: 0 });
  });

  it('anchors on paidById when someone other than the owner paid', () => {
    // friendA paid: now the owner owes friendA, and friendA owes nothing.
    const footprint = calculateFriendFootprint({
      ...base,
      creditorId: 'user-friendA',
    });
    expect(footprint).toEqual({ owner1: 20 });
  });
});

describe('BALANCE_THRESHOLD', () => {
  it('is half a cent', () => {
    expect(BALANCE_THRESHOLD).toBe(0.005);
  });
});
