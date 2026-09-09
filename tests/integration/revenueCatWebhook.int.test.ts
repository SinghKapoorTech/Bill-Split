/**
 * Emulator-backed coverage for `applyRevenueCatEvent`
 * (`functions/src/revenueCatWebhook.ts`).
 *
 * The pure decision layer (`shared/revenueCatEvents.ts`) is unit-tested. What a
 * unit test structurally CANNOT cover is everything that only exists once a
 * real Firestore is underneath it:
 *
 *   - REPLAY. The dedupe guard is a `tx.get` on `webhook_events/{event.id}`
 *     inside the transaction. There is no such thing as "replaying an event"
 *     without durable storage to replay against.
 *   - CONCURRENCY. The guard being INSIDE the transaction rather than before it
 *     is justified in three separate comments in the source, and the only thing
 *     that can tell the two placements apart is two deliveries racing against a
 *     real datastore. A pre-transaction check passes every replay test in this
 *     file and still hands out 42 days for one payment.
 *   - THE READ-MODIFY-WRITE of a pass extension. `extend-trip-pass` computes
 *     its new expiry from the value already on the doc, so "a second pass
 *     EXTENDS instead of restarting" is only observable across two real writes.
 *   - CROSS-FIELD SURVIVAL. `clear-pro` and `extend-trip-pass` both use
 *     `{ merge: true }`; whether a live Trip Pass survives a subscription
 *     EXPIRATION is a property of the merge, not of the planner.
 *   - COMMIT-TIME REJECTION. `asStringOrNull` exists because the Firestore
 *     SERVER, not the client library, refuses a nested array at commit. No fake
 *     reproduces that; only a real commit does.
 *   - THE ABSENCE OF WRITES on the reject paths.
 *
 * The core is driven directly, without the HTTPS shell — the same split as
 * `processLedgerWrite` in `ledgerPipeline.int.test.ts`. The shell's own
 * branching (method, auth, body shape, and the outcome -> HTTP status mapping,
 * including the 422) is covered separately in
 * `tests/revenueCatWebhookShell.test.ts`.
 *
 * NOTE ON ASSERTING DURATIONS: nothing here compares a result against
 * `TRIP_PASS_DURATION_MS`. That would be circular — if the constant were wrong,
 * the test would still pass. Fourteen days is spelled out below as a literal so
 * a wrong constant actually fails.
 *
 * NOTE ON `expect.soft`: every use of it below is deliberate and means the same
 * thing. A soft assertion DOES fail its test — it only defers the abort — so it
 * is used exactly where the line is a DIAGNOSTIC (which status came back, which
 * ignore reason) and the lines after it are the DURABLE
 * property that actually matters (what is on the doc, what is in the ledger).
 * Making the diagnostic hard would hide the durable failure behind it, which is
 * the wrong way round: "we returned the wrong status" is a smaller problem than
 * "we wrote 28 days" or "we wrote a ledger row that strands the purchase".
 * Every site is annotated with which durable assertions it is protecting. If
 * you add an `expect.soft` with no such assertions after it, make it hard
 * instead — it is buying nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { db, clearFirestore } from './helpers/env';
import type { RevenueCatEvent } from '../../shared/revenueCatEvents';
import { applyRevenueCatEvent, type ApplyOutcome } from '../../functions/src/revenueCatWebhook';

const UID = 'user-rc-1';

/** Spelled out deliberately — see the note in the file header. */
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const proEvent = (
  id: string,
  expiresAtMs: number,
  environment = 'PRODUCTION',
): RevenueCatEvent => ({
  id,
  type: 'INITIAL_PURCHASE',
  product_id: 'divit_pro_monthly',
  app_user_id: UID,
  environment,
  expiration_at_ms: expiresAtMs,
});

const passEvent = (id: string, environment = 'PRODUCTION'): RevenueCatEvent => ({
  id,
  type: 'NON_RENEWING_PURCHASE',
  product_id: 'divit_trip_pass_14d',
  app_user_id: UID,
  environment,
  expiration_at_ms: null,
});

const lifecycleEvent = (id: string, type: string): RevenueCatEvent => ({
  id,
  type,
  product_id: 'divit_pro_monthly',
  app_user_id: UID,
  environment: 'PRODUCTION',
});

