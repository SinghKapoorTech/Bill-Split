/**
 * revenueCatWebhook.ts
 *
 * Cloud Function: the HTTP endpoint RevenueCat posts purchase events to, and
 * the only thing in this codebase that writes `entitlements/{userId}`.
 *
 * The decision of WHAT an event means lives in `shared/revenueCatEvents.ts`
 * (pure, unit-tested). This file owns the three things a pure function cannot:
 *
 *   1. AUTHENTICATION — a shared secret RevenueCat sends in the Authorization
 *      header, compared in constant time. Without this, anyone who learns the
 *      URL can mint Pro for any uid they name.
 *   2. DEDUPE ON `event.id` — RevenueCat retries any non-2xx delivery for
 *      days. `extend-trip-pass` is a read-modify-write, so a replayed
 *      NON_RENEWING_PURCHASE would grant 28 days for one payment. The
 *      `webhook_events/{event.id}` row is the guard, and it is checked and
 *      written INSIDE the same transaction as the entitlement write — two
 *      concurrent deliveries would otherwise both read "absent" and both apply.
 *   3. SERVER TIME — `Date.now()` on the server, never a value from the
 *      payload, so a rolled-back clock can't extend paid access.
 *
 * The `webhook_events` collection denies all client access (firestore.rules) —
 * a client that could delete a row could replay its own purchase.
 *
 * THIS ENDPOINT ACCEPTS SANDBOX EVENTS, INCLUDING IN PRODUCTION, because App
 * Store reviewers purchase against prod using StoreKit sandbox. Granting
 * mutations stamp `environment` on the entitlement doc so those grants stay
 * auditable. Full rationale at the `planEntitlementMutation` call site.
 *
 * Every relative import ends in `.js` — required by the functions ESM build.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
import {
  planEntitlementMutation,
  resolveFirebaseUid,
  type EntitlementMutation,
  type RevenueCatEvent,
} from '../../shared/revenueCatEvents.js';

const revenueCatWebhookSecret = defineSecret('REVENUECAT_WEBHOOK_SECRET');

/**
 * Constant-time compare of the Authorization header against the shared secret.
 *
 * `timingSafeEqual` throws on buffers of unequal length, so the length check is
 * mandatory rather than optional. It does leak the secret's LENGTH to someone
 * timing the endpoint — that is accepted; what must not leak is any signal
 * about the secret's CONTENT, which byte-by-byte comparison would give away one
 * character at a time.
 */
