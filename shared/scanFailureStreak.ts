/**
 * Pure consecutive-failure tracking for AI receipt scans.
 *
 * The rate limiter reserves a slot BEFORE the Gemini call, deliberately (see
 * shared/scanRateLimit.ts). The cost of that correctness is that a user
 * photographing a crumpled receipt burns their whole window without a single
 * success, and the only thing we tell them is how many scans they get per hour
 * — true, and useless. This module tracks how many times in a row extraction
 * failed so the message can escalate to something the user can act on.
 *
 * This changes the MESSAGE ONLY. It must never gate a scan: the user's route
 * out is submitting a better photo, and blocking that route strands them.
 *
 * The critical distinction is whose fault the failure was:
 *  - Gemini answered but the answer was unusable (unparseable JSON, no items,
 *    malformed item) → 'extraction-failure'. Almost always the image.
 *  - Gemini never answered (transport error, timeout, quota from Google) →
 *    'infrastructure-failure'. Our problem, not theirs. Counting these would
 *    tell a user with a perfectly good photo to go take a better one during
 *    an outage, which is worse than saying nothing.
 *
 * No Firebase imports: this file is compiled into the Cloud Functions build via
 * the functions tsconfig, and is unit-tested from tests/ (never from shared/).
 */

/** Consecutive extraction failures before the message switches to photo guidance. */
export const SCAN_FAILURE_STREAK_CAP = 3;

/**
 * How long a streak survives without a new failure before it is forgotten.
 *
 * Without this the streak is a lifetime tally that only a success can clear:
 * 14 failures last month plus 3 today renders "we couldn't read that receipt
 * after 17 tries", which is both wrong and alarming.
 */
export const SCAN_STREAK_DECAY_MS = 24 * 60 * 60 * 1000;

/**
 * Ceiling on the streak — both the value persisted and the number shown.
 *
 * `SCAN_STREAK_DECAY_MS` alone does not deliver what its rationale above
 * promises. `lastFailureAt` is restamped on EVERY extraction failure, so decay
 * only fires for a user who stops failing for a full 24h. Someone who fails one
 * scan a day for 40 days keeps a live streak the whole time and is told "we
 * couldn't read that receipt after 40 tries" — the lifetime tally again, just
 * reached by a different route. Nearer term, retrying one difficult receipt a
 * dozen times in one sitting renders "after 12 tries".
 *
 * The number exists to make the guidance feel earned, not to be an audit trail.
 * Past a handful of tries it stops informing and starts alarming, so it stops
 * counting. MUST stay >= SCAN_FAILURE_STREAK_CAP or the guidance could never
 * fire; `shouldSuggestDifferentImage` enforces that against a configured cap.
 *
 * Applied on READ as well as on write (see `sanitize`), so the docs already
 * carrying a large tally are repaired in place — no migration.
 */
export const SCAN_FAILURE_STREAK_MAX = 5;

export type ScanOutcome = 'success' | 'extraction-failure' | 'infrastructure-failure';

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Sanitizes a streak read from Firestore. Same posture as `evaluateScanRate`:
 * `usage/{userId}` may predate this field, or hold a partial/non-numeric value.
 *
 * A NaN streak is the dangerous one — `NaN + 1` is NaN forever, and both
 * `NaN >= cap` and `NaN < cap` are false, so the streak would be permanently
 * stuck and the guidance could never fire again for that user. Untrusted values
 * collapse to 0, which costs at most a few extra generic messages and can never
 * strand anyone.
 */
function sanitize(current: number | undefined): number {
  if (!isFiniteNumber(current) || current < 0) {
    return 0;
  }
  // Floored, not rounded: a stored 2.7 must not jump the user to the cap early.
  // Clamped, so neither a legacy tally nor a lost-update drift past the ceiling
  // can ever be reported back to the user. See SCAN_FAILURE_STREAK_MAX.
  return Math.min(Math.floor(current), SCAN_FAILURE_STREAK_MAX);
}

/**
 * Returns the streak to persist after `outcome`.
 *
 * - 'success' → 0. A single good scan clears the slate immediately; the guidance
 *   is about a run of failures, not a lifetime tally.
 * - 'extraction-failure' → current + 1, saturating at SCAN_FAILURE_STREAK_MAX.
 * - 'infrastructure-failure' → current, unchanged (but sanitized, so a corrupt
 *   stored value still gets repaired rather than persisted forever).
 */
