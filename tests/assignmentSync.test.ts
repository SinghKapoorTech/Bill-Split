/**
 * `needsAssignmentResync` — the split-evenly self-heal predicate, and the
 * TWO-CLIENT FIXPOINT it has to satisfy.
 *
 * This is the concurrency layer of the test strategy
 * (docs/plans/bill-money-invariants.md section 5). It needs no emulator and no
 * browser: the bug it guards is a *logic* bug about two clients disagreeing,
 * not a timing bug.
 *
 * THE BUG THIS EXISTS FOR. `ensureUserInPeople` rewrites **only the viewing
 * user's own** entry from a bare `<uid>` to `user-<uid>`, in place, on every
 * load — and the self-heal persists `itemAssignments` WITHOUT the normalized
 * `people`. So two clients hold different rosters for the same humans. With a
 * raw-string predicate:
 *
 *   A sees people [user-abc, user-B], stored assignees ['abc','user-B']
 *     -> 'abc' looks foreign -> A writes ['user-abc','user-B']
 *   B sees people [abc, user-B], now reads ['user-abc','user-B']
 *     -> 'user-abc' looks foreign -> B writes ['abc','user-B']
 *   ... forever, each round trip re-firing ledgerProcessor.
 *
 * The property is therefore not "the predicate is correct" but
 * **"the two clients share a fixpoint"**: after either one writes, NEITHER
 * wants to write again. A test that only checked one client would have passed
 * against the broken version.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { needsAssignmentResync } from '@/utils/assignmentSync';
import type { BillItem, Person } from '@/types';

const P = (id: string): Person => ({ id, name: id });
const items: BillItem[] = [{ id: 'i1', name: 'x', price: 30 }];

/** What `ensureUserInPeople` does: normalize ONLY this viewer's entry. */
const asSeenBy = (stored: Person[], viewerUid: string): Person[] =>
  stored.map((p) =>
    p.id === viewerUid || p.id === `user-${viewerUid}` ? { ...p, id: `user-${viewerUid}` } : p,
  );

describe('needsAssignmentResync — basic contract', () => {
  const people = [P('user-a'), P('user-b')];

  it('is false when assignments already match the roster', () => {
    expect(needsAssignmentResync(items, { i1: ['user-a', 'user-b'] }, people)).toBe(false);
  });

  it('is true when an item has no assignment at all', () => {
    expect(needsAssignmentResync(items, {}, people)).toBe(true);
  });

  it('is true when someone is missing (count mismatch)', () => {
    expect(needsAssignmentResync(items, { i1: ['user-a'] }, people)).toBe(true);
  });

  it('is true for a GHOST assignee at the right count', () => {
    expect(needsAssignmentResync(items, { i1: ['user-a', 'user-ghost'] }, people)).toBe(true);
  });

  it('is true for a DUPLICATE assignee at the right count', () => {
    // ['a','a'] against [a,b]: right length, every id a member — yet b owes $0
    // and a is charged twice. Length+membership alone cannot see this.
    expect(needsAssignmentResync(items, { i1: ['user-a', 'user-a'] }, people)).toBe(true);
  });

  it('is true for a duplicate at a HIGHER count — needs the length check', () => {
    // ['a','b','a'] against people [a,b]: distinct-count matches (2 == 2) and
    // every id is a member, so only the LENGTH check sees it. Found by a
    // surviving mutant: removing `assigned.length !== roster.length` left
    // every other test green.
    expect(
      needsAssignmentResync(items, { i1: ['user-a', 'user-b', 'user-a'] }, people),
    ).toBe(true);
  });

  it('is true when an extra member is assigned twice in mixed id forms', () => {
    expect(
      needsAssignmentResync(items, { i1: ['a', 'user-b', 'user-a'] }, people),
    ).toBe(true);
  });

  it('is FALSE across an id-form rewrite — the same human either way', () => {
    expect(needsAssignmentResync(items, { i1: ['a', 'user-b'] }, people)).toBe(false);
    expect(needsAssignmentResync(items, { i1: ['user-a', 'b'] }, people)).toBe(false);
  });

  it('does not collapse guest- / person- ids into uids', () => {
    expect(needsAssignmentResync(items, { i1: ['user-a', 'person-123'] }, people)).toBe(true);
  });

  it('is false with no people (nothing to sync against yet)', () => {
    expect(needsAssignmentResync(items, {}, [])).toBe(false);
  });
});

describe('TWO-CLIENT FIXPOINT (property) — the write-storm class', () => {
  it('neither client wants to rewrite what the other just wrote', () => {
    fc.assert(
      fc.property(
        // A roster of 2..5 people, each stored in either id form.
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
        fc.nat(),
        fc.nat(),
        (bareFlags, viewerSeedA, viewerSeedB) => {
          const n = bareFlags.length;
          const uids = Array.from({ length: n }, (_, i) => `uid${i}`);

          // The STORED roster: a realistic mix of bare and prefixed ids.
          const stored = uids.map((u, i) => P(bareFlags[i] ? u : `user-${u}`));

          const viewerA = uids[viewerSeedA % n];
          const viewerB = uids[viewerSeedB % n];

          const rosterA = asSeenBy(stored, viewerA);
          const rosterB = asSeenBy(stored, viewerB);

          // Whatever A would write, B must accept — and vice versa.
          const writtenByA = { i1: rosterA.map((p) => p.id) };
          const writtenByB = { i1: rosterB.map((p) => p.id) };

          expect(needsAssignmentResync(items, writtenByA, rosterA)).toBe(false);
          expect(needsAssignmentResync(items, writtenByA, rosterB)).toBe(false);
          expect(needsAssignmentResync(items, writtenByB, rosterB)).toBe(false);
          expect(needsAssignmentResync(items, writtenByB, rosterA)).toBe(false);

          // And the stored form itself is already acceptable to both, so no
          // client writes merely because it loaded the bill.
          const asStored = { i1: stored.map((p) => p.id) };
          expect(needsAssignmentResync(items, asStored, rosterA)).toBe(false);
          expect(needsAssignmentResync(items, asStored, rosterB)).toBe(false);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('a real change is still detected by BOTH clients, not swallowed', () => {
    // The fixpoint must not be achieved by making the predicate blind.
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 2, maxLength: 5 }),
        fc.nat(),
        (bareFlags, viewerSeed) => {
          const n = bareFlags.length;
          const uids = Array.from({ length: n }, (_, i) => `uid${i}`);
          const stored = uids.map((u, i) => P(bareFlags[i] ? u : `user-${u}`));
          const viewer = uids[viewerSeed % n];
          const roster = asSeenBy(stored, viewer);

          // Someone genuinely new joined and is not assigned yet.
          const joined = [...roster, P('user-newcomer')];
          const staleAssignments = { i1: roster.map((p) => p.id) };
          expect(needsAssignmentResync(items, staleAssignments, joined)).toBe(true);

          // A genuine ghost at the correct count.
          const ghosted = {
            i1: [...roster.slice(0, n - 1).map((p) => p.id), 'user-ghost'],
          };
          expect(needsAssignmentResync(items, ghosted, roster)).toBe(true);
        },
      ),
      { numRuns: 400 },
    );
  });
});
