import { describe, it, expect } from 'vitest';
import { describeIncludedExtras } from '@/utils/venmo';

describe('describeIncludedExtras', () => {
  it('names only the extras that are actually on the bill', () => {
    expect(describeIncludedExtras(8, 10, 0)).toBe(' (incl. tax/tip)');
    expect(describeIncludedExtras(8, 0, 0)).toBe(' (incl. tax)');
    expect(describeIncludedExtras(0, 10, 0)).toBe(' (incl. tip)');
    // fees-only bill must NOT claim tax/tip that don't exist
    expect(describeIncludedExtras(0, 0, 5)).toBe(' (incl. fees)');
    expect(describeIncludedExtras(8, 10, 5)).toBe(' (incl. tax/tip/fees)');
  });

  it('returns an empty string when there are no extras', () => {
    expect(describeIncludedExtras(0, 0, 0)).toBe('');
    expect(describeIncludedExtras(undefined, undefined, undefined)).toBe('');
  });
});