export function nextFailureStreak(current: number | undefined, outcome: ScanOutcome): number {
  const base = sanitize(current);

  if (outcome === 'success') {
    return 0;
  }

  if (outcome === 'extraction-failure') {
    // Saturating, not wrapping or unbounded: past the ceiling the user has
    // already been shown the photo guidance for several tries running, and a
    // bigger number tells them nothing new.
    return Math.min(base + 1, SCAN_FAILURE_STREAK_MAX);
  }

  return base;
}

/**
 * Ages out a stored streak: returns 0 once the last failure is older than
 * `decayMs`, and the sanitized streak otherwise.
 *
 * Deliberately SEPARATE from `nextFailureStreak` rather than folded into it.
 * Decay is a property of the stored value (how old is it?), not of the outcome
 * being applied, and the two are composed at the call site — decay first, then
 * apply the outcome — so each stays independently testable.
 *
 * Untrusted like everything else here:
 *  - A missing or non-finite `lastFailureAtMs` means the age cannot be
 *    established — including every `usage/{userId}` doc written before the
 *    field existed, which is exactly the stale-tally case this fixes. Treated
 *    as expired. The cost is at most a few extra generic messages; the streak
 *    rebuilds from the next failure, which does write a timestamp.
 *  - A non-finite `nowMs` gets the same treatment, for the same reason.
 *  - A backwards clock (`nowMs` before the last failure) must NOT reset the
 *    streak — same posture as `evaluateScanRate`, where only forward-elapsed
 *    time expires a window.
 *  - A non-finite or non-positive `decayMs` (the Remote-Config shapes) falls
 *    back to the module default rather than expiring or freezing every streak.
 */
export function decayedStreak(
  current: number | undefined,
  lastFailureAtMs: number | undefined,
  nowMs: number,
  decayMs: number = SCAN_STREAK_DECAY_MS,
): number {
  const base = sanitize(current);
  // Short-circuit BEFORE the timestamp is consulted, deliberately: a streak of
  // zero is already forgotten, so a `lastFailureAt` left behind by an older run
  // of failures (nothing clears it on success) can never revive it.
  if (base === 0) {
    return 0;
  }

  if (!isFiniteNumber(lastFailureAtMs) || !isFiniteNumber(nowMs)) {
    return 0;
  }

  const effectiveDecayMs = isFiniteNumber(decayMs) && decayMs > 0 ? decayMs : SCAN_STREAK_DECAY_MS;

  // Strictly older, so exactly `decayMs` still counts as live.
  return nowMs - lastFailureAtMs > effectiveDecayMs ? 0 : base;
}

/**
 * True once the user has failed extraction `cap` times in a row and should be
 * shown photo guidance instead of the generic parse error.
 *
 * `cap` is a parameter for the same reason the rate limiter's limit is: it will
 * come from Remote Config. A non-finite or sub-1 cap falls back to the module
 * default rather than firing the guidance on the very first failure (cap <= 0
 * would make every streak qualify).
 *
 * The decision is `>= cap`, so clamping the streak at SCAN_FAILURE_STREAK_MAX
 * cannot change it for any cap at or below the ceiling — only the number shown.
 * A cap ABOVE the ceiling would be unreachable and would silently switch the
 * guidance off forever, so it is clamped down to the closest threshold that can
 * actually fire; same posture as every other fallback here, which degrade
 * toward showing the guidance late rather than never.
 */
export function shouldSuggestDifferentImage(
  streak: number,
  cap: number = SCAN_FAILURE_STREAK_CAP,
): boolean {
  const configuredCap = isFiniteNumber(cap) && cap >= 1 ? Math.floor(cap) : SCAN_FAILURE_STREAK_CAP;
  const effectiveCap = Math.min(configuredCap, SCAN_FAILURE_STREAK_MAX);
  return sanitize(streak) >= effectiveCap;
}

/**
 * 4xx statuses where the REQUEST BODY itself is what was rejected, whatever the
 * message says. The body is the image, so these are always about the image.
 */
const PAYLOAD_REJECTED_STATUSES = new Set([413, 415, 422]);

/**
 * Evidence, inside a 400's message, that what Gemini rejected was the image
 * part specifically — the field names it puts in an INVALID_ARGUMENT:
 * "Invalid value at 'contents[0].parts[0].inline_data.mime_type'",
 * "Base64 decoding failed", "Unsupported MIME type: image/bmp".
 */
const IMAGE_REJECTION_EVIDENCE = /inline_?data|mime|base64|image\//i;

/** Narrows anything to a plausible HTTP status, or null. */
function toHttpStatus(value: unknown): number | null {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d{3}$/.test(value.trim())
        ? Number(value.trim())
        : NaN;
  return Number.isInteger(numeric) && numeric >= 100 && numeric <= 599 ? numeric : null;
}