async function entitlement() {
  return db.collection('entitlements').doc(UID).get();
}

async function entitlementData() {
  const snap = await entitlement();
  expect(snap.exists).toBe(true);
  return snap.data()!;
}

async function ledgerIds(): Promise<string[]> {
  const snap = await db.collection('webhook_events').get();
  return snap.docs.map((d) => d.id).sort();
}

/** Narrows to the `applied` arm, failing loudly (not silently) otherwise. */
function applied(outcome: ApplyOutcome): Extract<ApplyOutcome, { status: 'applied' }> {
  if (outcome.status !== 'applied') {
    throw new Error(`expected an applied outcome, got: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

/** Reads `tripPassExpiresAt` as epoch ms, asserting it really is a Timestamp. */
function passMillis(data: FirebaseFirestore.DocumentData): number {
  expect(data.tripPassExpiresAt).toBeInstanceOf(Timestamp);
  return (data.tripPassExpiresAt as Timestamp).toMillis();
}

describe('revenueCatWebhook — applyRevenueCatEvent', () => {
  beforeEach(clearFirestore);

  it('grants pro, records the ledger row, and is a no-op on replay', async () => {
    const expiresAt = Date.now() + THIRTY_DAYS_MS;

    const first = applied(await applyRevenueCatEvent(proEvent('evt-a', expiresAt)));
    expect(first.mutation).toEqual({ kind: 'set-pro', expiresAt, inGracePeriod: false });

    const second = await applyRevenueCatEvent(proEvent('evt-a', expiresAt));
    // Soft, so a regression that re-applies the event is still caught by the
    // durable assertions below rather than aborting the test at this line.
    expect.soft(second).toEqual({ status: 'duplicate' });

    const data = await entitlementData();
    expect(data.plan).toBe('pro');
    expect(data.source).toBe('revenuecat');
    expect(data.productId).toBe('divit_pro_monthly');
    expect(data.environment).toBe('PRODUCTION');
    expect(data.inGracePeriod).toBe(false);
    // The expiry the EVENT carried, not one this function invented.
    expect((data.expiresAt as Timestamp).toMillis()).toBe(expiresAt);

    // One delivery, one ledger row — the replay did not write a second.
    expect(await ledgerIds()).toEqual(['evt-a']);
    const row = (await db.collection('webhook_events').doc('evt-a').get()).data()!;
    expect(row.uid).toBe(UID);
    expect(row.type).toBe('INITIAL_PURCHASE');
    expect(row.productId).toBe('divit_pro_monthly');
    expect(row.environment).toBe('PRODUCTION');
    expect(row.mutation).toBe('set-pro');
    expect(row.reason).toBeNull();
  });

  it('replaying a trip-pass purchase does not grant a second pass', async () => {
    // The replay case that actually costs money: extend-trip-pass is a
    // read-modify-write, so a replayed delivery would hand out 28 days for one
    // payment if the ledger guard were not inside the transaction.
    const before = Date.now();
    const first = applied(await applyRevenueCatEvent(passEvent('evt-p1')));
    expect(first.mutation.kind).toBe('extend-trip-pass');

    const granted = passMillis(await entitlementData());
    expect(granted).toBeGreaterThanOrEqual(before + FOURTEEN_DAYS_MS);
    expect(granted).toBeLessThan(before + FOURTEEN_DAYS_MS + 60_000);

    const replay = await applyRevenueCatEvent(passEvent('evt-p1'));
    // Soft: protects the two durable assertions below — that the doc did not
    // gain a second 14 days, and that no second ledger row appeared.
    expect.soft(replay).toEqual({ status: 'duplicate' });

    // Byte-identical to before the replay — not "roughly", not "still set".
    expect(passMillis(await entitlementData())).toBe(granted);
    expect(await ledgerIds()).toEqual(['evt-p1']);
  });

  it('three CONCURRENT deliveries of one pass event grant 14 days, not 42', async () => {
    // The case the sequential replay test above cannot reach, and the only
    // thing that distinguishes the replay guard's ACTUAL placement (a `tx.get`
    // inside the transaction) from the obvious wrong one (an `eventRef.get()`
    // before it). With the check outside, all three deliveries read "absent",
    // all three then contend on the entitlement doc, and Firestore's own
    // transaction retries re-read the freshly-extended expiry — turning one
    // payment into 42 days. Verified by mutation: moving the guard out of the
    // transaction leaves every other test in this file green, and fails here
    // with `['applied','applied','applied']` and a 42-day grant.
    //
    // THE `attempt` LOOP IS NOT FLAKE-HIDING — read this before deleting it.
    // It works around a defect in the EMULATOR, not in the code under test.
    // When three transactions contend, the Node client retries an ABORTED one
    // by REUSING the original transaction id; the emulator has already
    // discarded it and answers INVALID_ARGUMENT "Transaction is invalid or
    // closed" from `EmulatorTransactionManager.reuseExisting`, which is not a
    // retryable status, so that one delivery dies. Measured at roughly one run
    // in six. Real Firestore returns ABORTED and the retry succeeds; and even
    // if it did not, a rejected delivery is a 500 and RevenueCat re-delivers,
    // so it is not a correctness problem in production — only an unusable
    // signal in a test.
    //
    // So: retry the whole RACE (after wiping, with a fresh event id) until one
    // round completes without that emulator fault, and then assert at FULL
    // strength — exactly one `applied`, exactly 14 days, exactly one row.
    // Nothing is softened, and a genuine bug cannot hide in here: a broken
    // guard produces three clean `applied`s with no emulator fault at all.
    const EMULATOR_TX_FAULT = /Transaction is invalid or closed/;
    const ATTEMPTS = 4;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      if (attempt > 1) await clearFirestore();
      const eventId = `evt-race-${attempt}`;
      const before = Date.now();

      const settled = await Promise.allSettled([
        applyRevenueCatEvent(passEvent(eventId)),
        applyRevenueCatEvent(passEvent(eventId)),
        applyRevenueCatEvent(passEvent(eventId)),
      ]);

      const rejections = settled.flatMap((s) => (s.status === 'rejected' ? [s.reason] : []));
      // Only the one known emulator fault is tolerated. Any OTHER rejection is
      // a real failure and must surface, not be retried away.
      const unexpected = rejections.filter((r) => !EMULATOR_TX_FAULT.test(String(r)));
      expect(unexpected.map(String)).toEqual([]);
      if (rejections.length > 0) {
        if (attempt === ATTEMPTS) {
          throw new Error(
            `emulator dropped a transaction in all ${ATTEMPTS} race attempts: ${rejections.map(String).join(' | ')}`,
          );
        }
        continue;
      }

      const kinds = settled
        .map((s) => (s as PromiseFulfilledResult<ApplyOutcome>).value.status)
        .sort();
      // Soft: WHICH delivery won is not the point, and if this ever reads
      // ['applied','applied','duplicate'] the two durable assertions below are
      // what say how much money that cost.
      expect.soft(kinds).toEqual(['applied', 'duplicate', 'duplicate']);

      // DURABLE 1: exactly one pass duration was granted. Measured from
      // `before` rather than compared against the granted value, so a doubled
      // or tripled grant fails instead of agreeing with itself.
      const granted = passMillis(await entitlementData());
      expect(granted - before).toBeGreaterThanOrEqual(FOURTEEN_DAYS_MS);
      expect(granted - before).toBeLessThan(FOURTEEN_DAYS_MS + 60_000);
      // Spelled out so a failure names the actual defect rather than a window.
      expect(granted - before).toBeLessThan(2 * FOURTEEN_DAYS_MS);

      // DURABLE 2: one event id, one ledger row — three deliveries did not
      // each record one.
      expect(await ledgerIds()).toEqual([eventId]);
      return;
    }
    // Timeout raised past the suite default: a faulted attempt costs ~9s of
    // client backoff before it gives up, and this test may need to redo one.
  }, 60_000);

  it('a pass purchase by a BRAND-NEW user never writes `plan`', async () => {
    // The "a pass must not touch the subscription fields" invariant was pinned
    // only by the Pro-subscriber case below, which proves `plan` SURVIVES a
    // pass. It does not prove `plan` is never WRITTEN — an implementation that
    // set `plan: 'pro'` in the extend-trip-pass branch would pass that test and
    // silently promote every pass buyer to a full subscriber whose entitlement
    // never lapses on the subscription path.
    const before = Date.now();
    const outcome = applied(await applyRevenueCatEvent(passEvent('evt-newuser')));
    expect(outcome.mutation.kind).toBe('extend-trip-pass');

    const data = await entitlementData();
    // The whole invariant, on the path where the doc did not exist beforehand.
    expect(data.plan).toBeUndefined();
    // Same reasoning for the subscription-only fields the pass branch must not
    // invent: no `expiresAt` (that is the SUBSCRIPTION expiry) and no grace flag.
    expect(data.expiresAt).toBeUndefined();
    expect(data.inGracePeriod).toBeUndefined();

    // ...and the fields it IS responsible for really were written, so the
    // assertions above are not passing against an empty doc.
    expect(data.source).toBe('revenuecat');
    const pass = passMillis(data);
    expect(pass - before).toBeGreaterThanOrEqual(FOURTEEN_DAYS_MS);
    expect(pass - before).toBeLessThan(FOURTEEN_DAYS_MS + 60_000);
  });

  it('EXTENDS a live pass by exactly 14 more days instead of restarting it', async () => {
    await applyRevenueCatEvent(passEvent('evt-p1'));
    const first = passMillis(await entitlementData());

    const second = applied(await applyRevenueCatEvent(passEvent('evt-p2')));
    const stored = passMillis(await entitlementData());

    // Anchored on the LIVE existing expiry, so the delta is exactly one pass
    // duration. A restart-at-now implementation would give a delta near zero.
    expect(stored - first).toBe(FOURTEEN_DAYS_MS);
    // The returned mutation and the persisted doc agree.
    expect(second.mutation).toEqual({
      kind: 'extend-trip-pass',
      tripPassExpiresAt: stored,
    });
  });

  it('does not downgrade an active Pro subscriber who also buys a pass', async () => {
    const proExpiry = Date.now() + THIRTY_DAYS_MS;
    await applyRevenueCatEvent(proEvent('evt-a', proExpiry));

    const before = Date.now();
    await applyRevenueCatEvent(passEvent('evt-p1'));

    const data = await entitlementData();
    // The pass write must not touch `plan` or the subscription expiry.
    expect(data.plan).toBe('pro');
    expect((data.expiresAt as Timestamp).toMillis()).toBe(proExpiry);
    const pass = passMillis(data);
    expect(pass).toBeGreaterThanOrEqual(before + FOURTEEN_DAYS_MS);
    expect(pass).toBeLessThan(before + FOURTEEN_DAYS_MS + 60_000);
  });

  it('keeps a live pass intact when the subscription EXPIRES', async () => {
    await applyRevenueCatEvent(proEvent('evt-a', Date.now() + THIRTY_DAYS_MS));
    await applyRevenueCatEvent(passEvent('evt-p1'));
    const passBefore = passMillis(await entitlementData());

    const outcome = applied(await applyRevenueCatEvent(lifecycleEvent('evt-exp', 'EXPIRATION')));
    expect(outcome.mutation).toEqual({ kind: 'clear-pro' });

    const data = await entitlementData();
    expect(data.plan).toBe('free');
    expect(data.inGracePeriod).toBe(false);
    // Unchanged to the millisecond — clear-pro must not clear the pass.
    expect(passMillis(data)).toBe(passBefore);
  });

  it('CANCELLATION leaves Pro intact and is ignored for the documented reason', async () => {
    const proExpiry = Date.now() + THIRTY_DAYS_MS;
    await applyRevenueCatEvent(proEvent('evt-a', proExpiry));

    const outcome = applied(await applyRevenueCatEvent(lifecycleEvent('evt-c', 'CANCELLATION')));
    // Not merely "ignored" — ignored BECAUSE cancellation defers to EXPIRATION.
    // Any other reason would mean it was dropped by accident, not by design.
    //
    // Soft: the reason is the diagnostic; the durable assertions it protects
    // are that Pro and its expiry are untouched, and that the ledger row was
    // written with that reason. If the reason string ever changes, those three
    // still have to run — "cancellation revoked Pro" is the expensive failure,
    // and a hard assertion here would hide it.
    expect.soft(outcome.mutation).toEqual({
      kind: 'ignore',
      reason: 'cancellation-defers-to-expiration',
    });

    const data = await entitlementData();
    expect(data.plan).toBe('pro');
    expect((data.expiresAt as Timestamp).toMillis()).toBe(proExpiry);

    // The ledger row IS written for an ignored event, so RevenueCat stops
    // retrying it, and it carries the reason.
    const row = (await db.collection('webhook_events').doc('evt-c').get()).data()!;
    expect(row.mutation).toBe('ignore');
    expect(row.reason).toBe('cancellation-defers-to-expiration');
  });

  it('accepts a SANDBOX purchase in production and stamps the environment', async () => {
    // Deliberate: App Store reviewers buy against prod via StoreKit sandbox.
    // The grant is honoured, and `environment` on the doc is what keeps it
    // distinguishable from a paid one afterwards.
    //
    // The PASS runs first, against an empty doc, so its own stamp is proven
    // rather than inherited from a preceding subscription write.
    const pass = applied(await applyRevenueCatEvent(passEvent('evt-sb-pass', 'SANDBOX')));
    expect(pass.mutation.kind).toBe('extend-trip-pass');
    const afterPass = await entitlementData();
    expect(afterPass.environment).toBe('SANDBOX');
    passMillis(afterPass);

    const expiresAt = Date.now() + THIRTY_DAYS_MS;
    const pro = applied(await applyRevenueCatEvent(proEvent('evt-sb', expiresAt, 'SANDBOX')));
    expect(pro.mutation).toEqual({ kind: 'set-pro', expiresAt, inGracePeriod: false });

    const afterPro = await entitlementData();
    expect(afterPro.plan).toBe('pro');
    expect(afterPro.environment).toBe('SANDBOX');
  });

  it('drops an unknown product with a reason, writing the ledger row but no entitlement', async () => {
    const outcome = applied(
      await applyRevenueCatEvent({
        ...proEvent('evt-unknown', Date.now() + THIRTY_DAYS_MS),
        product_id: 'divit_not_a_real_product',
      }),
    );
    expect(outcome.mutation).toEqual({ kind: 'ignore', reason: 'unknown-product' });

    // No entitlement — but the ledger row exists so the retry stops.
    expect((await entitlement()).exists).toBe(false);
    expect(await ledgerIds()).toEqual(['evt-unknown']);
    expect((await db.collection('webhook_events').doc('evt-unknown').get()).data()!.reason).toBe(
      'unknown-product',
    );
  });

  it('refuses an absurd expiry as `expiry-out-of-range` instead of throwing', async () => {
    // `planEntitlementMutation` only checks `Number.isFinite`, so 1e18 reaches
    // `boundExpiry` intact. Without that guard `Timestamp.fromMillis(1e18)`
    // THROWS inside the transaction: no commit, no ledger row, a 500, and after
    // six attempts RevenueCat discards a paid purchase leaving only a stack
    // trace. With it, the event is refused, recorded, and diagnosable.
    //
    // The log level is asserted too, because "diagnosable" is the entire
    // justification for this guard and nothing else in the repo pins
    // IGNORE_IS_ERROR membership. A reason that fell out of that set would log
    // at `warn` alongside every routine cancellation and never page anyone —
    // which is indistinguishable, in production, from not noticing at all.
    const errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const infoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    let outcome: Extract<ApplyOutcome, { status: 'applied' }>;
    try {
      outcome = applied(await applyRevenueCatEvent(proEvent('evt-huge', 1e18)));

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][1]).toMatchObject({
        eventId: 'evt-huge',
        reason: 'expiry-out-of-range',
      });
      // And NOT at either quieter level — the point of the split is that this
      // reason is the loud one.
      expect(warnSpy).not.toHaveBeenCalled();
      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      infoSpy.mockRestore();
    }

    // The REASON, not merely "it was ignored" — `expiry-out-of-range` is in
    // IGNORE_IS_ERROR precisely because it means a customer paid and got
    // nothing, so it must be the reason that reaches both the alerting log line
    // above and the ledger row below. Any other reason would mean the event was
    // dropped by accident rather than by this guard.
    expect(outcome.mutation).toEqual({ kind: 'ignore', reason: 'expiry-out-of-range' });

    // Fail CLOSED: refused outright, never clamped to some plausible expiry.
    // A decade-plus of free Pro from one malformed event is the outcome this
    // guard exists to prevent, so "no entitlement doc at all" is the assertion.
    expect((await entitlement()).exists).toBe(false);

    // The ledger row IS written, so the redelivery stops rather than burning
    // all six attempts on an event we will never accept.
    expect(await ledgerIds()).toEqual(['evt-huge']);
    const row = (await db.collection('webhook_events').doc('evt-huge').get()).data()!;
    expect(row.mutation).toBe('ignore');
    expect(row.reason).toBe('expiry-out-of-range');
  });

  it('survives a NESTED-ARRAY product_id, which the server rejects at COMMIT', async () => {
    // The narrowing `asStringOrNull` does, and the only shape that proves it.
    // `?? null` would let `[[1]]` through: `tx.set` accepts it, the client
    // serializer encodes it, and the SERVER rejects the whole transaction with
    // `3 INVALID_ARGUMENT: Cannot convert an array value in an array value`.
    // That rejection means the ledger row recording the drop is never written
    // either, so the purchase is retried six times and then lost silently.
    // Verified by mutation: swapping `asStringOrNull(event.product_id)` for
    // `event.product_id ?? null` on the ledger write makes this call REJECT.
    const outcome = await applyRevenueCatEvent({
      ...passEvent('evt-nested'),
      product_id: [[1]] as unknown as string,
    });

    // 1. It did not throw — the commit went through.
    expect(outcome.status).toBe('applied');
    // 2. And it was dropped for the honest reason: an unrecognized product.
    expect(applied(outcome).mutation).toEqual({ kind: 'ignore', reason: 'unknown-product' });

    // 3. The ledger row exists and is NOT corrupt: the field is narrowed to
    //    null, not stored as whatever the payload carried.
    expect(await ledgerIds()).toEqual(['evt-nested']);
    const row = (await db.collection('webhook_events').doc('evt-nested').get()).data()!;
    expect(row.productId).toBeNull();
    expect(row.uid).toBe(UID);
    expect(row.type).toBe('NON_RENEWING_PURCHASE');
    expect(row.reason).toBe('unknown-product');

    // 4. Nothing was granted off a payload we could not read.
    expect((await entitlement()).exists).toBe(false);
  });

  it('survives a NESTED-ARRAY environment on a GRANTING write', async () => {
    // The `product_id` case above can only ever reach the LEDGER write: an
    // unrecognized product short-circuits to `ignore`, so `tx.set(entRef, ...)`
    // is never called. `environment` is different — it is written to the
    // ENTITLEMENT doc too (the `set-pro` and `extend-trip-pass` arms), so an
    // un-narrowed value there rejects the GRANT transaction itself and a paying
    // customer silently gets nothing.
    //
    // Hence a VALID product with a poisoned `environment`: the only shape that
    // exercises those two call sites. Found by review — all three
    // `asStringOrNull(event.environment)` sites could be swapped for
    // `event.environment ?? null` with the entire suite still green.
    const outcome = await applyRevenueCatEvent({
      ...passEvent('evt-env'),
      environment: [[1]] as unknown as string,
    });

    // 1. The grant COMMITTED rather than being rejected by the server.
    expect.soft(applied(outcome).mutation.kind).toBe('extend-trip-pass');

    // 2. The durable point: the pass was actually granted, and the unreadable
    //    field was narrowed to null instead of poisoning the doc.
    const data = await entitlementData();
    expect(data.environment).toBeNull();
    expect(data.tripPassExpiresAt).toBeInstanceOf(Timestamp);
    expect(data.source).toBe('revenuecat');

    // 3. The ledger row is likewise intact, so the delivery is not retried.
    expect(await ledgerIds()).toEqual(['evt-env']);
    const row = (await db.collection('webhook_events').doc('evt-env').get()).data()!;
    expect(row.environment).toBeNull();
    expect(row.mutation).toBe('extend-trip-pass');
  });

  describe('rejects before any write', () => {
    // These pin the validation that moved INTO the core, so a direct caller
    // (a test, or chunk 5's reconciler) gets the same protection the HTTP shell
    // used to provide alone. Verified by mutation: drop the id check and the
    // event THROWS on the doc path (a 500 — so RevenueCat burns all 6 attempts
    // and then DISCARDS the purchase); drop the type check and it COMMITS
    // instead, putting a garbage `type` in the ledger row. Hence both the
    // returned status AND "nothing was written" are asserted.
    //
    // Every clause of `isValidDocId` is listed below ON PURPOSE. The 1500-byte
    // clause in particular was found unpinned by review — deleting it left all
    // 12 tests green — and an over-long id is the WORST case of the set: unlike
    // '' or 'a/b' it does not throw client-side, it dies at COMMIT, so no
    // ledger row is written and the loss is silent.
    it('rejects an event id that is not a usable document id', async () => {
      const bad = ['', 'evt/a', '.', '..', '__evt__', 'x'.repeat(1501)];
      for (const id of bad) {
        const outcome = await applyRevenueCatEvent(proEvent(id, Date.now() + THIRTY_DAYS_MS));
        expect(outcome).toEqual({ status: 'rejected', reason: 'invalid-event-id' });
      }
      const outcome = await applyRevenueCatEvent({
        ...proEvent('placeholder', Date.now() + THIRTY_DAYS_MS),
        id: 12345 as unknown as string,
      });
      expect(outcome).toEqual({ status: 'rejected', reason: 'invalid-event-id' });

      expect(await ledgerIds()).toEqual([]);
      expect((await entitlement()).exists).toBe(false);
    });

    it('rejects a non-string event type', async () => {
      const outcome = await applyRevenueCatEvent({
        ...proEvent('evt-badtype', Date.now() + THIRTY_DAYS_MS),
        type: ['INITIAL_PURCHASE'] as unknown as string,
      });
      // Soft, so the "nothing was written" assertions below still run if the
      // guard is ever removed — verified: without it this event COMMITS, and a
      // garbage `type` lands in the ledger row (a nested array would instead
      // fail at commit, leaving the retry-stopping row unwritten).
      expect.soft(outcome).toEqual({ status: 'rejected', reason: 'invalid-event-type' });

      expect(await ledgerIds()).toEqual([]);
      expect((await entitlement()).exists).toBe(false);
    });

    it('reports unresolved-uid, and writes nothing, when no real uid is on the event', async () => {
      const anonymous = await applyRevenueCatEvent({
        ...proEvent('evt-anon', Date.now() + THIRTY_DAYS_MS),
        app_user_id: '$RCAnonymousID:abc123',
        original_app_user_id: '$RCAnonymousID:abc123',
      });
      // Soft, here and on `slashed` below, for the same reason: the returned
      // status is the diagnostic, and the durable assertions both of them
      // protect are the two at the end of this test — no ledger row and no
      // entitlement doc. Those are what make the shell's 422 safe. A hard
      // assertion on either status would abort before they ran, so a change
      // that started writing a ledger row here could hide behind a status
      // regression.
      expect.soft(anonymous).toEqual({ status: 'unresolved-uid' });

      // Resolvable, but not addressable as a document id.
      const slashed = await applyRevenueCatEvent({
        ...proEvent('evt-slash', Date.now() + THIRTY_DAYS_MS),
        app_user_id: 'tenant/user-1',
      });
      expect.soft(slashed).toEqual({ status: 'unresolved-uid' });

      // Crucially: no ledger row either. A uid we cannot place is not a
      // "handled" event — it must stay re-deliverable once the alias lands.
      // This is load-bearing, not tidiness: the HTTP shell returns 422 for this
      // outcome precisely so RevenueCat DOES re-deliver (5/10/20/40/80 min), and
      // a ledger row here would make the retry a no-op `duplicate` and strand
      // the purchase permanently.
      expect(await ledgerIds()).toEqual([]);
      const all = await db.collection('entitlements').get();
      expect(all.size).toBe(0);
    });

    it('falls back to an alias when app_user_id is anonymous', async () => {
      // The inverse of the case above: proves unresolved-uid is returned for
      // the RIGHT reason (nothing resolvable), not because resolution is broken.
      const expiresAt = Date.now() + THIRTY_DAYS_MS;
      const outcome = applied(
        await applyRevenueCatEvent({
          ...proEvent('evt-alias', expiresAt),
          app_user_id: '$RCAnonymousID:abc123',
          aliases: ['$RCAnonymousID:abc123', UID],
        }),
      );
      expect(outcome.mutation).toEqual({ kind: 'set-pro', expiresAt, inGracePeriod: false });
      expect((await entitlementData()).plan).toBe('pro');
    });
  });
});
