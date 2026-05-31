/**
 * Pure recurring-schedule date math, shared by the client (wizard preview +
 * seeding nextRunDate) and the Cloud Function generator. All math is UTC-based
 * on "YYYY-MM-DD" strings so client and server agree regardless of timezone.
 *
 * Occurrence rule: the first bill lands on the first day that matches the
 * chosen dayOfWeek (weekly/biweekly) or dayOfMonth (monthly) ON OR AFTER the
 * start date; subsequent bills advance one cycle from there.
 */

export type RecurringFrequency = 'weekly' | 'biweekly' | 'monthly';

export interface RecurringScheduleConfig {
  frequency: RecurringFrequency;
  dayOfWeek?: number; // 0 (Sun) – 6 (Sat), for weekly/biweekly
  dayOfMonth?: number; // 1–31, for monthly
  startDate: string; // "YYYY-MM-DD"
  endDate?: string; // optional "YYYY-MM-DD"
}

function parse(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00Z');
}

function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}

/** Clamp a day-of-month to the number of days in the given month. */
function clampDayOfMonth(year: number, monthIndex: number, dayOfMonth: number): number {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Math.min(dayOfMonth, lastDay);
}

/**
 * First occurrence on or after startDate, aligned to the schedule's
 * dayOfWeek (weekly/biweekly) or dayOfMonth (monthly).
 */
export function firstRunDate(schedule: RecurringScheduleConfig): string {
  const start = parse(schedule.startDate);

  if (schedule.frequency === 'monthly') {
    const dom = schedule.dayOfMonth ?? start.getUTCDate();
    const candidateDay = clampDayOfMonth(start.getUTCFullYear(), start.getUTCMonth(), dom);
    // Same month works if the (clamped) target day hasn't already passed.
    if (candidateDay >= start.getUTCDate()) {
      return fmt(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), candidateDay)));
    }
    // Otherwise roll to next month.
    const nextYear = start.getUTCMonth() === 11 ? start.getUTCFullYear() + 1 : start.getUTCFullYear();
    const nextMonth = (start.getUTCMonth() + 1) % 12;
    const nextDay = clampDayOfMonth(nextYear, nextMonth, dom);
    return fmt(new Date(Date.UTC(nextYear, nextMonth, nextDay)));
  }

  // weekly / biweekly: snap forward to the chosen weekday (0 = same day).
  const targetDow = schedule.dayOfWeek ?? start.getUTCDay();
  const diff = (targetDow - start.getUTCDay() + 7) % 7;
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + diff);
  return fmt(d);
}

/**
 * Advance one cycle from an already-aligned date. Monthly clamps to the last
 * day of the target month (e.g. the 31st becomes Feb 28).
 */
export function advanceRunDate(
  dateStr: string,
  frequency: RecurringFrequency,
  dayOfMonth?: number
): string {
  const d = parse(dateStr);

  if (frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else if (frequency === 'biweekly') {
    d.setUTCDate(d.getUTCDate() + 14);
  } else {
    // Monthly: advance to the same day next month, clamped to the last day.
    // Set day to 1 first to avoid month overflow (e.g. Jan 31 → Mar 3).
    const targetDay = dayOfMonth ?? d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(targetDay, lastDay));
  }

  return fmt(d);
}

/**
 * The next `count` occurrence dates starting at firstRunDate, stopping early
 * at endDate. Used by the wizard's review preview.
 */
export function nextRunDates(schedule: RecurringScheduleConfig, count: number): string[] {
  const dates: string[] = [];
  let current = firstRunDate(schedule);
  for (let i = 0; i < count; i++) {
    if (schedule.endDate && current > schedule.endDate) break;
    dates.push(current);
    current = advanceRunDate(current, schedule.frequency, schedule.dayOfMonth);
  }
  return dates;
}
