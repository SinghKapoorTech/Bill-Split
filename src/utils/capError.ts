/**
 * Reads the typed cap payload off a rejected Firebase callable.
 *
 * Firebase surfaces `HttpsError` details to the client as `err.details` — plain
 * JSON that has crossed a process boundary, from a function version this build
 * does not control. So the value is validated, never asserted:
 * `isCapErrorDetails` checks every field, not just `reason` (see the note in
 * `shared/capErrors.ts` about "You've used undefined of undefined scans").
 *
 * This runs inside a `catch`, so every unusable VALUE funnels to `null` and the
 * caller falls back to the server's prose message. It is not throw-proof in the
 * absolute sense — an object whose `details` is a throwing getter would
 * propagate — but Firebase's `FunctionsError` carries a plain data property, so
 * that shape cannot arrive here. Guarding it would be defensive code for a case
 * the platform cannot produce.
 *
 * WORKS ON BOTH CAP PATHS, but they get there differently, and the difference
 * matters if either is ever refactored:
 *
 *   - group cap (`createEvent` / `unarchiveEvent`) — the raw callable error
 *     propagates untouched, so `.details` is the platform's own.
 *   - scan quota (`analyzeBill`) — `src/services/gemini.ts` REWRAPS the
 *     rejection to attach a user-facing message. It used to rewrap into a plain
 *     `new Error(...)`, which discarded `.details` and made this function return
 *     `null` for every real scan-quota rejection. It now throws an
 *     `AnalyzeBillError` that carries the payload forward; see
 *     `analyzeBillErrorFrom` in `src/utils/analyzeBillError.ts`. Any new rewrap
 *     on this path must preserve `details` or the wall goes blind again.
 *
 * To decide whether to show an UPGRADE WALL, pass the result through
 * `isPaywallTrigger` from `@shared/capErrors` — do NOT treat a non-null return
 * as "show the paywall". The hourly rate limiter is a valid `CapErrorDetails`
 * and is emphatically not a paywall trigger; it applies to Pro subscribers too.
 */
import { isCapErrorDetails, type CapErrorDetails } from '@shared/capErrors';

export function capDetailsFromError(err: unknown): CapErrorDetails | null {
  if (!err || typeof err !== 'object') return null;

  const details = (err as { details?: unknown }).details;
  return isCapErrorDetails(details) ? details : null;
}
