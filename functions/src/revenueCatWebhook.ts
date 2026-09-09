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
 *   2. DEDUPE ON `event.id` — RevenueCat retries any non-200 delivery up to
 *      5 times (5/10/20/40/80 min). `extend-trip-pass` is a read-modify-write,
 *      so a replayed NON_RENEWING_PURCHASE would grant 28 days for one payment. The
 *      `webhook_events/{event.id}` row is the guard, and it is checked and
 *      written INSIDE the same transaction as the entitlement write — two
 *      concurrent deliveries would otherwise both read "absent" and both apply.
 *   3. SERVER TIME — `Date.now()` on the server, never a value from the
 *      payload, so a rolled-back clock can't extend paid access.
 *
 * The `webhook_events` collection denies all client access (firestore.rules) —
 * a client that could delete a row could replay its own purchase.
 *
 * RETRY POLICY — verified against RevenueCat's docs, not assumed. Anything but
 * a 200 is a failure, and 4xx and 5xx are treated IDENTICALLY: RevenueCat
 * retries up to 5 times with increasing delay (5, 10, 20, 40, 80 minutes) and
 * then STOPS PERMANENTLY. Six attempts, ~2h35m, and the event is gone.
 *
 * Two consequences the comments below depend on, so do not "simplify" them:
 *   - There is no such thing as a multi-day retry storm here. The danger is the
 *     OPPOSITE — an event that keeps failing is silently ABANDONED, and a
 *     customer who paid gets nothing with no trace but a log line.
 *   - A non-200 status buys no behavioural difference; it only changes what
 *     RevenueCat's own delivery dashboard shows. Choose it for observability,
 *     never to control retries.
 *
 * That ~2h35m is also the ENTIRE window to notice a broken secret. See the
 * 401 alert requirement in the handoff before go-live.
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
    // Only the BODY SHAPE is the shell's business. Field-level validation of
    // `id` and `type` lives in `applyRevenueCatEvent`, because those two fields
    // reach a doc path and a write — putting the check there is what makes the
    // core's standalone-safety claim true rather than aspirational.
    if (!event || typeof event !== 'object') {
      // 400 documents intent; it does NOT change RevenueCat's behaviour, which
      // treats every non-200 identically (see RETRY POLICY in the header).
      res.status(400).send('Bad Request');
      return;
    }

    try {
      const outcome = await applyRevenueCatEvent(event as RevenueCatEvent);
      if (outcome.status === 'rejected') {
        // 400 documents intent only — see RETRY POLICY. This payload can never
        // succeed, but RevenueCat still re-delivers it 5 more times before
        // discarding it. The `rejected` path writes nothing, so that is free.
        logger.warn('revenueCatWebhook: rejected malformed event', { reason: outcome.reason });
        res.status(400).send('Bad Request');
        return;
      }
      if (outcome.status === 'unresolved-uid') {
        // DELIBERATELY NOT 200 (owner's call, 2026-09-09). One established
        // reason, and one that is NOT established and must not be leaned on:
        //
        //   1. UNVERIFIED — it MIGHT self-heal the alias race, where RevenueCat
        //      delivers a purchase before the client's `logIn` has associated
        //      the Firebase uid with the RevenueCat customer. That only holds
        //      if a retry RE-RENDERS the payload with a fresh `aliases` array.
        //      If retries replay the stored body, all six attempts resolve to
        //      the same anonymous id and nothing heals. The docs say only that
        //      retries "reuse the payload id and event_timestamp_ms" and are
        //      silent on the rest. DO NOT cite this until someone has observed
        //      it: force a 422 on a first sandbox delivery, then diff the two
        //      bodies. This claim was asserted as fact once already and was
        //      wrong to assert.
        //   2. THE REASON THIS IS 422, and it stands alone. It is visible where
        //      someone will actually look. If Task 4's
        //      identity wiring regresses, EVERY purchase arrives unattachable —
        //      customers pay and get nothing. Under 200 that is invisible in
        //      RevenueCat's dashboard and surfaces only as a Cloud Logging
        //      error. As a failed delivery it is obvious immediately.
        //
        // Nothing was written (see the core), so re-delivery is safe and cheap.
        // 422: well-formed, but we cannot act on it. The exact code has NO
        // effect on retry behaviour — it is chosen for whoever reads the
        // dashboard.
        res.status(422).send('Unprocessable Entity');
        return;
      }
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
 * `__x__` form. A throw inside the handler is a 500, so the delivery burns all
 * 6 attempts and is then DISCARDED PERMANENTLY — the purchase is lost, and
 * because the commit never happened there is no ledger row saying why. Checked
 * up front instead, so the event is refused cheaply rather than throwing.
 *
 * Note what this does NOT buy: nothing is RECORDED. This path and
 * `unresolved-uid` both return before the transaction opens, so no
 * `webhook_events` row is written on either, and the core logs nothing on
 * `rejected` — the only warn is in the HTTP shell. A direct caller (chunk 5's
 * reconciler) gets the same refusal, but silently, and must log it itself.
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
 * `webhook_events` row that would have recorded the drop was never written
 * either. RevenueCat then exhausts its 6 attempts and discards the event, so a
 * paid purchase vanishes leaving nothing but a stack trace: the same
 * silent-loss class `isValidDocId` and `boundExpiry` close.
 *
 * NOTE the mechanism precisely: a NESTED array (`[[1]]`) is what the server
 * rejects at commit. A FLAT array (`['INITIAL_PURCHASE']`) commits fine, so an
 * unnarrowed field of that shape yields a silently GARBLED row instead. Both
 * are worth refusing; they fail differently.
 *
 * Every untrusted field that reaches a write is narrowed BEFORE the write —
 * `product_id` and `environment` here, `id` and `type` by the entry checks in
 * `applyRevenueCatEvent`. If you add a field to a `tx.set` below, it belongs in
 * one of those two places; a raw payload value in a write is the bug.
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
 * `Timestamp.fromMillis` throw (finding: a 500, therefore a lost purchase).
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
 * range, so the write is refused rather than throwing (lost purchase) or granting
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

/**
 * What one delivery concluded — RETURNED to the caller, not just logged.
 *
 * Chunk 5's reconciliation job needs to tell "we applied it", "we already had
 * it", and "we dropped it, and here is why" apart WITHOUT re-reading
 * `webhook_events`. Returning it now is free; widening a `Promise<void>` later
 * would be a breaking change to every caller.
 *
 *   - `rejected`      — malformed beyond use; the HTTP shell maps this to 400.
 *   - `unresolved-uid` — well-formed, but not attachable to an account YET. A
 *                        retry CAN change this: the client's `logIn` may not
 *                        have registered the alias when the event arrived, so
 *                        the shell returns 422 to get it re-delivered.
 *   - `duplicate`     — the replay ledger already had this `event.id`.
 *   - `applied`       — a transaction committed; `mutation` says what it did,
 *                        including `{kind:'ignore', reason}`.
 */
export type ApplyOutcome =
  | { status: 'rejected'; reason: string }
  | { status: 'unresolved-uid' }
  | { status: 'duplicate' }
  | { status: 'applied'; mutation: EntitlementMutation };

/**
 * The subset the TRANSACTION itself can conclude. `rejected` and
 * `unresolved-uid` are both decided before the transaction opens, so narrowing
 * here keeps the post-commit logging exhaustive without a fallback branch.
 */
type TransactionOutcome = Extract<ApplyOutcome, { status: 'duplicate' | 'applied' }>;

/**
 * The transactional core, exported so integration tests drive it directly
 * without an HTTP shell — the same split as `processLedgerWrite`.
 *
 * Genuinely safe to call on its own: it re-resolves the uid rather than
 * trusting a caller, AND validates `event.id` / `event.type` itself. Both are
 * untrusted strings that reach a write — `id` as the `webhook_events` document
 * id, `type` as a stored field — so validating them only in the HTTP shell
 * would leave a direct caller (a test, or chunk 5's reconciler) able to trigger
 * the exact retry-storm failures documented on `isValidDocId` and
 * `asStringOrNull`. An array `type`, for instance, is accepted by `tx.set` and
 * rejected by the SERVER at commit, so no ledger row is written and the retry
 * never stops.
 */
export async function applyRevenueCatEvent(event: RevenueCatEvent): Promise<ApplyOutcome> {
  // Field-level validation FIRST, before `event.id` is used as a doc path below.
  if (typeof event.id !== 'string' || !isValidDocId(event.id)) {
    return { status: 'rejected', reason: 'invalid-event-id' };
  }
  if (typeof event.type !== 'string') {
    return { status: 'rejected', reason: 'invalid-event-type' };
  }

  const uid = resolveFirebaseUid(event);
  // `isValidDocId` as well as truthiness: `resolveFirebaseUid` rejects empty and
  // anonymous ids but does not check document-id SHAPE, and a uid containing
  // `/` would make `.doc(uid)` throw — a 500, and therefore a lost purchase.
  if (!uid || !isValidDocId(uid)) {
    // A purchase we cannot attach to an account. NEVER fabricate a uid — writing
    // `entitlements/undefined` would be a shared entitlement for every anonymous
    // purchaser. Logged at error: someone paid and got nothing.
    logger.error('revenueCatWebhook: no Firebase uid on event', {
      eventId: event.id,
      type: event.type,
      appUserId: event.app_user_id,
    });
    return { status: 'unresolved-uid' };
  }

  const db = getFirestore();
  const eventRef = db.collection('webhook_events').doc(event.id);
  const entRef = db.collection('entitlements').doc(uid);

  const outcome = await db.runTransaction<TransactionOutcome>(async (tx) => {
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
        // the redelivery stops early — an event we deliberately dropped should
        // not consume all 6 attempts. Logged outside the transaction, below.
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
    return outcome;
  }
  if (outcome.mutation.kind === 'ignore') {
    logIgnoredEvent(event, outcome.mutation.reason);
  }
  return outcome;
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