function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const revenueCatWebhook = onRequest(
  { secrets: [revenueCatWebhookSecret], maxInstances: 10 },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    if (!secretMatches(req.header('Authorization'), revenueCatWebhookSecret.value())) {
      // No detail in the body — someone probing this must learn nothing.
      logger.warn('revenueCatWebhook: rejected unauthorized delivery');
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body?.event;
    // `id` must be a USABLE Firestore document id, not merely a string: it is
    // used directly as the `webhook_events` doc id, and `.doc('')` throws. A
    // throw here would land in the 500 branch below and RevenueCat would retry
    // a payload that can never succeed, for days.
    if (
      !event ||
      typeof event.id !== 'string' ||
      !isValidDocId(event.id) ||
      typeof event.type !== 'string'
    ) {
      // 400, not 500: RevenueCat must NOT retry a malformed body forever.
      res.status(400).send('Bad Request');
      return;
    }

    try {
      await applyRevenueCatEvent(event as RevenueCatEvent);
      res.status(200).send('OK');
    } catch (error) {
      // 500 so RevenueCat RETRIES — the event ledger makes that safe.
      logger.error('revenueCatWebhook: apply failed', {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send('Internal Error');
    }
  },
);

/**
 * Is `id` addressable as a Firestore document id?
 *
 * Both ids this function uses come from an untrusted payload — `event.id`
 * (the replay-ledger key) and the resolved uid (the entitlement key). Firestore
 * THROWS on an empty id, one containing `/`, `.`/`..`, or the reserved
 * `__x__` form. A throw inside the handler is a 500, and a 500 makes
 * RevenueCat retry — so an unaddressable id would become a multi-day retry
 * storm over a payload that can never succeed. Checked up front instead, so
 * those payloads are rejected once and permanently.
 */
function isValidDocId(id: string): boolean {
  return (
    id.length > 0 &&
    Buffer.byteLength(id, 'utf8') <= 1500 &&
    !id.includes('/') &&
    id !== '.' &&
    id !== '..' &&
    !/^__.*__$/.test(id)
  );
}

/**
 * Narrows an untrusted payload field to a string, or null.
 *
 * `RevenueCatEvent` types `product_id` and `environment` as `string | undefined`,
 * but that is a compile-time claim about a JSON body we do not control — at
 * runtime either can be a number, an object, or a nested array. `?? null` only
 * catches null/undefined, so `"product_id": [[1]]` would pass straight through.
 *
 * Note where that actually fails, because it is not where you would guess:
 * `tx.set` accepts a nested array without complaint and the client-side
 * serializer encodes it happily. The SERVER rejects it at COMMIT with
 * `3 INVALID_ARGUMENT: Cannot convert an array value in an array value`
 * (verified against the emulator). That rejects the transaction promise, which
 * lands in the handler's 500 branch — and because the commit failed, the
 * `webhook_events` row that would stop the retry was never written either. So
 * RevenueCat retries a payload that can never succeed, for days: the same
 * retry-storm class `isValidDocId` and `boundExpiry` close. Every untrusted
 * field that reaches a write goes through here.
 *
 * Note this only guards the WRITE. An unrecognized `product_id` is still
 * dropped as `unknown-product` by `planEntitlementMutation`, which is where
 * that decision belongs.
 */
function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/**
 * Widest expiry this function will write, as a distance from now.
 *
 * `planEntitlementMutation` only checks `Number.isFinite`, so an
 * `expiration_at_ms` of `1e18` reaches us intact and makes
 * `Timestamp.fromMillis` throw (finding: a 500, therefore a retry storm).
 * Bounding it also closes the worse outcome: a single malformed event writing
 * an expiry in the year 9999 is permanent free Pro that nothing would ever
 * notice or undo — exactly the failure `shared/revenueCatEvents.ts` refuses a
 * no-expiry grant to avoid. No legitimate subscription period or Trip Pass
 * comes close to ten years, so anything beyond it is garbage, not a long plan.
 */
const MAX_EXPIRY_HORIZON_MS = 10 * 365 * 24 * 60 * 60 * 1000;

/** True when `ms` is a Firestore-writable expiry we're willing to honour. */
function isSaneExpiry(ms: number, nowMs: number): boolean {
  return Number.isFinite(ms) && ms > 0 && ms < nowMs + MAX_EXPIRY_HORIZON_MS;
}

/**
 * Reads `tripPassExpiresAt` back out of the entitlement doc, in epoch ms.
 *
 * Deliberately tolerates a plain number as well as a Timestamp, matching
 * `entitlementService.toMillis` on the READ side. This function always writes a
 * Timestamp, so the number case should never occur — but if it ever did, a
 * Timestamp-only check would silently see `undefined`, and `extend-trip-pass`
 * would restart the clock at `now` and delete the days the user already paid
 * for. Anything else (a string, an object) stays undefined so a malformed value
 * expires rather than extends.
 */
function toMillis(value: unknown): number | undefined {
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

/**
 * Downgrades a timestamp-bearing mutation to `ignore` when its expiry is out of
 * range, so the write is refused rather than throwing (retry storm) or granting
 * a decade-plus of access. Every other mutation passes through untouched.
 *
 * Fail-closed, matching `planEntitlementMutation`'s own posture: an expiry we
 * cannot vouch for is dropped, never clamped to something plausible.
 */
function boundExpiry(mutation: EntitlementMutation, nowMs: number): EntitlementMutation {
  if (mutation.kind === 'set-pro' && !isSaneExpiry(mutation.expiresAt, nowMs)) {
    return { kind: 'ignore', reason: 'expiry-out-of-range' };
  }
  if (mutation.kind === 'extend-trip-pass' && !isSaneExpiry(mutation.tripPassExpiresAt, nowMs)) {
    return { kind: 'ignore', reason: 'expiry-out-of-range' };
  }
  return mutation;
}

/** What one transaction attempt concluded, so the caller can log it exactly once. */
type ApplyOutcome = { status: 'duplicate' } | { status: 'applied'; mutation: EntitlementMutation };

/**
 * The transactional core, exported so integration tests drive it directly
 * without an HTTP shell — the same split as `processLedgerWrite`.
 * Safe to call on its own: it re-resolves the uid rather than trusting a caller.
 */
export async function applyRevenueCatEvent(event: RevenueCatEvent): Promise<void> {
  const uid = resolveFirebaseUid(event);
  // `isValidDocId` as well as truthiness: `resolveFirebaseUid` rejects empty and
  // anonymous ids but does not check document-id SHAPE, and a uid containing
  // `/` would make `.doc(uid)` throw — a 500, and therefore a retry storm.
  if (!uid || !isValidDocId(uid)) {
    // A purchase we cannot attach to an account. NEVER fabricate a uid — writing
    // `entitlements/undefined` would be a shared entitlement for every anonymous
    // purchaser. Logged at error: someone paid and got nothing.
    logger.error('revenueCatWebhook: no Firebase uid on event', {
      eventId: event.id,
      type: event.type,
      appUserId: event.app_user_id,
    });
    return;
  }

  const db = getFirestore();
  const eventRef = db.collection('webhook_events').doc(event.id);
  const entRef = db.collection('entitlements').doc(uid);

  const outcome = await db.runTransaction<ApplyOutcome>(async (tx) => {
    // ALL READS FIRST — Firestore rejects a transaction that reads after it
    // writes. Both gets must happen before the first `tx.set` below.

    // Replay guard INSIDE the transaction: two concurrent deliveries of the
    // same event would otherwise both read "absent" and both apply.
    const seen = await tx.get(eventRef);
    if (seen.exists) return { status: 'duplicate' };

    const entSnap = await tx.get(entRef);
    const data = entSnap.data() ?? {};
    const tripPassExpiresAt = toMillis(data.tripPassExpiresAt);

    // Date.now() on the SERVER — never a timestamp off the payload, so a device
    // with its clock rolled back cannot extend paid access.
    const nowMs = Date.now();
    // acceptSandbox: TRUE, deliberately, even in production.
    //
    // App Store reviewers exercise the StoreKit SANDBOX against the PRODUCTION
    // app, so a prod endpoint that refuses SANDBOX events means the reviewer
    // buys Pro, receives nothing, hits the free-tier scan cap, and rejects the
    // submission. Routing sandbox traffic to the beta project does not help —
    // the reviewer's purchase is made against prod regardless of where we point
    // a second webhook.
    //
    // The abuse surface is small: a sandbox purchase requires an Apple sandbox
    // tester account or an email on the Play license-tester list, neither of
    // which an ordinary user can create for themselves. The granting mutations
    // below stamp `environment` on the entitlement doc so a sandbox grant stays
    // distinguishable from a paid one — auditable, excludable from revenue
    // reporting, and purgeable later.
    //
    // This makes `planEntitlementMutation`'s `sandbox-event-in-production`
    // ignore reason unreachable FROM THIS CALLER. It is deliberately retained
    // in the pure module: the `acceptSandbox` parameter still exists, and a
    // future caller (or a revisit of this decision) needs the fail-closed
    // branch to still be there.
    const mutation = boundExpiry(
      planEntitlementMutation(event, { tripPassExpiresAt }, nowMs, true),
      nowMs,
    );

    // ---- reads done; writes below ----

    tx.set(eventRef, {
      type: event.type,
      uid,
      productId: asStringOrNull(event.product_id),
      environment: asStringOrNull(event.environment),
      mutation: mutation.kind,
      reason: mutation.kind === 'ignore' ? mutation.reason : null,
      receivedAt: FieldValue.serverTimestamp(),
    });

    switch (mutation.kind) {
      case 'set-pro':
        tx.set(
          entRef,
          {
            plan: 'pro',
            source: 'revenuecat',
            productId: asStringOrNull(event.product_id),
            // Stamped so a SANDBOX grant (see acceptSandbox above) stays
            // distinguishable from a real purchase after the fact.
            environment: asStringOrNull(event.environment),
            expiresAt: Timestamp.fromMillis(mutation.expiresAt),
            inGracePeriod: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      case 'clear-pro':
        // plan drops to 'free' but tripPassExpiresAt is left ALONE — a pass held
        // alongside a lapsed subscription must survive (spec §5.1).
        tx.set(
          entRef,
          { plan: 'free', inGracePeriod: false, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        break;
      case 'set-grace':
        tx.set(
          entRef,
          { inGracePeriod: true, updatedAt: FieldValue.serverTimestamp() },
          { merge: true },
        );
        break;
      case 'extend-trip-pass':
        // Writes tripPassExpiresAt, NOT plan — writing plan here would downgrade
        // an active Pro subscriber who also bought a pass.
        tx.set(
          entRef,
          {
            source: 'revenuecat',
            // Same rationale as set-pro: mark sandbox-issued passes.
            environment: asStringOrNull(event.environment),
            tripPassExpiresAt: Timestamp.fromMillis(mutation.tripPassExpiresAt),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      case 'ignore':
        // No entitlement write. The webhook_events row above is still written so
        // the retry stops — an event we deliberately dropped must not come back
        // forever. Logged outside the transaction, below.
        //
        // OPERATIONAL TRAP: that row also makes the drop permanent. If events
        // were dropped as `unknown-product` because PRODUCT_PLANS didn't match
        // the store, fixing PRODUCT_PLANS and re-sending from the RevenueCat
        // dashboard is a NO-OP — the resend carries the same event.id and is
        // rejected as a duplicate. Delete the affected `webhook_events/{id}`
        // rows (Admin SDK) first, or grant those users manually.
        break;
    }

    return { status: 'applied', mutation };
  });

  // Logged HERE, not inside the callback: `runTransaction` re-runs its callback
  // on contention, and an `unknown-product` alert that fires twice for one
  // delivery is a false duplicate in whatever pages on it.
  if (outcome.status === 'duplicate') {
    logger.info('revenueCatWebhook: duplicate delivery ignored', { eventId: event.id });
    return;
  }
  if (outcome.mutation.kind === 'ignore') {
    logIgnoredEvent(event, outcome.mutation.reason);
  }
}

/**
 * `ignore` reasons that mean A CUSTOMER PAID AND GOT NOTHING. These are bugs in
 * our configuration, not normal traffic, and must be alertable:
 *   - `unknown-product`: the product ids in PRODUCT_PLANS don't match the store,
 *     so EVERY purchase silently no-ops.
 *   - `pro-grant-without-expiry`: a paid subscription event we refused to honour.
 *   - `expiry-out-of-range`: a paid event whose expiry we refused to write (see
 *     `boundExpiry`) — same customer-facing outcome as the two above.
 */
const IGNORE_IS_ERROR = new Set([
  'unknown-product',
  'pro-grant-without-expiry',
  'expiry-out-of-range',
]);

/**
 * `ignore` reasons that are expected, correct, and high-volume. Logging these
 * at anything above `info` would bury the two reasons above in noise —
 * CANCELLATION alone fires for every user who ever turns off auto-renew.
 */
const IGNORE_IS_ROUTINE = new Set([
  'sandbox-event-in-production',
  'cancellation-defers-to-expiration',
  'pause-defers-to-expiration',
]);

/**
 * Fail-closed means every unrecognized event becomes an `ignore`, so a single
 * log level here would either page on routine cancellations or bury a
 * misconfiguration that is silently costing sales. The split exists so the
 * "someone paid and got nothing" reasons are the only ones at `error`.
 * Anything not classified is a `warn`: unexpected, but not proven to be a
 * dropped payment.
 */
function logIgnoredEvent(event: RevenueCatEvent, reason: string): void {
  const payload = {
    eventId: event.id,
    type: event.type,
    productId: asStringOrNull(event.product_id),
    reason,
  };
  if (IGNORE_IS_ERROR.has(reason)) {
    logger.error('revenueCatWebhook: purchase event dropped', payload);
  } else if (IGNORE_IS_ROUTINE.has(reason)) {
    logger.info('revenueCatWebhook: event ignored', payload);
  } else {
    logger.warn('revenueCatWebhook: event ignored', payload);
  }
}
