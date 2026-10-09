/**
 * `checkBillInvariants` — I1..I8 from docs/plans/bill-money-invariants.md.
 *
 * Each `it` below names the invariant and, where the bug is historical, the
 * review round that found it. The second describe block is the CONSERVATION
 * THEOREM as property test: for any bill satisfying the stated hypotheses,
 * money must be conserved against the COMPONENT SUM.
 *
 * The oracle matters. Spec revision 1 proposed asserting
 * `Σ personTotals == billData.total`, which is false on a legitimate discount
 * bill (items [100], tax 10, total 90, all assigned => Σ = 110 vs 90). An
 * oracle that fires on correct input gets weakened or deleted, so it is worse
 * than no oracle. The right-hand side is `Σ items + tax + tip + otherFees`.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  checkBillInvariants,
  isBillConsistent,
  summarizeViolations,
  type BillInvariantSubject,
} from '@shared/billInvariants';
import { calculatePersonTotals } from '@shared/calculations';
import type { Person } from '@shared/types';

const P = (id: string): Person => ({ id, name: id });
const codes = (b: BillInvariantSubject) => checkBillInvariants(b).map((v) => v.code);

const bill = (over: Partial<BillInvariantSubject> = {}): BillInvariantSubject => ({
  ownerId: 'owner',
  people: [P('user-owner'), P('user-bob')],
  itemAssignments: { i1: ['user-owner', 'user-bob'] },
  billData: {
    items: [{ id: 'i1', name: 'x', price: 30 }],
    subtotal: 30,
    tax: 0,
    tip: 0,
    otherFees: 0,
    total: 30,
  },
  paidById: 'owner',
  settledPersonIds: [],
  ...over,
});

describe('checkBillInvariants', () => {
  it('passes a well-formed bill', () => {
    expect(checkBillInvariants(bill())).toEqual([]);
    expect(isBillConsistent(bill())).toBe(true);
  });

  it('returns [] for a bill with no people yet (a draft mid-creation)', () => {
    expect(checkBillInvariants(bill({ people: [] }))).toEqual([]);
    expect(checkBillInvariants({})).toEqual([]);
  });

  describe('I1 — assignee closure (the ghost leak; rounds 1, 2, 4a, 4b)', () => {
    it('flags an assignee who is not on the bill', () => {
      const v = checkBillInvariants(
        bill({ itemAssignments: { i1: ['user-owner', 'user-ghost'] } }),
      );
      expect(v.map((x) => x.code)).toContain('I1');
      expect(v.find((x) => x.code === 'I1')!.ids).toEqual(['user-ghost']);
    });

    it('does NOT flag a bare uid against its user- prefixed person', () => {
      // 59% of production bills carry a bare id, and `ensureUserInPeople`
      // rewrites the viewing user's entry in place. Raw comparison here would
      // flag every such bill and (worse) make two clients disagree forever.
      expect(codes(bill({ itemAssignments: { i1: ['owner', 'user-bob'] } }))).not.toContain('I1');
    });

    it('does NOT collapse guest- / person- ids into uids', () => {
      // personIdToFirebaseUid strips only `user-`, so these stay distinct and
      // a guest assignee who is not in `people` is still caught.
      expect(codes(bill({ itemAssignments: { i1: ['person-123'] } }))).toContain('I1');
    });
  });

  describe('I2 — distinctness (found by the SPEC review, not by code)', () => {
    it('flags a duplicate participant under normalization', () => {
      const v = codes(
        bill({
          people: [P('user-owner'), P('owner')],
          itemAssignments: { i1: ['user-owner'] },
        }),
      );
      expect(v).toContain('I2');
    });

    it('flags a duplicate assignee inside one item', () => {
      // Measured: item $30, ['a','a'], people [a,b] => a owes 30, b owes 0,
      // while I1 and participant-distinctness both hold.
      expect(codes(bill({ itemAssignments: { i1: ['user-owner', 'user-owner'] } }))).toContain(
        'I2',
      );
    });

    it('treats the two id FORMS of one person as a duplicate assignee', () => {
      expect(codes(bill({ itemAssignments: { i1: ['owner', 'user-owner'] } }))).toContain('I2');
    });
  });

  describe('I3 — payer is a participant (sweep finding)', () => {
    it('flags a payer who is not on the bill', () => {
      const v = checkBillInvariants(bill({ paidById: 'stranger' }));
      expect(v.map((x) => x.code)).toContain('I3');
      expect(v.find((x) => x.code === 'I3')!.ids).toEqual(['stranger']);
    });

    it('allows the owner as payer even if absent from people', () => {
      expect(
        codes(
          bill({
            ownerId: 'owner',
            people: [P('user-bob'), P('user-carol')],
            itemAssignments: { i1: ['user-bob', 'user-carol'] },
            paidById: 'owner',
          }),
        ),
      ).not.toContain('I3');
    });

    it('compares the payer normalized', () => {
      expect(codes(bill({ paidById: 'user-bob' }))).not.toContain('I3');
      expect(codes(bill({ paidById: 'bob' }))).not.toContain('I3');
    });
  });

  describe('I4 — settledness (the claimShadowUser id-form bug)', () => {
    it('flags a settled id that is not a participant', () => {
      expect(codes(bill({ settledPersonIds: ['nobody'] }))).toContain('I4');
    });

    it('does NOT flag a settled id in the other id form', () => {
      expect(codes(bill({ settledPersonIds: ['bob'] }))).not.toContain('I4');
    });

    it('flags a uid that is both settled and unsettled', () => {
      expect(
        codes(
          bill({
            settledPersonIds: ['user-bob'],
            unsettledParticipantIds: ['bob'],
          }),
        ),
      ).toContain('I4');
    });
  });

  describe('I5 / I6 — derived splits (I6 absence caused round 5)', () => {
    const derived = (over: Partial<BillInvariantSubject> = {}) =>
      bill({
        isSimpleTransaction: true,
        splitEvenly: false,
        people: [P('user-a'), P('user-b')],
        billData: {
          items: [
            { id: 'ia', name: 'a', price: 15 },
            { id: 'ib', name: 'b', price: 15 },
          ],
          subtotal: 30,
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: 30,
        },
        itemAssignments: { ia: ['user-a'], ib: ['user-b'] },
        paidById: 'owner',
        ownerId: 'owner',
        ...over,
      });

    it('passes a coherent derived split', () => {
      // `paidById` is the owner, who is not in people — allowed by I3.
      expect(codes(derived())).toEqual([]);
    });

    it('I5: flags one item per person being violated', () => {
      expect(
        codes(
          derived({
            billData: {
              items: [{ id: 'ia', name: 'a', price: 30 }],
              subtotal: 30,
              tax: 0,
              tip: 0,
              otherFees: 0,
              total: 30,
            },
            itemAssignments: { ia: ['user-a'] },
          }),
        ),
      ).toContain('I5');
    });

    it('I6: flags derived items that do not sum to the subtotal — ROUND 5', () => {
      // The exact round-5 bug: roster rebuilt, amount map stale. $30 bill
      // persisted items summing to $20.
      const v = codes(
        derived({
          billData: {
            items: [
              { id: 'ia', name: 'a', price: 10 },
              { id: 'ib', name: 'b', price: 10 },
            ],
            subtotal: 30,
            tax: 0,
            tip: 0,
            otherFees: 0,
            total: 30,
          },
        }),
      );
      expect(v).toContain('I6');
    });

    it('does NOT apply I5/I6 to a receipt-scanned bill', () => {
      // A scanned bill may legitimately diverge — that is the discount path.
      expect(
        codes(
          bill({
            isSimpleTransaction: false,
            billData: {
              items: [{ id: 'i1', name: 'x', price: 100 }],
              subtotal: 100,
              tax: 10,
              tip: 0,
              otherFees: 0,
              total: 90,
            },
          }),
        ),
      ).not.toContain('I6');
    });
  });

  describe('I7 — usable total (found by the SPEC review)', () => {
    it('flags total 0 while items are positive', () => {
      // splitEvenly treats total as authoritative: every person owes $0 and
      // the ledger reverses the whole footprint. validateBillAmounts passes.
      expect(
        codes(
          bill({
            splitEvenly: true,
            billData: {
              items: [{ id: 'i1', name: 'x', price: 100 }],
              subtotal: 100,
              tax: 0,
              tip: 0,
              otherFees: 0,
              total: 0,
            },
          }),
        ),
      ).toContain('I7');
    });
  });

  describe('I8 — non-degenerate basis (found by the SPEC review)', () => {
    it('flags assigned items whose prices sum to zero', () => {
      // Measured: [+20, -20] with tax 3 tip 2 collects $0.00 of $5.00.
      const v = codes(
        bill({
          billData: {
            items: [
              { id: 'i1', name: 'a', price: 20 },
              { id: 'i2', name: 'b', price: -20 },
            ],
            subtotal: 0,
            tax: 3,
            tip: 2,
            otherFees: 0,
            total: 5,
          },
          itemAssignments: { i1: ['user-owner'], i2: ['user-owner'] },
        }),
      );
      expect(v).toContain('I8');
    });
  });

  it('LAYER 3: tolerates a FieldValue SENTINEL in place of an array', () => {
    // `arrayUnion(...)` is an opaque object, not an array. This module runs
    // inside a Firestore transaction on the client and inside the ledger
    // trigger on the server, so throwing fails the whole operation — settling
    // broke outright on `settled.filter is not a function`. Callers strip
    // sentinels, but this must not depend on them doing so.
    class Sentinel {
      constructor(public op = 'union') {}
    }
    const sentinel = new Sentinel() as unknown as string[];

    expect(() =>
      checkBillInvariants(bill({ settledPersonIds: sentinel })),
    ).not.toThrow();
    expect(codes(bill({ settledPersonIds: sentinel }))).not.toContain('I4');

    expect(() =>
      checkBillInvariants(bill({ unsettledParticipantIds: sentinel })),
    ).not.toThrow();

    expect(() =>
      checkBillInvariants(bill({ people: sentinel as unknown as never })),
    ).not.toThrow();
  });

  it('never throws on malformed input', () => {
    const nasty: BillInvariantSubject[] = [
      { people: [P('a')], itemAssignments: null, billData: null },
      { people: [P('a')], itemAssignments: { i: undefined as never } },
      {
        people: [P('a')],
        billData: {
          items: [{ id: 'i', name: 'n', price: NaN }],
          subtotal: NaN,
          tax: NaN,
          tip: NaN,
          otherFees: NaN,
          total: NaN,
        },
      },
      { people: [P('a')], settledPersonIds: null, unsettledParticipantIds: null },
    ];
    for (const b of nasty) {
      expect(() => checkBillInvariants(b)).not.toThrow();
    }
  });

  it('summarizeViolations is log-safe and non-empty when violations exist', () => {
    expect(summarizeViolations([])).toBe('none');
    const s = summarizeViolations(checkBillInvariants(bill({ paidById: 'x' })));
    expect(s).toContain('I3');
  });
});

describe('CONSERVATION THEOREM (property)', () => {
  // I1 ∧ I2 ∧ I8 ∧ (every item assigned) ∧ ¬splitEvenly
  //   ⟹ Σ personTotals == Σ items + tax + tip + otherFees
  it('a consistent, fully-assigned, non-splitEvenly bill conserves money', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }), // people
        fc.array(fc.integer({ min: 1, max: 50_000 }), { minLength: 1, maxLength: 6 }), // item cents
        fc.integer({ min: 0, max: 10_000 }), // tax cents
        fc.integer({ min: 0, max: 10_000 }), // tip cents
        fc.integer({ min: 0, max: 5_000 }), // fees cents
        fc.array(fc.nat(), { minLength: 1, maxLength: 36 }), // assignment seeds
        (nPeople, itemCents, taxC, tipC, feeC, seeds) => {
          const people = Array.from({ length: nPeople }, (_, i) => P(`user-${i}`));
          const items = itemCents.map((c, i) => ({
            id: `i${i}`,
            name: `i${i}`,
            price: c / 100,
          }));

          // Every item gets at least one DISTINCT assignee, all of whom are
          // people — i.e. I1, I2 and full assignment hold by construction.
          const itemAssignments: Record<string, string[]> = {};
          items.forEach((item, idx) => {
            const count = 1 + ((seeds[idx % seeds.length] ?? 0) % nPeople);
            const start = (seeds[(idx + 1) % seeds.length] ?? 0) % nPeople;
            const picked = new Set<string>();
            for (let k = 0; k < count; k++) {
              picked.add(people[(start + k) % nPeople].id);
            }
            itemAssignments[item.id] = [...picked];
          });

          const subtotal = items.reduce((s, i) => s + i.price, 0);
          const tax = taxC / 100;
          const tip = tipC / 100;
          const otherFees = feeC / 100;
          const componentSum = subtotal + tax + tip + otherFees;

          const subject: BillInvariantSubject = {
            ownerId: 'user-0',
            people,
            itemAssignments,
            paidById: 'user-0',
            settledPersonIds: [],
            splitEvenly: false,
            billData: { items, subtotal, tax, tip, otherFees, total: componentSum },
          };

          // Hypotheses actually hold.
          expect(checkBillInvariants(subject)).toEqual([]);

          const collected = calculatePersonTotals(
            subject.billData!,
            people,
            itemAssignments,
            tip,
            tax,
            otherFees,
          ).reduce((sum, t) => sum + t.total, 0);

          // Oracle is the COMPONENT SUM, not billData.total.
          expect(Math.abs(collected - componentSum)).toBeLessThanOrEqual(0.01);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('a ghost assignee always breaks conservation, and I1 always catches it', () => {
    // The converse direction: whenever money goes missing this way, the
    // checker flags it. This is what makes I1 worth enforcing.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 100, max: 50_000 }),
        (nPeople, cents) => {
          const people = Array.from({ length: nPeople }, (_, i) => P(`user-${i}`));
          const price = cents / 100;
          const assignees = [...people.map((p) => p.id), 'user-ghost'];

          const billData = {
            items: [{ id: 'i1', name: 'x', price }],
            subtotal: price,
            tax: 0,
            tip: 0,
            otherFees: 0,
            total: price,
          };
          const itemAssignments = { i1: assignees };

          expect(
            checkBillInvariants({
              ownerId: 'user-0',
              people,
              itemAssignments,
              paidById: 'user-0',
              billData,
              splitEvenly: false,
            }).map((v) => v.code),
          ).toContain('I1');

          const collected = calculatePersonTotals(
            billData,
            people,
            itemAssignments,
            0,
            0,
            0,
          ).reduce((s, t) => s + t.total, 0);

          // The ghost's 1/(n+1) share is charged to nobody.
          const expectedLoss = price / (nPeople + 1);
          expect(Math.abs(price - collected - expectedLoss)).toBeLessThanOrEqual(0.01);
        },
      ),
      { numRuns: 300 },
    );
  });
});
