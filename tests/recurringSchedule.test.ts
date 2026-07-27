import { describe, it, expect } from 'vitest';
import {
  firstRunDate,
  advanceRunDate,
  nextRunDates,
  nextRunDateAfterEdit,
} from '@shared/recurringSchedule';

describe('firstRunDate', () => {
  it('snaps a weekly schedule forward to the chosen weekday', () => {
    // 2026-05-01 is a Friday; first Monday on/after is 2026-05-04.
    expect(firstRunDate({ frequency: 'weekly', dayOfWeek: 1, startDate: '2026-05-01' })).toBe(
      '2026-05-04',
    );
  });

  it('keeps the start date when it already matches the weekday', () => {
    // 2026-05-04 is a Monday.
    expect(firstRunDate({ frequency: 'weekly', dayOfWeek: 1, startDate: '2026-05-04' })).toBe(
      '2026-05-04',
    );
  });

  it('biweekly anchors to the chosen weekday like weekly', () => {
    expect(firstRunDate({ frequency: 'biweekly', dayOfWeek: 3, startDate: '2026-05-01' })).toBe(
      '2026-05-06',
    ); // first Wed
  });

  it('monthly uses dayOfMonth in the same month when not yet passed', () => {
    expect(firstRunDate({ frequency: 'monthly', dayOfMonth: 15, startDate: '2026-05-01' })).toBe(
      '2026-05-15',
    );
  });

  it('monthly rolls to next month when the day has already passed', () => {
    expect(firstRunDate({ frequency: 'monthly', dayOfMonth: 15, startDate: '2026-05-20' })).toBe(
      '2026-06-15',
    );
  });

  it('monthly clamps an out-of-range day to the last day of the month', () => {
    // Feb has 28 days in 2026.
    expect(firstRunDate({ frequency: 'monthly', dayOfMonth: 31, startDate: '2026-02-01' })).toBe(
      '2026-02-28',
    );
  });
});

describe('advanceRunDate', () => {
  it('weekly advances by 7 days, preserving the weekday', () => {
    expect(advanceRunDate('2026-05-04', 'weekly')).toBe('2026-05-11');
  });

  it('biweekly advances by 14 days', () => {
    expect(advanceRunDate('2026-05-06', 'biweekly')).toBe('2026-05-20');
  });

  it('monthly advances to the same day next month', () => {
    expect(advanceRunDate('2026-05-15', 'monthly', 15)).toBe('2026-06-15');
  });

  it('monthly clamps when next month is shorter (Jan 31 -> Feb 28)', () => {
    expect(advanceRunDate('2026-01-31', 'monthly', 31)).toBe('2026-02-28');
  });
});

describe('nextRunDates (review preview / backfill enumeration)', () => {
  it('produces the expected Mondays for a weekly schedule', () => {
    expect(nextRunDates({ frequency: 'weekly', dayOfWeek: 1, startDate: '2026-05-01' }, 4)).toEqual(
      ['2026-05-04', '2026-05-11', '2026-05-18', '2026-05-25'],
    );
  });

  it('stops early at endDate', () => {
    const dates = nextRunDates(
      { frequency: 'weekly', dayOfWeek: 1, startDate: '2026-05-01', endDate: '2026-05-12' },
      10,
    );
    expect(dates).toEqual(['2026-05-04', '2026-05-11']);
  });

  it('enumerates monthly occurrences on the chosen day', () => {
    expect(
      nextRunDates({ frequency: 'monthly', dayOfMonth: 1, startDate: '2026-05-01' }, 3),
    ).toEqual(['2026-05-01', '2026-06-01', '2026-07-01']);
  });
});

// Editing a template must never rewind the cursor into already-generated
// history. firstRunDate() re-anchors to the ORIGINAL startDate, and because the
// generator keys idempotency on recurringCycleDate, every past cycle under a
// changed schedule looks brand new and is regenerated as real, settleable debt.
describe('nextRunDateAfterEdit', () => {
  const monthly = (dayOfMonth: number) => ({
    frequency: 'monthly' as const,
    dayOfMonth,
    startDate: '2026-01-01',
  });

  it('never returns a date at or before the last run', () => {
    // Six months of $1200 rent already generated; user moves the 1st -> 15th.
    const next = nextRunDateAfterEdit(monthly(15), '2026-07-26');
    expect(next > '2026-07-26').toBe(true);
    expect(next).toBe('2026-08-15');
  });

  it('does not rewind when the schedule is unchanged', () => {
    expect(nextRunDateAfterEdit(monthly(1), '2026-07-26')).toBe('2026-08-01');
  });

  it('falls back to the first occurrence for a template that never ran', () => {
    expect(nextRunDateAfterEdit(monthly(15), null)).toBe('2026-01-15');
    expect(nextRunDateAfterEdit(monthly(15), undefined)).toBe('2026-01-15');
  });

  it('handles a weekly schedule with a long-past start', () => {
    const next = nextRunDateAfterEdit(
      { frequency: 'weekly', dayOfWeek: 3, startDate: '2020-01-01' },
      '2026-07-26',
    );
    expect(next > '2026-07-26').toBe(true);
    expect(next).toBe('2026-07-29');
  });

  it('respects endDate rather than advancing past it forever', () => {
    const next = nextRunDateAfterEdit(
      { frequency: 'monthly', dayOfMonth: 15, startDate: '2026-01-01', endDate: '2026-03-31' },
      '2026-07-26',
    );
    expect(next > '2026-03-31').toBe(true); // past the end -> generator stops
  });
});
