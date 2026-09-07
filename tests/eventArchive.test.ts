/**
 * Unit tests for the pure event-archive predicates.
 *
 * The load-bearing case is the MISSING field. Every event document written
 * before this feature existed has no `archived` key, and Firestore's
 * `where('archived','==',false)` does not match those documents. If any read
 * path treated "missing" as anything other than ACTIVE, every pre-existing
 * event would vanish from every user's list.
 */
import { describe, it, expect } from 'vitest';
import { isEventArchived, partitionEvents } from '@shared/eventArchive';

describe('isEventArchived', () => {
  it('treats a MISSING archived field as active (legacy documents)', () => {
    expect(isEventArchived({})).toBe(false);
  });

  it('treats an explicit undefined as active', () => {
    expect(isEventArchived({ archived: undefined })).toBe(false);
  });

  it('treats archived: false as active', () => {
    expect(isEventArchived({ archived: false })).toBe(false);
  });

  it('treats archived: true as archived', () => {
    expect(isEventArchived({ archived: true })).toBe(true);
  });

  it('does NOT treat a non-boolean truthy value as archived', () => {
    // Only a literal `true` counts. A stray string from a bad write must not
    // silently hide an event from its owner.
    expect(isEventArchived({ archived: 'yes' } as unknown as { archived?: boolean })).toBe(false);
    expect(isEventArchived({ archived: 1 } as unknown as { archived?: boolean })).toBe(false);
  });

  it('treats a falsy non-boolean as active', () => {
    expect(isEventArchived({ archived: null } as unknown as { archived?: boolean })).toBe(false);
    expect(isEventArchived({ archived: 0 } as unknown as { archived?: boolean })).toBe(false);
  });
});

describe('partitionEvents', () => {
  const a = { id: 'a' };
  const b = { id: 'b', archived: true };
  const c = { id: 'c', archived: false };
  const d = { id: 'd', archived: true };

  it('splits archived from active', () => {
    const { active, archived } = partitionEvents([a, b, c, d]);
    expect(active.map((e) => e.id)).toEqual(['a', 'c']);
    expect(archived.map((e) => e.id)).toEqual(['b', 'd']);
  });

  it('preserves input order within each bucket', () => {
    const { active, archived } = partitionEvents([d, c, b, a]);
    expect(active.map((e) => e.id)).toEqual(['c', 'a']);
    expect(archived.map((e) => e.id)).toEqual(['d', 'b']);
  });

  it('does not mutate its input array or elements', () => {
    const input = [a, b, c];
    const snapshot = JSON.stringify(input);
    partitionEvents(input);
    expect(input).toHaveLength(3);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('returns the same object references, not copies', () => {
    const { active, archived } = partitionEvents([a, b]);
    expect(active[0]).toBe(a);
    expect(archived[0]).toBe(b);
  });

  it('handles an empty list', () => {
    expect(partitionEvents([])).toEqual({ active: [], archived: [] });
  });

  it('puts an all-legacy list entirely in active', () => {
    const { active, archived } = partitionEvents([{ id: '1' }, { id: '2' }, { id: '3' }]);
    expect(active).toHaveLength(3);
    expect(archived).toHaveLength(0);
  });
});
