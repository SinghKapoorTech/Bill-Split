import { capDetailsFromError } from '@/utils/capError';
import type { CapErrorDetails } from '@shared/capErrors';

/**
 * Error mapping for the `analyzeBill` Cloud Function callable. Kept separate
 * from `src/services/gemini.ts` so it can be unit tested without pulling in
 * the Firebase app/functions initialization that module performs at import
 * time.
 */

/**
 * The Firebase Functions client SDK prefixes callable error codes with
 * `functions/` (e.g. `functions/unauthenticated`), unlike the raw
 * `FunctionsErrorCode` values (`unauthenticated`) used server-side. Strip
 * that prefix so comparisons below actually match.
 */
export function normalizeFunctionsErrorCode(code: string | undefined): string | undefined {
  return code?.startsWith('functions/') ? code.slice('functions/'.length) : code;
}

/**
 * Maps an error thrown by the `analyzeBill` callable invocation to the
 * user-facing message that should be shown for it.
 */
export function mapAnalyzeBillError(error: unknown): string {
  // Handle Firebase Functions errors
  if (error && typeof error === 'object') {
    // Check for specific error codes
    const typedError = error as { code?: string; message?: string };
    const code = normalizeFunctionsErrorCode(typedError.code);
    const message = typedError.message;

    if (code === 'unauthenticated') {
      return 'Please sign in to analyze receipts';
    }

    if (code === 'invalid-argument') {
      return 'Invalid image format. Please upload a valid receipt image';
    }

    if (code === 'deadline-exceeded') {
      return 'Analysis timed out. The receipt might be too complex or the service is busy. Please try again.';
    }

    // resource-exhausted (rate limiter), failed-precondition (photo guidance)
    // and unavailable (limiter fail-closed) messages are written server-side to
    // be shown to the user verbatim - pass them through unwrapped instead of
    // burying them in the generic message below. Without `unavailable` here the
    // limiter's own "Scanning is temporarily unavailable. Please try again in a
    // moment." renders as "Failed to analyze receipt: Scanning is temporarily
    // unavailable..." - a sentence that contradicts itself.
    //
    // `message !== code` because these codes are NOT exclusively server-authored.
    // The platform emits them too: Cloud Run shedding load returns a 503 whose
    // body is an HTML page, not the callable JSON error envelope, and the client
    // SDK then defaults `message` to the code string. Passing that through would
    // make the entire toast read "unavailable" (or "resource-exhausted"). Those
    // fall to the wrapped generic below, which at least frames them.
    if (
      (code === 'resource-exhausted' || code === 'failed-precondition' || code === 'unavailable') &&
      message &&
      message !== code
    ) {
      return message;
    }

    if (message) {
      return `Failed to analyze receipt: ${message}`;
    }
  }

  if (error instanceof Error) {
    return `Failed to analyze receipt: ${error.message}`;
  }

  return 'Failed to analyze receipt. Please try again.';
}

/**
 * An `analyzeBill` failure that keeps its structured cap payload.
 *
 * WHY THIS IS NOT JUST `new Error(message)`: the callable rejects with an
 * `HttpsError` whose `details` distinguishes three conditions that all share
 * the `resource-exhausted` code — the hourly abuse limiter, the monthly
 * free-tier quota, and (on other callables) the group cap. Rewrapping into a
 * plain `Error` discarded that payload, so the client could only tell them
 * apart by reading the prose, and the scan-quota wall could not be built at
 * all.
 *
 * `message` is unchanged from `mapAnalyzeBillError` — it remains the whole
 * user-facing story, and `details` rides alongside for code that needs to
 * decide WHICH wall to draw. Subclassing `Error` (rather than attaching a
 * property to one) keeps `instanceof Error` true for existing consumers such as
 * `useReceiptAnalyzer`'s toast.
 */
export class AnalyzeBillError extends Error {
  readonly details?: CapErrorDetails;

  constructor(message: string, details?: CapErrorDetails) {
    super(message);
    this.name = 'AnalyzeBillError';
    this.details = details;
  }
}

/**
 * Builds the error `analyzeBillImage` should throw from whatever the callable
 * rejected with.
 *
 * The payload is VALIDATED, never asserted — `capDetailsFromError` drops
 * anything malformed to `undefined` so a field lost in transit, or a response
 * from an older deployed function, degrades to the prose message rather than
 * rendering "You've used undefined of undefined scans".
 *
 * Callers deciding whether to show an upgrade wall must pass `details` through
 * `isPaywallTrigger`: the hourly rate limiter produces a valid payload here and
 * is emphatically NOT a paywall trigger.
 */
export function analyzeBillErrorFrom(error: unknown): AnalyzeBillError {
  return new AnalyzeBillError(mapAnalyzeBillError(error), capDetailsFromError(error) ?? undefined);
}
