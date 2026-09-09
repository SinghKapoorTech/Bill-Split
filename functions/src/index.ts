/**
 * Firebase Cloud Functions for Divit
 *
 * Securely handles Gemini AI API calls server-side to protect API keys
 * and manages trip invitations
 */

// MUST be the first import: it applies the global maxInstances ceiling, and
// firebase-functions snapshots global options when each function is DEFINED.
// Any module imported before this one registers its triggers uncapped.
import './globalOptions.js';

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { reserveScanSlot, recordScanOutcome } from './scanRateLimiter.js';
import { checkScanQuota, commitScanQuotaUsage } from './scanQuotaLimiter.js';
import { getMonetizationLimits } from './remoteConfigLimits.js';
import { getEffectiveEntitlement } from './entitlementService.js';
import type { ScanQuotaDecision } from '../../shared/scanQuota.js';
import type { CapErrorDetails } from '../../shared/capErrors.js';
import { describeDuration, describeWindow } from '../../shared/scanRateLimit.js';
import {
  MAX_RECEIPT_AMOUNT,
  isPersistableAmount,
  isPersistableItemPrice,
  itemSumIsCoherent,
} from '../../shared/receiptAmounts.js';
import {
  classifyThrownScanError,
  shouldSuggestDifferentImage,
  type ScanOutcome,
} from '../../shared/scanFailureStreak.js';

// Initialize Firebase Admin
initializeApp();

// Define secret for Gemini API key
const geminiApiKey = defineSecret('GEMINI_API_KEY');

/**
 * Hard ceiling on the inbound receipt payload, in bytes of DECODED image data.
 *
 * This is a cost/abuse safety net, not a quality limit. Sizing rationale:
 *  - Web uploads are compressed to ~1MB client-side (`useFileUpload.ts`).
 *  - Native camera captures are NOT compressed (`useImagePicker.ts` uses
 *    `Camera.getPhoto({ quality: 90 })` with no width cap) and legitimately
 *    produce 3–7MB on a modern phone. A tighter cap would reject real scans.
 *  - Firebase callables reject >10MB requests at the platform layer anyway.
 * So this bounds a hostile caller without breaking the native scan path.
 */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Represents a single line item on the bill
 */
interface BillItem {
  id?: string;
  name: string;
  price: number;
}

/**
 * Complete bill data structure returned from extraction
 */
interface BillData {
  items: BillItem[];
  subtotal: number;
  tax: number;
  tip: number;
  otherFees: number;
  total: number;
  restaurantName?: string;
}

/**
 * Request data for analyzeBill function
 */
interface AnalyzeBillRequest {
  base64Image: string;
}

/**
 * Gemini answered, but the answer was unusable — unparseable JSON, no items, a
 * malformed item, missing numeric fields.
 *
 * This exists purely to separate "the image was bad" from "the call failed".
 * Both surface to the user as a failed scan, but only this class counts toward
 * the consecutive-failure streak: a Gemini outage must never escalate a user
 * with a perfectly good photo to "take a clearer photo".
 */
class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExtractionError';
  }
}

/**
 * Cloud Function: Analyze restaurant bill using Gemini AI
 *
 * This function receives a base64-encoded image of a receipt,
 * sends it to Google Gemini AI for analysis, and returns structured bill data.
 *
 * The Gemini API key is stored securely in Firebase secrets and never exposed to clients.
 */
