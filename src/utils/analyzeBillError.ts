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

    // resource-exhausted (rate limiter) and failed-precondition messages are
    // written server-side to be shown to the user verbatim - pass them
    // through unwrapped instead of burying them in the generic message below.
    if ((code === 'resource-exhausted' || code === 'failed-precondition') && message) {
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