/**
 * Digs an HTTP status out of a thrown value without trusting its shape.
 *
 * The Gemini SDK throws `GoogleGenerativeAIFetchError` with a numeric `status`,
 * but the same call site also sees plain `Error`s, Node network errors
 * (`code: 'ECONNRESET'` — three characters, not three digits, so it narrows to
 * null), and whatever a future SDK version decides to throw. Every lookup is
 * therefore a probe, and the last resort reads the status the SDK bakes into
 * its own message: "...: [400 Bad Request] Invalid value at 'contents'".
 */
function readHttpStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  const source = error as Record<string, unknown>;
  const direct =
    toHttpStatus(source.status) ?? toHttpStatus(source.statusCode) ?? toHttpStatus(source.code);
  if (direct !== null) {
    return direct;
  }

  const response = source.response;
  if (typeof response === 'object' && response !== null) {
    const nested = toHttpStatus((response as Record<string, unknown>).status);
    if (nested !== null) {
      return nested;
    }
  }

  // Anchored on the SDK's own "…: [400 Bad Request] …" prefix. An unanchored
  // \[(\d{3})\] would also match the array indices Google puts in validation
  // messages — "Invalid value at 'contents[0].parts[404]'" would read as a 404.
  if (typeof source.message === 'string') {
    const match = source.message.match(/: \[(\d{3})[ \]]/);
    if (match) {
      return toHttpStatus(match[1]);
    }
  }

  return null;
}

/** Reads `error.message` without trusting the shape. Never throws. */
function readErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return '';
}

/**
 * Classifies a value thrown out of the Gemini call itself.
 *
 * "Anything thrown by generateContent is transport" was too coarse. The SDK
 * also throws for `400 INVALID_ARGUMENT` — corrupt base64, an unsupported MIME
 * type — and that is a statement about the request WE sent, i.e. about the
 * image. Classifying it as infrastructure left the user burning a rate-limit
 * slot per attempt while the streak never advanced, so the photo guidance
 * could never fire and they looped on a raw "[400] ..." forever.
 *
 * It classifies on POSITIVE EVIDENCE ONLY, and "4xx means the user's photo" is
 * not that evidence. 400 is the Generative Language API's catch-all for
 * caller-side problems, and most of them are OURS, not the user's:
 * `API_KEY_INVALID` ("API key not valid. Please pass a valid API key.") is a
 * 400, not a 401; so is `FAILED_PRECONDITION` for an unsupported user location;
 * so is a request-shape rejection after an SDK or model upgrade. Every one of
 * those fails EVERY user's scan at once, and a blanket 4xx→extraction rule
 * would march the whole user base to "we couldn't read that receipt after 3
 * tries. Try a clearer photo" during an outage they cannot do anything about —
 * the precise failure this module was built to prevent.
 *
 * The asymmetry sets the default. Misreading a config outage as the user's
 * fault harms everyone simultaneously and tells them something actively false;
 * misreading an image 400 as infrastructure just leaves that one user where
 * they already were. So ambiguity resolves to infrastructure:
 *
 * - 413/415/422 → 'extraction-failure'. The request body was rejected, and the
 *   body is the image.
 * - 400 whose message names the image part (inline_data, MIME, base64) →
 *   'extraction-failure'. This is the case the fix exists for: an unsupported
 *   MIME type or corrupt base64 out of the picker.
 * - Everything else — other 4xx, 5xx, network errors, timeouts, aborts, and
 *   anything with no readable status → 'infrastructure-failure'.
 *
 * NEVER THROWS. It runs inside `analyzeBill`'s catch block: a getter blowing up
 * on some exotic error object must not replace the real failure with a
 * classification error. An unreadable error defaults to infrastructure, which
 * is the direction that cannot invent evidence about the user's photo.
 */
export function classifyThrownScanError(error: unknown): ScanOutcome {
  let status: number | null;
  let message: string;
  try {
    status = readHttpStatus(error);
    message = readErrorMessage(error);
  } catch {
    return 'infrastructure-failure';
  }

  if (status === null || status < 400 || status >= 500) {
    return 'infrastructure-failure';
  }

  if (PAYLOAD_REJECTED_STATUSES.has(status)) {
    return 'extraction-failure';
  }

  return status === 400 && IMAGE_REJECTION_EVIDENCE.test(message)
    ? 'extraction-failure'
    : 'infrastructure-failure';
}
