import { describe, it, expect } from 'vitest';
import {
  ordinal,
  formatScheduleDate,
  describeFrequency,
  formatScheduleSummary,
  getNextBillDates,
  scheduleHasOccurrences,
} from '@/utils/scheduleFormat';

describe('ordinal', () => {
  it('uses st/nd/rd for 1, 2, 3 and their higher counterparts', () => {
    expect([1, 2, 3, 21, 22, 23, 31].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '21st', '22nd', '23rd', '31st',
    ]);
  });

  it('uses th for the 11-13 exception', () => {
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th']);
  });

  it('uses th for everything else', () => {
    expect([4, 7, 15, 30].map(ordinal)).toEqual(['4th', '7th', '15th', '30th']);
  });
});

describe('formatScheduleDate', () => {
  it('formats a schedule date without shifting it across a timezone boundary', () => {
    // Parsed as UTC — a local-time parse would render this as Jul 31 for
    // anyone west of UTC, which is the wrong day entirely.
    expect(formatScheduleDate('2026-08-01')).toBe('Aug 1, 2026');
  });

  it('can omit the year for compact display', () => {
    expect(formatScheduleDate('2026-08-01', { withYear: false })).toBe('Aug 1');
  });
});

describe('describeFrequency', () => {
  it('names the weekday for weekly and biweekly', () => {
    expect(describeFrequency('weekly', 1, 1)).toBe('Every week on Monday');
    expect(describeFrequency('biweekly', 3, 1)).toBe('Every 2 weeks on Wednesday');
  });

  it('uses an ordinal day for monthly', () => {
    expect(describeFrequency('monthly', 0, 1)).toBe('Every month on the 1st');
    expect(describeFrequency('monthly', 0, 22)).toBe('Every month on the 22nd');
  });
});

describe('formatScheduleSummary', () => {
  it('reports the ALIGNED first occurrence, not the raw start date', () => {
    // Start date is the 1st but the schedule fires on the 15th.
    expect(
      formatScheduleSummary({ frequency: 'monthly', dayOfWeek: 0, dayOfMonth: 15, startDate: '2026-05-01' })
    ).toBe('Every month on the 15th, starting May 15, 2026');
  });

  it('appends the end date when set', () => {
    expect(
      formatScheduleSummary({
        frequency: 'monthly', dayOfWeek: 0, dayOfMonth: 1,
        startDate: '2026-05-01', endDate: '2026-08-01',
      })
    ).toBe('Every month on the 1st, starting May 1, 2026 until Aug 1, 2026');
  });
});

describe('getNextBillDates', () => {
  it('lists upcoming aligned occurrences', () => {
    expect(
      getNextBillDates({ frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '2026-05-01' }, 3)
    ).toEqual(['May 4, 2026', 'May 11, 2026', 'May 18, 2026']);
  });

  it('stops at the end date rather than padding to count', () => {
    expect(
      getNextBillDates(
        { frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '2026-05-01', endDate: '2026-05-12' },
        5
      )
    ).toEqual(['May 4, 2026', 'May 11, 2026']);
  });
});

describe('scheduleHasOccurrences', () => {
  it('is true for an ordinary schedule', () => {
    expect(
      scheduleHasOccurrences({ frequency: 'monthly', dayOfWeek: 0, dayOfMonth: 1, startDate: '2026-05-01' })
    ).toBe(true);
  });

  it('is false when the end date falls before the first aligned occurrence', () => {
    // Monthly on the 1st starting May 2 -> first run is Jun 1, past the May 15
    // end date. This template could never generate a bill.
    expect(
      scheduleHasOccurrences({
        frequency: 'monthly', dayOfWeek: 0, dayOfMonth: 1,
        startDate: '2026-05-02', endDate: '2026-05-15',
      })
    ).toBe(false);
  });

  it('is true when the end date leaves room for exactly one occurrence', () => {
    expect(
      scheduleHasOccurrences({
        frequency: 'monthly', dayOfWeek: 0, dayOfMonth: 1,
        startDate: '2026-05-02', endDate: '2026-06-01',
      })
    ).toBe(true);
  });

  it('is false without a start date', () => {
    expect(
      scheduleHasOccurrences({ frequency: 'weekly', dayOfWeek: 1, dayOfMonth: 1, startDate: '' })
    ).toBe(false);
  });
});
