import { RecurringFrequency } from "@/types/recurring.types";
import { firstRunDate, nextRunDates } from "@shared/recurringSchedule";

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export interface ScheduleParts {
  frequency: RecurringFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  startDate: string;
  endDate?: string;
}

/** "1st", "2nd", "3rd", "11th", "21st" … */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Format a "YYYY-MM-DD" schedule date for display.
 *
 * Parsed AND formatted in UTC, matching the schedule math in
 * @shared/recurringSchedule. Parsing as local time also round-trips correctly
 * so long as it is formatted in local time too, but pinning both ends to UTC
 * keeps the displayed date identical to the date the generator stores, with no
 * dependency on the two halves agreeing.
 */
export function formatScheduleDate(
  date: string,
  opts: { withYear?: boolean } = {},
): string {
  return new Date(date + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(opts.withYear !== false && { year: "numeric" }),
    timeZone: "UTC",
  });
}

/**
 * Today's date as "YYYY-MM-DD" in the user's LOCAL calendar.
 *
 * `new Date().toISOString()` yields the UTC date, which is a day ahead for
 * anyone behind UTC during their evening — so a template created the evening of
 * Jul 20 in the Americas would be stamped Jul 21. Creation stamps must match the
 * day the user actually experienced.
 */
export function localTodayISO(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * Fallback title for a new recurring template, e.g.
 * "Detailed Recurring Expense (Jul 20, 2026)".
 *
 * The wizards seed this so the Next button is never gated on a field the user
 * hasn't been told is required; it stays editable in the hero input.
 */
export function defaultRecurringTitle(
  label: string,
  createdDate: string,
): string {
  return `${label} (${formatScheduleDate(createdDate)})`;
}

/** How often it repeats, e.g. "Every month on the 1st". */
export function describeFrequency(
  frequency: RecurringFrequency,
  dayOfWeek: number,
  dayOfMonth: number,
): string {
  if (frequency === "weekly") return `Every week on ${DAYS_OF_WEEK[dayOfWeek]}`;
  if (frequency === "biweekly")
    return `Every 2 weeks on ${DAYS_OF_WEEK[dayOfWeek]}`;
  return `Every month on the ${ordinal(dayOfMonth)}`;
}

/**
 * Full sentence: frequency + the first ALIGNED occurrence (not the raw start
 * date the user typed) + an optional end.
 */
export function formatScheduleSummary(parts: ScheduleParts): string {
  const { frequency, dayOfWeek, dayOfMonth, startDate, endDate } = parts;
  const first = firstRunDate({
    frequency,
    dayOfWeek,
    dayOfMonth,
    startDate,
    endDate,
  });
  let result = `${describeFrequency(frequency, dayOfWeek, dayOfMonth)}, starting ${formatScheduleDate(first)}`;
  if (endDate) result += ` until ${formatScheduleDate(endDate)}`;
  return result;
}

/** The next `count` occurrence dates, formatted for display. */
export function getNextBillDates(
  parts: ScheduleParts,
  count: number,
): string[] {
  const { frequency, dayOfWeek, dayOfMonth, startDate, endDate } = parts;
  return nextRunDates(
    { frequency, dayOfWeek, dayOfMonth, startDate, endDate },
    count,
  ).map((d) => formatScheduleDate(d));
}

/**
 * Whether this schedule produces at least one bill.
 *
 * False when the end date lands before the first aligned occurrence — e.g.
 * monthly on the 1st, starting May 2, ending May 15: the first run is Jun 1,
 * which is already past the end. Without this check the wizard happily saves a
 * template that can never generate anything.
 */
export function scheduleHasOccurrences(parts: ScheduleParts): boolean {
  const { frequency, dayOfWeek, dayOfMonth, startDate, endDate } = parts;
  if (!startDate) return false;
  return (
    nextRunDates({ frequency, dayOfWeek, dayOfMonth, startDate, endDate }, 1)
      .length > 0
  );
}
