import { describe, it, expect } from 'vitest';
import { rebuildLedgerFromBills, type BillLike } from '@shared/reconcileBalances';
import { getFriendBalanceId, getEventBalanceId } from '@shared/ledgerCalculations';

const ALICE = 'alice';
const BOB = 'bob';

/** All eligible-friend/event resolvers just link both UIDs in these fixtures. */
function linkUids(uids: string[]) {
  return () => new Set(uids);
}

function itemizedBill(overrides: Partial<BillLike> = {}): BillLike {
  return {
    id: 'bill-1',
    ownerId: ALICE,
    people: [
      { id: `user-${ALICE}`, name: 'Alice' },
      { id: `user-${BOB}`, name: 'Bob' },
    ],
    billData: {
      items: [{ id: 'item-1', name: 'Pizza', price: 20 }],
      subtotal: 20,
      tax: 2,
      tip: 2,
      otherFees: 0,
      total: 24,
    },
    itemAssignments: { 'item-1': [`user-${ALICE}`, `user-${BOB}`] },
    splitEvenly: false,
    settledPersonIds: [],
    ...overrides,
  };
}

describe('rebuildLedgerFromBills', () => {
  it('(a) a simple 2-person itemized bill produces the correct single pair', () => {
    const { friend, event } = rebuildLedgerFromBills({
      bills: [itemizedBill()],
      resolveFriendUids: linkUids([ALICE, BOB]),
      resolveEventUids: linkUids([ALICE, BOB]),
    });

    expect(event.size).toBe(0);
    expect(friend.size).toBe(1);

    const pairId = getFriendBalanceId(ALICE, BOB); // 'alice_bob'
    const pair = friend.get(pairId)!;
    expect(pair).toBeDefined();
    expect(pair.participants).toEqual([ALICE, BOB]);
    // Alice anchors; Bob owes half of 24 = 12. Alice sorts first → positive.
    expect(pair.balance).toBeCloseTo(12, 2);
    expect(pair.unsettledBillIds).toEqual(['bill-1']);
  });

  it('(b) a settled debtor contributes 0 and is not in unsettledBillIds', () => {
    const { friend } = rebuildLedgerFromBills({
      bills: [itemizedBill({ settledPersonIds: [`user-${BOB}`] })],
      resolveFriendUids: linkUids([ALICE, BOB]),
      resolveEventUids: linkUids([ALICE, BOB]),
    });

    const pairId = getFriendBalanceId(ALICE, BOB);
    const pair = friend.get(pairId);
    // Settled debtor owes 0 → below threshold → not added to the pair's bill list.
    if (pair) {
      expect(pair.balance).toBeCloseTo(0, 2);
      expect(pair.unsettledBillIds).not.toContain('bill-1');
    } else {
      // Acceptable: a zero-contribution bill may leave no pair at all.
      expect(pair).toBeUndefined();
    }
  });

  it('(c) a footprint that would key the anchor itself is excluded (no self-pair)', () => {
    // Solo bill: Alice is both owner/anchor and the only linked person.
    const soloBill = itemizedBill({
      people: [{ id: `user-${ALICE}`, name: 'Alice' }],
      itemAssignments: { 'item-1': [`user-${ALICE}`] },
    });

    const { friend } = rebuildLedgerFromBills({
      bills: [soloBill],
      // resolver deliberately also returns the anchor to prove it's filtered.
      resolveFriendUids: linkUids([ALICE]),
      resolveEventUids: linkUids([ALICE]),
    });

    // No pair should key alice↔alice (self-pair is not writable).
    expect(friend.has(getFriendBalanceId(ALICE, ALICE))).toBe(false);
    expect(friend.size).toBe(0);
  });

  it('(d) an event bill populates both friend and event maps', () => {
    const eventBill = itemizedBill({ id: 'bill-ev', eventId: 'trip-1' });

    const { friend, event } = rebuildLedgerFromBills({
      bills: [eventBill],
      resolveFriendUids: linkUids([ALICE, BOB]),
      resolveEventUids: linkUids([ALICE, BOB]),
    });

    const friendPair = friend.get(getFriendBalanceId(ALICE, BOB))!;
    expect(friendPair).toBeDefined();
    expect(friendPair.balance).toBeCloseTo(12, 2);
    expect(friendPair.unsettledBillIds).toEqual(['bill-ev']);

    const eventPairId = getEventBalanceId('trip-1', ALICE, BOB);
    const eventPair = event.get(eventPairId)!;
    expect(eventPair).toBeDefined();
    expect(eventPair.eventId).toBe('trip-1');
    expect(eventPair.participants).toEqual([ALICE, BOB]);
    expect(eventPair.balance).toBeCloseTo(12, 2);
    expect(eventPair.unsettledBillIds).toEqual(['bill-ev']);
  });
});