export const analyzeBill = onCall<AnalyzeBillRequest>(
  {
    secrets: [geminiApiKey],
    timeoutSeconds: 120,
    memory: '512MiB',
    // Tighter than the global ceiling: every instance is a paid Gemini call,
    // so this is the one function where runaway concurrency costs real money
    // per invocation rather than just compute time.
    maxInstances: 10,
  },
  async (request) => {
    // Validate request
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { base64Image } = request.data;

    if (!base64Image || typeof base64Image !== 'string') {
      throw new HttpsError('invalid-argument', 'base64Image must be a non-empty string');
    }

    if (!base64Image.startsWith('data:image/')) {
      throw new HttpsError(
        'invalid-argument',
        'base64Image must be a data URI with image MIME type',
      );
    }

    // Reject oversized payloads BEFORE spending a Gemini call on them. Base64
    // inflates by 4/3, so decoded bytes ≈ (length of the data segment) * 3/4.
    const commaIndex = base64Image.indexOf(',');
    if (commaIndex === -1) {
      throw new HttpsError(
        'invalid-argument',
        'base64Image must be a data URI with a base64 payload',
      );
    }
    const approxBytes = Math.floor(((base64Image.length - commaIndex - 1) * 3) / 4);
    if (approxBytes > MAX_IMAGE_BYTES) {
      logger.warn('analyzeBill: payload rejected as oversized', {
        uid: request.auth.uid,
        approxBytes,
        limit: MAX_IMAGE_BYTES,
      });
      throw new HttpsError(
        'invalid-argument',
        `Image is too large (${Math.round(approxBytes / 1024 / 1024)}MB). Maximum is ${MAX_IMAGE_BYTES / 1024 / 1024}MB.`,
      );
    }

    // Per-user abuse limit. Applies to every plan — this is not the business
    // quota (see chunk 3), it is the backstop that stops a script looping the
    // endpoint. The slot is reserved BEFORE the Gemini call so that a caller
    // who deliberately errors cannot bypass it.
    const uid = request.auth.uid;

    // The limiter's own failures are its own error. Previously this call sat
    // outside every try: a transaction that exhausted its retries propagated
    // raw, Firebase relabelled it `internal`, and the logs could not tell it
    // apart from a Gemini failure.
    let rate: Awaited<ReturnType<typeof reserveScanSlot>>;
    try {
      rate = await reserveScanSlot(uid);
    } catch (error) {
      // FAIL CLOSED, deliberately. Letting the scan through when the limiter is
      // broken hands an attacker a trivial bypass (break the limiter, scan
      // freely) and every allowed scan is a paid Gemini call. A brief outage of
      // scanning is cheaper than an unbounded bill.
      logger.error('analyzeBill: scan rate limiter unavailable', { uid, error });
      throw new HttpsError(
        'unavailable',
        'Scanning is temporarily unavailable. Please try again in a moment.',
      );
    }

    if (!rate.allowed) {
      logger.warn('analyzeBill: rate limit exceeded', {
        uid,
        limit: rate.effectiveLimit,
        windowMs: rate.effectiveWindowMs,
        retryAfterMs: rate.retryAfterMs,
      });
      // Built from the values the decision actually used, never from the module
      // constants: with a Remote-Config limit of 10 the old sentence promised 30,
      // and with a 15-minute window it said "per hour" while retryAfterMs — from
      // the same decision — correctly said 15 minutes.
      //
      // Both halves render through the shared helpers. The retry hint used to be
      // hardcoded to minutes, so a 30-second window produced "per 30 seconds.
      // Try again in 1 minute" — a hint twice as long as the whole window.
      throw new HttpsError(
        'resource-exhausted',
        `Too many scans. You can scan up to ${rate.effectiveLimit} receipts per ${describeWindow(rate.effectiveWindowMs)}. Try again in ${describeDuration(rate.retryAfterMs)}.`,
        // NOT a paywall trigger. This limiter is anti-abuse and applies to Pro
        // too; the client uses `reason` to show "slow down" rather than an
        // upgrade offer it would be a lie to show a paying user.
        { reason: 'scan-rate-limit', retryAfterMs: rate.retryAfterMs } satisfies CapErrorDetails,
      );
    }

    // ── Monthly free-tier scan quota (spec §4.2, §5.4) ────────────────────
    //
    // A DIFFERENT MECHANISM from the hourly limiter above, and the two must not
    // be merged. That one is anti-abuse, applies to Pro too, and KEEPS the slot
    // on failure so "deliberately error to scan for free" is closed. This one is
    // the business cap: checked here, and consumed only after a scan actually
    // succeeds, so a failed scan never costs the user one of their monthly scans.
    //
    // Checked BEFORE the Gemini call — never after. Blocking someone once the
    // receipt has been framed, photographed and uploaded is infuriating, and
    // paying for a Gemini call we then refuse is worse.
    //
    // This is ENFORCEMENT ONLY. Spec §4.3.1 also requires the scan entry point
    // to be VISIBLY gated at zero so the user never frames a photo they cannot
    // spend — that UI is chunk 6 and does not exist yet. Until it does, a free
    // user at their limit meets this error at the moment they submit, which is
    // exactly the experience §4.3.1 calls the worst conversion moment there is.
    // That is survivable only because enforcement ships DARK.
    //
    // Order matters: the abuse limiter runs FIRST so that an attacker cannot use
    // quota rejections as a free, unlimited oracle.
    let quota: (ScanQuotaDecision & { degraded: boolean }) | null = null;
    try {
      // Parallel: independent reads, both on the hot path of a paid call.
      const [limits, entitlement] = await Promise.all([
        getMonetizationLimits(),
        getEffectiveEntitlement(uid),
      ]);

      // Pro and Trip Pass have unlimited scans. Skip the read entirely — a
      // paying user should never pay latency for a limit that cannot apply.
      if (!entitlement.unlimited) {
        const decision = await checkScanQuota(uid, limits.freeScansPerMonth);

        if (!decision.allowed) {
          if (limits.paywallEnabled) {
            // `resource-exhausted` so the client mapper passes this message
            // through VERBATIM. Under `internal` it would render as
            // "Failed to analyze receipt: You've used all 5..." — framing an
            // offer as a server bug.
            throw new HttpsError(
              'resource-exhausted',
              `You've used all ${decision.limit} free scans this month. ` +
                // Prose, not an ISO date. "resets on 2026-10-01" reads like a log
              // line; spec §4.3.1 wants the reset date to make the cap feel like
              // a rhythm rather than a wall. UTC because the period boundary is
              // UTC — rendering it in the server's local zone could name the
              // wrong day.
              `Your scans reset on ${new Date(decision.resetsAtMs).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
                timeZone: 'UTC',
              })}. ` +
                `Upgrade to Pro for unlimited scanning.`,
              // The client renders a typed wall from these numbers; the prose
              // above stays as the fallback copy.
              {
                reason: 'scan-quota',
                used: decision.used,
                limit: decision.limit,
                resetsAtMs: decision.resetsAtMs,
              } satisfies CapErrorDetails,
            );
          }
          // DARK: evaluate, log, allow. This line is how the cap gets tuned
          // before it is ever enforced — it says how many real users would
          // have been stopped, and at what count.
          logger.info('analyzeBill: scan quota would block (enforcement dark)', {
            uid,
            used: decision.used,
            limit: decision.limit,
            plan: entitlement.plan,
          });
        }

        // Held for the commit on the success path below. Committing here would
        // charge the user for a scan that has not happened yet.
        quota = decision;
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      // FAILS OPEN, unlike the abuse limiter above. This is a business cap, not
      // a security control, and the abuse limiter has already bounded the blast
      // radius at 30 scans/hour. Locking a user out of the product over a
      // bookkeeping read is the strictly worse failure.
      logger.error('analyzeBill: scan quota check failed, allowing scan', {
        uid,
        error: error instanceof Error ? error.message : String(error),
      });
      quota = null;
    }

    try {
      // Initialize Gemini AI with secret API key
      const genAI = new GoogleGenerativeAI(geminiApiKey.value());
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

      const prompt = `Extract restaurant bill data from this image. Return ONLY valid JSON (no markdown):

{
  "restaurantName": "Restaurant Name",
  "items": [{"name": "Item", "price": 10.99}],
  "subtotal": 50.00,
  "tax": 4.50,
  "tip": 10.00,
  "total": 68.99
}

Rules:
- Extract the restaurant name if visible; omit or set null if not found
- "items" must contain ONLY food and drink ordered — do NOT include fees, taxes, tips, or any charges as items
- Split quantities into separate items (e.g., "2x Burger" → two entries at the individual price)
- Use individual item prices, not totals
- All numeric values must be numbers, never null or strings
- "subtotal" must equal the sum of all item prices
- "total" is the final total printed on the receipt`;

      // Detect MIME type from base64 string
      const mimeMatch = base64Image.match(/^data:([^;]+);base64,/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const base64Data = base64Image.split(',')[1];

      const imagePart = {
        inlineData: {
          data: base64Data,
          mimeType: mimeType,
        },
      };

      // Call Gemini AI. A throw from generateContent itself is transport —
      // network, timeout, Google-side quota — and stays an infrastructure failure.
      const result = await model.generateContent([prompt, imagePart]);

      // Reading the candidate is a different thing: the request already
      // succeeded, so a throw here is a SAFETY/RECITATION block or an empty
      // candidate, which is a property of the image we sent. Classifying that
      // as infrastructure would leave a user whose photo Gemini refuses to read
      // looping forever without ever reaching the guidance.
      let text: string;
      try {
        const response = await result.response;
        text = response.text();
      } catch (responseError) {
        throw new ExtractionError(
          `Gemini returned no usable response: ${responseError instanceof Error ? responseError.message : 'Unknown error'}`,
        );
      }

      // Clean up the response - remove markdown code blocks if present
      let cleanedText = text.trim();
      cleanedText = cleanedText.replace(/^```json\s*/g, '').replace(/^```\s*/g, '');
      cleanedText = cleanedText.replace(/```\s*$/g, '');
      cleanedText = cleanedText.trim();

      // NOTE: do not log `text` / `cleanedText` / `billData` on the success path.
      // They contain the restaurant name and every line item and price from the
      // user's receipt. Cloud Logging is a separate retention store with its own
      // access control that no bill deletion or account deletion reaches, so
      // logging them there creates an undeletable spending profile per user.
      // Log shape only.
      let parsed: unknown;
      try {
        parsed = JSON.parse(cleanedText);
      } catch (parseError) {
        // Shape only — `cleanedText` is the receipt's contents.
        console.error('JSON parsing failed.', {
          responseLength: cleanedText.length,
          startsWith: cleanedText.slice(0, 12),
        });
        throw new ExtractionError(
          `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        );
      }

      // `null`, `42` and `[]` are all valid JSON, and `null` is a plausible
      // model answer to "this is not a receipt". Every one of them reaches
      // `billData.items` and throws a raw TypeError, which would be classified
      // as an infrastructure failure — the exact opposite of the truth.
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        // Shape only — `cleanedText` is the receipt's contents.
        console.error('Non-object JSON response.', {
          parsedType: parsed === null ? 'null' : typeof parsed,
          isArray: Array.isArray(parsed),
          responseLength: cleanedText.length,
        });
        throw new ExtractionError('Invalid response: expected a JSON object');
      }

      const billData = parsed as BillData;

      // Validate the data structure BEFORE mapping over it: a response with no
      // `items` key used to throw a TypeError out of `.map`, which is
      // indistinguishable from a transport failure when classifying the outcome.
      if (!billData.items || !Array.isArray(billData.items)) {
        // Shape only — `billData` is the receipt's contents.
        console.error('Invalid items array.', {
          itemsType: typeof billData.items,
          isArray: Array.isArray(billData.items),
          topLevelKeys: Object.keys(billData ?? {}),
        });
        throw new ExtractionError('Invalid response: items array is missing');
      }

      // Add unique IDs to each item
      billData.items = billData.items.map((item, index) => ({
        ...item,
        id: `item-${index}-${Date.now()}`,
      }));

      if (billData.items.length === 0) {
        throw new ExtractionError('No items found on the receipt');
      }

      // Validate each item has required fields.
      //
      // Same tightening as the totals gate below, minus the non-negative rule:
      // a comp or discount line legitimately reads as a negative item price, and
      // rejecting those would fail real receipts. `Number.isFinite` subsumes the
      // old `typeof === 'number'` check and additionally rejects the Infinity /
      // NaN that JSON.parse can produce, which no downstream sum survives.
      // `name` needs the same treatment as `price`: a bare truthiness check
      // passes objects and arrays (`!{}` and `![]` are both false), so a
      // model-supplied `{"name": {"x": 1}}` would reach Firestore and render as
      // "[object Object]" inside the Venmo note built by generateItemDescription.
      for (const item of billData.items) {
        if (
          typeof item.name !== 'string' ||
          item.name.trim().length === 0 ||
          !isPersistableItemPrice(item.price)
        ) {
          // Shape only — `item` carries the item's name and price.
          console.error('Invalid item structure.', {
            nameType: typeof item?.name,
            priceType: typeof item?.price,
          });
          throw new ExtractionError('Invalid item structure: missing name or unusable price');
        }
      }

      // Cross-field sanity: per-field ceilings let every amount pass while one
      // hallucinated item price still dominates the bill. Person totals come
      // from the ITEM LIST, not from `total`, so that bogus item is the number
      // the user is actually charged and nothing downstream re-checks it.
      const itemSum = billData.items.reduce((sum, item) => sum + item.price, 0);
      if (!itemSumIsCoherent(itemSum, billData.total)) {
        // Shape only — the sum and total ARE receipt amounts. The ratio is
        // what makes this diagnosable (a hallucinated magnitude is orders out),
        // and it discloses nothing about what the meal cost.
        console.error('Item sum incoherent with printed total.', {
          ratio: billData.total > 0 ? Math.round((itemSum / billData.total) * 100) / 100 : null,
          itemCount: billData.items.length,
        });
        throw new ExtractionError(
          'Extracted item prices do not add up to the receipt total',
        );
      }

      // Normalize tip field - handle null, undefined, or non-numeric values
      if (billData.tip === null || billData.tip === undefined || typeof billData.tip !== 'number') {
        billData.tip = 0;
      }

      // Validate the numeric fields BEFORE otherFees is derived from them.
      //
      // Order is load-bearing: the derivation is arithmetic on these four
      // values and `(Infinity).toFixed(2)` is the string "Infinity", which
      // parseFloat turns straight back into Infinity — so running the gate
      // afterwards left otherFees poisoned even once the gate was tightened.
      //
      // A value that fails here is an EXTRACTION failure, not a bug: the scan
      // used to "succeed" on it, which reset the failure streak to 0, pushed an
      // unusable bill to the client, and got refused at bill creation with a
      // message the user could do nothing about.
      const amounts: Array<[string, unknown]> = [
        ['subtotal', billData.subtotal],
        ['tax', billData.tax],
        ['tip', billData.tip],
        ['total', billData.total],
      ];
      const unusable = amounts.filter(([, value]) => !isPersistableAmount(value));
      if (unusable.length > 0) {
        // Shape only — which fields failed and their types, never the amounts.
        console.error('Unusable numeric fields.', {
          failed: unusable.map(([field]) => field),
          subtotal: typeof billData.subtotal,
          tax: typeof billData.tax,
          tip: typeof billData.tip,
          total: typeof billData.total,
        });
        // Numbers are rendered (Infinity/NaN/-5 are the useful diagnostics and
        // String() is total on them); anything else reports only its TYPE.
        // Never `String(value)` on a model-supplied object: it THROWS for
        // `JSON.parse('{"total":{"toString":1}}')` ("Cannot convert object to
        // primitive value"), and that TypeError would escape this
        // ExtractionError and be reclassified as an infrastructure failure —
        // inverting the very classification this gate exists to get right. It
        // would also echo an unbounded model-controlled string to the client.
        throw new ExtractionError(
          `Invalid response: unusable numeric fields (${unusable
            .map(([field, value]) => `${field}=${typeof value === 'number' ? value : typeof value}`)
            .join(', ')}). Each must be a finite number between 0 and ${MAX_RECEIPT_AMOUNT}.`,
        );
      }

      // Derive otherFees from the printed total rather than relying on AI
      // extraction. Every input is now finite and within [0, MAX_RECEIPT_AMOUNT],
      // so the result is too.
      billData.otherFees = parseFloat(
        Math.max(0, billData.total - billData.subtotal - billData.tax - billData.tip).toFixed(2),
      );

      // One good scan clears the slate immediately — the guidance is about a run
      // of failures, not a lifetime tally.
      await recordScanOutcome(uid, 'success');

      // Consume one monthly scan — ONLY here, on the success path. Every failure
      // route below returns without reaching this line, which is precisely what
      // makes a failed scan free (spec §4.3.1). `quota` is null for unlimited
      // plans and when the check itself failed open; both correctly skip it.
      if (quota) {
        await commitScanQuotaUsage(uid, quota);
      }

      return billData;
    } catch (error) {
      console.error('Error analyzing bill:', error);

      if (error instanceof HttpsError) {
        throw error;
      }

      // Only evidence about the user's photo may advance the streak. An
      // ExtractionError is that by construction — Gemini answered and the
      // answer was unusable. Everything else is classified by HTTP status
      // rather than assumed to be transport: the SDK also throws for
      // `400 INVALID_ARGUMENT` (corrupt base64, an unsupported MIME type —
      // reachable, since the server only checks the `data:image/` prefix while
      // the picker builds the URI from whatever format it got), and treating
      // that as infrastructure left the user burning a slot per attempt with a
      // streak that never advanced and guidance that could never fire.
      // See classifyThrownScanError for which 4xx stay infrastructure.
      const outcome: ScanOutcome =
        error instanceof ExtractionError ? 'extraction-failure' : classifyThrownScanError(error);

      // Only an extraction failure touches Firestore. An infrastructure failure
      // must leave the stored streak alone anyway, and this runs inside a
      // 120s-budget handler that has usually just spent most of that budget on
      // a hanging Gemini call — an extra read here purely to log a number can
      // push the callable past its deadline and replace the real error with an
      // opaque `deadline-exceeded`.
      const streak =
        outcome === 'extraction-failure' ? await recordScanOutcome(uid, outcome) : null;

      logger.error('analyzeBill: scan failed', {
        uid,
        outcome,
        ...(streak !== null && { consecutiveFailures: streak }),
      });

      // MESSAGE ONLY — the scan is deliberately NOT blocked at the cap. The
      // user's way out is submitting a better photo, so that path must stay
      // open, and the success branch above resets the streak the moment it works.
      //
      // `failed-precondition`, not `internal`: the client error mapper passes
      // that code's message through verbatim, whereas `internal` gets re-wrapped
      // as "Failed to analyze receipt: <message>" — which would bury this
      // guidance behind a prefix and make it indistinguishable from a real
      // server bug, since genuine bugs also throw `internal` below.
      if (streak !== null && shouldSuggestDifferentImage(streak)) {
        throw new HttpsError(
          'failed-precondition',
          `We couldn't read that receipt after ${streak} tries. Try a clearer photo: good lighting, receipt flat, whole receipt in frame.`,
        );
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new HttpsError('internal', `Failed to analyze receipt: ${errorMessage}`);
    }
  },
);

/**
 * Request data for inviteMemberToEvent function
 */
interface InviteMemberRequest {
  eventId: string;
  email: string;
}

/**
 * Cloud Function: Invite a member to an event by email
 *
 * This function checks if a user with the given email exists:
 * - If yes: Adds them directly to the event's memberIds
 * - If no: Adds email to pendingInvites for when they sign up
 */
export const inviteMemberToEvent = onCall<InviteMemberRequest>(async (request) => {
  // Validate authentication
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { eventId, email } = request.data;
  const inviterId = request.auth.uid;

  // Validate input
  if (!eventId || !email) {
    throw new HttpsError('invalid-argument', 'eventId and email are required');
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new HttpsError('invalid-argument', 'Invalid email format');
  }

  try {
    const db = getFirestore();
    const eventRef = db.collection('events').doc(eventId);
    const eventDoc = await eventRef.get();

    if (!eventDoc.exists) {
      throw new HttpsError('not-found', 'Event not found');
    }

    const eventData = eventDoc.data();

    if (!eventData) {
      throw new HttpsError('not-found', 'Event data not found');
    }

    // Check if inviter is a member of the event
    if (!eventData.memberIds || !eventData.memberIds.includes(inviterId)) {
      throw new HttpsError('permission-denied', 'Only event members can invite others');
    }

    // Check if user with this email already exists
    let userRecord;
    try {
      const auth = getAuth();
      userRecord = await auth.getUserByEmail(email);
    } catch (error: unknown) {
      // User doesn't exist yet
      if ((error as { code?: string }).code !== 'auth/user-not-found') {
        throw error;
      }
    }

    if (userRecord) {
      // User exists - add them directly to the trip
      const userId = userRecord.uid;

      // Check if already a member
      if (eventData.memberIds.includes(userId)) {
        throw new HttpsError('already-exists', 'User is already a member of this event');
      }

      // Add user to event
      const { FieldValue } = await import('firebase-admin/firestore');
      await eventRef.update({
        memberIds: FieldValue.arrayUnion(userId),
        pendingInvites: FieldValue.arrayRemove(email),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        userExists: true,
        message: `${email} has been added to the event`,
      };
    } else {
      // User doesn't exist - add to pending invites
      const pendingInvites = eventData.pendingInvites || [];

      // Check if already invited
      if (pendingInvites.includes(email)) {
        throw new HttpsError('already-exists', 'This email has already been invited');
      }

      // Get inviter info
      const auth = getAuth();
      const inviterRecord = await auth.getUser(inviterId);
      const inviterName = inviterRecord.displayName || inviterRecord.email || 'Someone';

      // Add to pending invites
      const { FieldValue } = await import('firebase-admin/firestore');
      await eventRef.update({
        pendingInvites: FieldValue.arrayUnion(email),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Create invitation record
      await db.collection('eventInvitations').add({
        eventId,
        eventName: eventData.name,
        email,
        invitedBy: inviterId,
        invitedByName: inviterName,
        invitedAt: FieldValue.serverTimestamp(),
        status: 'pending',
      });

      // TODO: Send invitation email here using nodemailer or Firebase Extensions
      // For now, we'll just store the invitation

      return {
        success: true,
        userExists: false,
        message: `Invitation sent to ${email}`,
      };
    }
  } catch (error) {
    console.error('Error inviting member:', error);

    if (error instanceof HttpsError) {
      throw error;
    }

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new HttpsError('internal', `Failed to invite member: ${errorMessage}`);
  }
});

/**
 * Cloud Function: Ledger Pipeline
 *
 * Firestore onDocumentWritten trigger on bills/{billId}.
 * Handles all ledger mutations server-side: balances (authoritative)
 * and event_balances per-pair docs (delta-based).
 */
export { ledgerProcessor } from './ledgerProcessor.js';

/**
 * Cloud Function: Friend Add Processor
 *
 * Firestore onDocumentUpdated trigger on users/{userId}.
 * When a user adds a new friend, retroactively triggers the ledger pipeline
 * for all shared bills between the two users, backfilling balances.
 */
export { friendAddProcessor } from './friendAddProcessor.js';

/**
 * Cloud Function: Event Delete Processor
 *
 * Firestore onDocumentDeleted trigger on events/{eventId}.
 * Cascade-deletes orphaned bills, event_balances pair docs, and invitations.
 * Bill deletions auto-trigger the ledger pipeline to reverse balances.
 */
export { eventDeleteProcessor } from './eventDeleteProcessor.js';

/**
 * Cloud Function: Settle all outstanding bills with a friend.
 *
 * Reads unsettledBillIds from balances, marks each bill settled,
 * zeros the balance, and writes a settlement record — all in one transaction.
 */
export const processSettlement = onCall<import('./settlementProcessor.js').SettleRequest>(
  { timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { processSettlementCore } = await import('./settlementProcessor.js');
    return processSettlementCore(request.auth.uid, request.data);
  },
);

/**
 * Cloud Function: Settle all outstanding bills with a friend within a specific event.
 *
 * Reads unsettledBillIds from the event pair balance, marks each bill settled,
 * zeros the event balance, and writes a settlement record — all in one transaction.
 * The balances are updated automatically via the ledgerProcessor flow-through.
 */
export const processEventSettlement = onCall<
  import('./eventSettlementProcessor.js').EventSettleRequest
>({ timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { processEventSettlementCore } = await import('./eventSettlementProcessor.js');
  return processEventSettlementCore(request.auth.uid, request.data);
});

/**
 * Cloud Function: Reverse a settlement.
 *
 * Un-settles bills and deletes the settlement record. The ledgerProcessor
 * pipeline auto-fires for each modified bill to recalculate balances.
 */
export const reverseSettlement = onCall<import('./settlementReversal.js').ReversalRequest>(
  { timeoutSeconds: 60, memory: '256MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { processSettlementReversalCore } = await import('./settlementReversal.js');
    return processSettlementReversalCore(request.auth.uid, request.data);
  },
);

/**
 * Cloud Function: Create Bill (Atomic)
 *
 * Atomically creates a bill document and updates friend balances
 * in a single transaction.
 */
export {
  createBill,
  joinBillAsGuest,
  leaveBillAsGuest,
  updateGuestName,
  claimShadowUser,
} from './billFunctions.js';

/**
 * Cloud Functions: Event creation and unarchiving
 *
 * Both moved server-side so the free-tier owned-active-group cap can be
 * enforced — the cap requires COUNTING documents, which a Firestore security
 * rule cannot do. Archiving deliberately stays a direct client write: it frees
 * a slot and must never be blocked. See eventFunctions.ts.
 */
export { createEvent, unarchiveEvent } from './eventFunctions.js';

/**
 * Cloud Function: Recurring Bill Processor
 *
 * Scheduled function that runs every hour. Queries active recurring bill
 * templates whose nextRunDate <= today, creates bills for all due/missed
 * cycles, and advances the schedule.
 */
export { processRecurringBills } from './recurringBillProcessor.js';

// ========== Squads ==========
// All squad writes are server-only; see squadFunctions.ts.
export { createSquad, updateSquad, deleteSquad } from './squadFunctions.js';

// ========== Account deletion ==========
// Required by App Store Review Guideline 5.1.1(v). Tombstones the user so
// counterparties' shared bills and balances survive, revokes their Apple
// token, and deletes the auth account last. See accountDeletion.ts.
export { deleteAccount } from './accountDeletion.js';

// ========== Monetization ==========
// RevenueCat posts purchase/renewal/expiry events here. The ONLY writer of
// `entitlements/{userId}`. Authenticated by a shared secret, deduped on
// event.id against `webhook_events/`. See revenueCatWebhook.ts.
export { revenueCatWebhook } from './revenueCatWebhook.js';

/**
 * Cloud Function: Generate a recurring bill's due occurrences immediately.
 *
 * Called by the client right after a template is created or edited so any
 * already-due / overdue cycles are generated at once (with balances updated via
 * the ledger pipeline) instead of waiting up to an hour for the scheduler.
 * Idempotent with the hourly pass.
 */
export const generateRecurringBillNow = onCall<{ recurringBillId: string }>(
  { timeoutSeconds: 120, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }

    const { recurringBillId } = request.data;
    if (!recurringBillId) {
      throw new HttpsError('invalid-argument', 'recurringBillId is required');
    }

    try {
      const { generateRecurringBillNowCore } = await import('./recurringBillProcessor.js');
      const db = getFirestore();
      const todayStr = new Date().toISOString().split('T')[0];
      return await generateRecurringBillNowCore(db, recurringBillId, request.auth.uid, todayStr);
    } catch (error) {
      console.error('Failed to generate recurring bill now:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      if (message === 'Recurring bill not found') {
        throw new HttpsError('not-found', message);
      }
      if (message === 'Not authorized to generate this recurring bill') {
        throw new HttpsError('permission-denied', message);
      }
      throw new HttpsError('internal', `Failed to generate recurring bill: ${message}`);
    }
  },
);

/**
 * Cloud Function: one-time migration to reconcile event footprints orphaned
 * before processedEventId existed (bills removed from an event pre-deploy whose
 * contribution is stranded in event_balances). Guarded: requires auth AND that
 * the caller's uid matches the MIGRATION_ADMIN_UID env var, so it is inert
 * unless an operator explicitly sets that variable before running it once.
 */
export const reconcileEventFootprints = onCall(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    const adminUid = process.env.MIGRATION_ADMIN_UID;
    if (!adminUid || request.auth.uid !== adminUid) {
      throw new HttpsError('permission-denied', 'Not authorized to run migrations');
    }
    const { reconcileOrphanedEventFootprints } =
      await import('./migrations/reconcileOrphanedEventFootprints.js');
    return reconcileOrphanedEventFootprints(getFirestore());
  },
);

/**
 * Maintainer accounts allowed to run the ledger reconciliation on demand.
 * These are the two owner UIDs; keep in sync if maintainers change.
 */
const ADMIN_UIDS = [
  'RrGSa7ixSSRhUlieYzDQNnExAjx1', // maintainer account (Aakaash)
  'e5do2UHqO2W9M8If4rmfTKiK3VV2', // maintainer account
] as const;

/**
 * Cloud Function: Ledger reconciliation (admin, on demand).
 *
 * Rebuilds `balances` and `event_balances` from the source-of-truth bills,
 * repairing accumulated delta-drift, backfilling anchors, and removing junk
 * docs. Admin-guarded: caller's uid must be in ADMIN_UIDS. Defaults to a dry
 * run (report-only); pass { dryRun: false } to apply. Optional { uidFilter }
 * restricts writes to docs whose participants intersect the given UIDs.
 */
export const reconcileLedger = onCall<{ dryRun?: boolean; uidFilter?: string[] }>(
  { timeoutSeconds: 300, memory: '512MiB' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated');
    }
    if (!ADMIN_UIDS.includes(request.auth.uid as (typeof ADMIN_UIDS)[number])) {
      throw new HttpsError('permission-denied', 'Not authorized to run ledger reconciliation');
    }
    const { reconcileLedgerCore } = await import('./reconciliation/reconcileLedger.js');
    const dryRun = request.data?.dryRun ?? true;
    const uidFilter = request.data?.uidFilter;
    return reconcileLedgerCore(getFirestore(), { dryRun, ...(uidFilter && { uidFilter }) });
  },
);

/**
 * Cloud Function: Scheduled ledger drift report (daily, report-only).
 *
 * Runs reconcileLedgerCore in dry-run mode every day and logs the drift report.
 * NEVER auto-writes — surfacing drift is a signal to run reconcileLedger
 * (dryRun:false) manually after review.
 */
export const scheduledLedgerReconcile = onSchedule(
  { schedule: 'every 24 hours', timeoutSeconds: 300, memory: '512MiB' },
  async () => {
    // NOTE: reconcileLedgerCore reads the full bills/users/events/balances/event_balances
    // collections into memory. This is acceptable at current data size but is a known
    // scaling ceiling — revisit if any of those collections grow large.
    try {
      const { reconcileLedgerCore } = await import('./reconciliation/reconcileLedger.js');
      const report = await reconcileLedgerCore(getFirestore(), { dryRun: true });
      logger.info('scheduledLedgerReconcile drift report', {
        scanned: report.scanned,
        wouldPatch: report.patched,
        wouldZero: report.zeroed,
        wouldDelete: report.deleted,
        wouldStampBills: report.billsStamped,
      });
    } catch (err) {
      logger.error('scheduledLedgerReconcile failed', { error: String(err) });
      // Swallow — a failed dry-run report must not surface as a scheduler error
      // and trigger unnecessary retry/alert-spam.
    }
  },
);

/**
 * Dev-only manual trigger for the recurring-bill generator. Exported ONLY when
 * running under the Firebase emulator so it is never deployed to production.
 * Lets you run a generation pass on demand (the scheduler doesn't fire locally),
 * e.g. curl ".../devTriggerRecurringBills?today=2026-05-30".
 */
import { devTriggerRecurringBills as _devTriggerRecurringBills } from './recurringBillProcessor.js';
export const devTriggerRecurringBills =
  process.env.FUNCTIONS_EMULATOR === 'true' ? _devTriggerRecurringBills : undefined;
