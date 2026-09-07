import { normalizeFunctionsErrorCode } from './analyzeBillError';

/**
 * Surfaces a server-authored callable error message to the user, or falls back
 * to a generic one.
 *
 * WHY THIS EXISTS: the free-tier cap messages are written server-side to be read
 * verbatim — spec §4.3.1 requires the group wall to offer the free escape hatch
 * ("Archive one you're finished with") BEFORE payment. A catch block that
 * replaces that with "Failed to restore event. Please try again." turns a
 * considered offer into a broken-looking app, and the user never learns why.
 *
 * Only codes whose messages are known to be user-facing pass through:
 *
 *   resource-exhausted  — a cap was hit (quota, group limit)
 *   failed-precondition — a state rule blocked it (event archived)
 *   permission-denied   — an ownership rule blocked it
 *
 * Everything else keeps the caller's generic fallback, because raw `internal`
 * messages are stack-adjacent server detail, not copy.
 *
 * `message !== code` guards a real platform behaviour: Cloud Run shedding load
 * returns a 503 whose body is an HTML page rather than the callable JSON error
 * envelope, and the SDK then defaults `message` to the code string itself.
 * Passing that through would render a toast reading, in full, "resource-exhausted".
 * The same guard is in `analyzeBillError.ts` for the same reason.
 */
const PASS_THROUGH_CODES = new Set([
  'resource-exhausted',
  'failed-precondition',
  'permission-denied',
]);

export function messageForCallableError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const { code, message } = error as { code?: string; message?: string };
    const normalized = normalizeFunctionsErrorCode(code);
    if (normalized && PASS_THROUGH_CODES.has(normalized) && message && message !== normalized) {
      return message;
    }
  }
  return fallback;
}
