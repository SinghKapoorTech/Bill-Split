import { describe, it, expect } from 'vitest';
import { mergePeopleAdditions } from '@/utils/peopleMerge';
import type { Person } from '@/types';

const owner: Person = { id: 'user-owner', name: 'Owner' };
const alice: Person = { id: 'p-alice', name: 'Alice' };
const bob: Person = { id: 'p-bob', name: 'Bob' };

describe('mergePeopleAdditions', () => {
  it('appends people who are not already present', () => {
    expect(mergePeopleAdditions([owner], [alice, bob])).toEqual([owner, alice, bob]);
  });

  it('skips someone already in the current array', () => {
    expect(mergePeopleAdditions([owner, alice], [alice])).toEqual([owner, alice]);
  });

  it('deduplicates WITHIN the added batch', () => {
    // A double-tap on Add resolves to the same shadow id twice; both calls
    // return a non-null Person, so a batch can carry the duplicate.
    expect(mergePeopleAdditions([owner], [alice, alice])).toEqual([owner, alice]);
  });

  it('never emits a duplicate id, even across both sources', () => {
    const result = mergePeopleAdditions([owner, alice], [alice, bob, bob, owner]);
    expect(result.map((p) => p.id)).toEqual(['user-owner', 'p-alice', 'p-bob']);
    expect(new Set(result.map((p) => p.id)).size).toBe(result.length);
  });

  it('does not mutate its inputs', () => {
    const current = [owner];
    const added = [alice];
    mergePeopleAdditions(current, added);
    expect(current).toEqual([owner]);
    expect(added).toEqual([alice]);
  });
});
