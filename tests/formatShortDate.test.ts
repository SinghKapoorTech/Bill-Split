/**
 * formatShortDate is the reader for optional Firestore date fields such as
 * `archivedAt`. Those fields are missing on every document written before they
 * existed, and they arrive raw from some read paths and already `.toDate()`d
 * from others — so the load-bearing cases here are the absent and the
 * unparseable ones, which must yield null (caller omits the line) rather than
 * the string "Invalid Date" rendered next to a user's event.
 */
import { describe, it, expect } from 'vitest';
import { formatShortDate } from '@/utils/format';

/** Stands in for a Firestore Timestamp without pulling in the SDK. */
function fakeTimestamp(date: Date) {
  return { toDate: () => date };
}

describe('formatShortDate', () => {
  const march4 = new Date(2026, 2, 4); // local time — matches toLocaleDateString

  it('formats a Firestore-style Timestamp', () => {
    expect(formatShortDate(fakeTimestamp(march4))).toBe('Mar 4, 2026');
  });

  it('formats a plain Date', () => {
    expect(formatShortDate(march4)).toBe('Mar 4, 2026');
  });

  it('formats epoch millis', () => {
    expect(formatShortDate(march4.getTime())).toBe('Mar 4, 2026');
  });

  it('returns null for undefined (field never written)', () => {
    expect(formatShortDate(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(formatShortDate(null)).toBeNull();
  });

  it('returns null for an unparseable string instead of "Invalid Date"', () => {
    expect(formatShortDate('not a date')).toBeNull();
  });

  it('returns null when a Timestamp-shaped object yields an invalid date', () => {
    expect(formatShortDate(fakeTimestamp(new Date(NaN)))).toBeNull();
  });

  it('returns null when toDate() does not return a Date at all', () => {
    const bogus = { toDate: () => 'nope' } as unknown as { toDate: () => Date };
    expect(formatShortDate(bogus)).toBeNull();
  });
});
