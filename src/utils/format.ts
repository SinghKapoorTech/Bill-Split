/**
 * Formats a number as currency (USD)
 * @param value - The number to format
 * @returns Formatted currency string (e.g., "$12.50")
 */
export function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`;
}

/**
 * Anything a Firestore date can arrive as. Timestamps come back raw from some
 * read paths and already `.toDate()`d from others, so callers should not have
 * to know which.
 */
export type DateLike = { toDate: () => Date } | Date | string | number;

function isTimestampLike(value: DateLike): value is { toDate: () => Date } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  );
}

/**
 * Formats a date as "Mar 4, 2026", or returns null when there is nothing
 * sensible to show.
 *
 * Returning null rather than a string is deliberate: an optional field like
 * `archivedAt` can be missing on documents written before it existed, and a
 * caller that omits the whole line is better than one rendering "Invalid Date"
 * next to a user's event.
 */
export function formatShortDate(value: DateLike | null | undefined): string | null {
  if (value === null || value === undefined) return null;

  let date: Date;
  if (isTimestampLike(value)) {
    date = value.toDate();
  } else if (value instanceof Date) {
    date = value;
  } else {
    date = new Date(value);
  }

  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a date as "10/09/26" (MM/DD/YY), or returns null when there is
 * nothing sensible to show — same null contract as `formatShortDate`.
 *
 * Used for compact list rows (the created date on a bill card), where the
 * "Oct 9, 2026" form is too long next to the amount.
 */
export function formatNumericDate(value: DateLike | null | undefined): string | null {
  const long = formatShortDate(value);
  if (long === null) return null;
  const date = isTimestampLike(value as DateLike)
    ? (value as { toDate: () => Date }).toDate()
    : value instanceof Date
      ? value
      : new Date(value as string | number);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  });
}
