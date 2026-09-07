import { describe, it, expect } from 'vitest';
import { reconcilePeopleWithServer } from '@/utils/peopleMerge';
import type { Person } from '@/types';

const owner: Person = { id: 'user-owner', name: 'Owner' };
const alice: Person = { id: 'p-alice', name: 'Alice' };
const bob: Person = { id: 'p-bob', name: 'Bob' };

describe('reconcilePeopleWithServer', () => {
  it('adopts the server array verbatim when nothing is in flight', () => {
    // Verbatim adoption is deliberate: a merge-by-id would resurrect someone
    // deleted elsewhere, trading data loss for data resurrection.
    const r = reconcilePeopleWithServer([owner, alice], [owner], new Set());
    expect(r.people).toEqual([owner]);
    expect([...r.pendingIds]).toEqual([]);
  });

  it('re-attaches a local addition whose write has not round-tripped yet', () => {
    const r = reconcilePeopleWithServer(
      [owner, alice],
      [owner],
      new Set(['p-alice']),
    );
    expect(r.people).toEqual([owner, alice]);
    expect([...r.pendingIds]).toEqual(['p-alice']);
  });

  it('clears a pending id once the server confirms it', () => {
    const r = reconcilePeopleWithServer(
      [owner, alice],
      [owner, alice],
      new Set(['p-alice']),
    );
    expect(r.people).toEqual([owner, alice]);
    expect([...r.pendingIds]).toEqual([]);
  });

  it('keeps a server-side addition alongside a still-pending local one', () => {
    const r = reconcilePeopleWithServer(
      [owner, alice],
      [owner, bob],
      new Set(['p-alice']),
    );
    expect(r.people).toEqual([owner, bob, alice]);
  });

  it('honours a REMOVAL even while something else is in flight', () => {
    // owner+bob locally, server dropped bob, alice still pending.
    const r = reconcilePeopleWithServer(
      [owner, bob, alice],
      [owner],
      new Set(['p-alice']),
    );
    expect(r.people).toEqual([owner, alice]);
    expect(r.people.find((p) => p.id === 'p-bob')).toBeUndefined();
  });

  it('does not mutate the caller’s pending set', () => {
    const pending = new Set(['p-alice']);
    reconcilePeopleWithServer([owner, alice], [owner, alice], pending);
    expect([...pending]).toEqual(['p-alice']);
  });

  it('never emits a duplicate id', () => {
    const r = reconcilePeopleWithServer(
      [owner, alice],
      [owner, alice],
      new Set(['p-alice']),
    );
    expect(new Set(r.people.map((p) => p.id)).size).toBe(r.people.length);
  });
});
