# Monetization Chunk 4 — RevenueCat Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it possible to pay — a RevenueCat webhook that writes
`entitlements/{userId}` server-side, plus the native SDK wiring that identifies
the purchaser as their Firebase UID.

**Architecture:** `Purchase → RevenueCat → webhook → Cloud Function →
entitlements/{userId}` (Admin SDK only). All decision logic is a **pure
function** in `shared/` so it is testable without the emulator; the Cloud
Function is a thin transactional shell around it. Enforcement stays server-side;
the client entitlement read is a rendering hint only. Every write is idempotent
on RevenueCat's `event.id`.

**Tech Stack:** Firebase Cloud Functions v2 (`onRequest`), Firestore Admin SDK,
`@revenuecat/purchases-capacitor`, Vitest (unit + emulator integration).

**Prerequisite from Track A:** RevenueCat project linked to both stores, with the
3 products created. Code and tests below need none of it; **manual end-to-end
verification does.**

---

## Design decisions locked before coding

**Idempotency key is `event.id`, not `transaction_id`.** RevenueCat retries
deliver the _same_ `event.id`, which is what we want to dedupe. `transaction_id`
is stable across RENEWAL events for the same subscription, so keying on it would
silently drop legitimate renewals.

**`CANCELLATION` must NOT revoke access.** It means "will not renew," not
"access ends now." The user keeps Pro until `EXPIRATION`. Revoking here is the
classic bug that turns a cancelling customer into a support ticket and a refund.

**Trip Pass extends, never stacks.** `expiresAt = max(now, existing) + 14d`.
Using `now + 14d` would rob a user who buys early of the days they paid for.
`NON_RENEWING_PURCHASE` carries `expiration_at_ms: null` — confirmed in
RevenueCat's own sample payloads — so the expiry **must** be computed server-side.

**Trip Pass writes `tripPassExpiresAt`, not `plan`.** `shared/entitlements.ts:81`
already resolves a pass held _alongside_ a subscription, and spec §5.1 requires
the two not to overwrite each other. Writing `plan: 'trip_pass'` over an active
Pro subscription would downgrade a paying customer.

**Unknown product id or event type → no write, log, return 200.** Fail closed:
never mint a plan from a payload we do not understand. Returning 200 stops
RevenueCat retrying something that will never succeed.

**Sandbox events are recorded but never grant in prod.** `environment` is
`SANDBOX` or `PRODUCTION`. A sandbox purchase granting real Pro in prod is a
free-Pro coupon for anyone with a test device.

---

## File structure

| File                                                     | Responsibility                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Create `shared/revenueCatEvents.ts`                      | Pure: event payload → intended entitlement mutation. No Firebase imports. |
| Create `tests/revenueCatEvents.test.ts`                  | Unit tests for the above.                                                 |
| Create `functions/src/revenueCatWebhook.ts`              | HTTPS endpoint: auth, idempotency, transactional apply.                   |
| Create `tests/integration/revenueCatWebhook.int.test.ts` | Emulator-backed: replay, ordering, extension.                             |
| Modify `functions/src/index.ts`                          | Export the webhook; fold in the burned-scan fix.                          |
| Modify `firestore.rules`                                 | Deny all client access to `webhook_events/`.                              |
| Create `src/services/purchaseService.ts`                 | Client SDK: configure with Firebase UID, offerings, purchase, restore.    |
| Modify `src/contexts/AuthContext.tsx`                    | Call `Purchases.logIn/logOut` alongside auth state.                       |

---

### Task 1: Pure event → mutation mapping

**Files:**

- Create: `shared/revenueCatEvents.ts`
- Test: `tests/revenueCatEvents.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/revenueCatEvents.test.ts
import { describe, it, expect } from 'vitest';
import { planEntitlementMutation, TRIP_PASS_DURATION_MS } from '@shared/revenueCatEvents';

const NOW = 1_700_000_000_000;
const base = { id: 'evt-1', app_user_id: 'uid-1', environment: 'PRODUCTION' as const };

describe('planEntitlementMutation', () => {
  it('grants pro on INITIAL_PURCHASE using the event expiry', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: NOW + 1000,
      },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'set-pro', expiresAt: NOW + 1000, inGracePeriod: false });
  });

  it('does NOT revoke on CANCELLATION — access runs to expiry', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'CANCELLATION', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m.kind).toBe('ignore');
  });

  it('clears pro on EXPIRATION', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'EXPIRATION', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'clear-pro' });
  });

  it('flags grace on BILLING_ISSUE', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'BILLING_ISSUE', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'set-grace' });
  });

  it('starts a trip pass from now when none is active', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_trip_pass_14d',
        expiration_at_ms: null,
      },
      null,
      NOW,
    );
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: NOW + TRIP_PASS_DURATION_MS });
  });

  it('EXTENDS an active trip pass rather than restarting it', () => {
    const active = NOW + 5 * 24 * 60 * 60 * 1000;
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_trip_pass_14d',
        expiration_at_ms: null,
      },
      { tripPassExpiresAt: active },
      NOW,
    );
    expect(m).toEqual({
      kind: 'extend-trip-pass',
      tripPassExpiresAt: active + TRIP_PASS_DURATION_MS,
    });
  });

  it('restarts from now when the previous pass already lapsed', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'NON_RENEWING_PURCHASE',
        product_id: 'divit_trip_pass_14d',
        expiration_at_ms: null,
      },
      { tripPassExpiresAt: NOW - 1 },
      NOW,
    );
    expect(m).toEqual({ kind: 'extend-trip-pass', tripPassExpiresAt: NOW + TRIP_PASS_DURATION_MS });
  });

  it('ignores an unknown product id', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'INITIAL_PURCHASE', product_id: 'mystery', expiration_at_ms: NOW + 1 },
      null,
      NOW,
    );
    expect(m.kind).toBe('ignore');
  });

  it('ignores an unknown event type', () => {
    const m = planEntitlementMutation(
      { ...base, type: 'SOMETHING_NEW', product_id: 'divit_pro_monthly' },
      null,
      NOW,
    );
    expect(m.kind).toBe('ignore');
  });

  it('ignores a SANDBOX event when the server is production', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        environment: 'SANDBOX',
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: NOW + 1,
      },
      null,
      NOW,
      /* acceptSandbox */ false,
    );
    expect(m.kind).toBe('ignore');
  });

  it('refuses pro with no expiry rather than granting it forever', () => {
    const m = planEntitlementMutation(
      {
        ...base,
        type: 'INITIAL_PURCHASE',
        product_id: 'divit_pro_monthly',
        expiration_at_ms: null,
      },
      null,
      NOW,
    );
    expect(m.kind).toBe('ignore');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/revenueCatEvents.test.ts`
Expected: FAIL — `Cannot find module '@shared/revenueCatEvents'`.

- [ ] **Step 3: Implement the pure module**

```typescript
// shared/revenueCatEvents.ts
/**
 * Pure mapping from a RevenueCat webhook event to the entitlement change it
 * implies. No imports — compiled into the Cloud Functions build (see
 * shared/entitlements.ts for why every relative import elsewhere ends in .js).
 *
 * FAIL CLOSED EVERYWHERE. An unrecognised product, type, or a paid event with
 * no expiry produces `ignore`, never a grant. One malformed webhook must not be
 * able to mint a permanent subscription.
 */

export const TRIP_PASS_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

/** Store product id → the plan it confers. Ids are fixed at store creation. */
export const PRODUCT_PLANS: Record<string, 'pro' | 'trip_pass'> = {
  divit_pro_monthly: 'pro',
  divit_pro_annual: 'pro',
  divit_trip_pass_14d: 'trip_pass',
};

export interface RevenueCatEvent {
  id: string;
  type: string;
  product_id?: string;
  app_user_id?: string;
  aliases?: string[];
  original_app_user_id?: string;
  expiration_at_ms?: number | null;
  environment?: string;
}

export interface CurrentEntitlement {
  tripPassExpiresAt?: number;
}

export type EntitlementMutation =
  | { kind: 'set-pro'; expiresAt: number; inGracePeriod: false }
  | { kind: 'clear-pro' }
  | { kind: 'set-grace' }
  | { kind: 'extend-trip-pass'; tripPassExpiresAt: number }
  | { kind: 'ignore'; reason?: string };

const GRANTS_PRO = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
]);

export function planEntitlementMutation(
  event: RevenueCatEvent,
  current: CurrentEntitlement | null,
  nowMs: number,
  acceptSandbox = false,
): EntitlementMutation {
  if (event.environment === 'SANDBOX' && !acceptSandbox) {
    return { kind: 'ignore', reason: 'sandbox-event-in-production' };
  }

  const plan = event.product_id ? PRODUCT_PLANS[event.product_id] : undefined;
  if (!plan) return { kind: 'ignore', reason: 'unknown-product' };

  if (event.type === 'NON_RENEWING_PURCHASE') {
    if (plan !== 'trip_pass') return { kind: 'ignore', reason: 'non-renewing-non-pass' };
    // Extend, never restart: a user who buys early must not lose paid days.
    // `expiration_at_ms` is null on these events, so we compute it ourselves.
    const existing = current?.tripPassExpiresAt;
    const anchor = typeof existing === 'number' && existing > nowMs ? existing : nowMs;
    return { kind: 'extend-trip-pass', tripPassExpiresAt: anchor + TRIP_PASS_DURATION_MS };
  }

  if (plan !== 'pro') return { kind: 'ignore', reason: 'pass-product-on-subscription-event' };

  if (GRANTS_PRO.has(event.type)) {
    const expiresAt = event.expiration_at_ms;
    // A `pro` grant we cannot date would be permanent — refuse it.
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) {
      return { kind: 'ignore', reason: 'pro-grant-without-expiry' };
    }
    return { kind: 'set-pro', expiresAt, inGracePeriod: false };
  }

  if (event.type === 'BILLING_ISSUE') return { kind: 'set-grace' };
  if (event.type === 'EXPIRATION') return { kind: 'clear-pro' };

  // CANCELLATION means "will not renew", NOT "access ends now" — the user keeps
  // Pro until EXPIRATION. Revoking here would cut off someone who has paid
  // through the end of their period.
  if (event.type === 'CANCELLATION')
    return { kind: 'ignore', reason: 'cancellation-defers-to-expiration' };
  if (event.type === 'SUBSCRIPTION_PAUSED')
    return { kind: 'ignore', reason: 'pause-defers-to-expiration' };

  return { kind: 'ignore', reason: 'unhandled-event-type' };
}

/**
 * RevenueCat may report an anonymous id in `app_user_id` with the real one in
 * `aliases`. We set `appUserID` to the Firebase UID at configure time, so the
 * real uid is whichever value is not an `$RCAnonymousID:`.
 */
export function resolveFirebaseUid(event: RevenueCatEvent): string | undefined {
  const candidates = [event.app_user_id, ...(event.aliases ?? []), event.original_app_user_id];
  return candidates.find(
    (c): c is string => typeof c === 'string' && c.length > 0 && !c.startsWith('$RCAnonymousID:'),
  );
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run tests/revenueCatEvents.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Add uid-resolution tests and make them pass**

```typescript
// append to tests/revenueCatEvents.test.ts
import { resolveFirebaseUid } from '@shared/revenueCatEvents';

describe('resolveFirebaseUid', () => {
  it('prefers a real app_user_id', () => {
    expect(resolveFirebaseUid({ id: 'e', type: 'x', app_user_id: 'uid-1' })).toBe('uid-1');
  });
  it('falls back to a non-anonymous alias', () => {
    expect(
      resolveFirebaseUid({
        id: 'e',
        type: 'x',
        app_user_id: '$RCAnonymousID:abc',
        aliases: ['$RCAnonymousID:abc', 'uid-2'],
      }),
    ).toBe('uid-2');
  });
  it('returns undefined when every id is anonymous', () => {
    expect(
      resolveFirebaseUid({ id: 'e', type: 'x', app_user_id: '$RCAnonymousID:abc' }),
    ).toBeUndefined();
  });
});
```

Run: `npx vitest run tests/revenueCatEvents.test.ts` → PASS, 14 tests.

- [ ] **Step 6: Commit**

```bash
git add shared/revenueCatEvents.ts tests/revenueCatEvents.test.ts
git commit -m "feat(monetization): pure RevenueCat event to entitlement mapping"
```

---

### Task 2: The webhook endpoint

**Files:**

- Create: `functions/src/revenueCatWebhook.ts`
- Modify: `functions/src/index.ts`
- Modify: `firestore.rules`

- [ ] **Step 1: Deny client access to the idempotency ledger**

In `firestore.rules`, beside the existing `entitlements` / `usage` blocks:

```
    // Webhook replay ledger. Admin SDK only — a client that could delete a row
    // here could replay a purchase event and extend its own Trip Pass.
    match /webhook_events/{eventId} {
      allow read: if false;
      allow write: if false;
    }
```

- [ ] **Step 2: Write the handler**

```typescript
// functions/src/revenueCatWebhook.ts
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { timingSafeEqual } from 'node:crypto';
import { planEntitlementMutation, resolveFirebaseUid } from '../../shared/revenueCatEvents.js';

const revenueCatWebhookSecret = defineSecret('REVENUECAT_WEBHOOK_SECRET');

/** Constant-time compare that cannot leak length via early return. */
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
      // No detail in the body — an attacker probing this must learn nothing.
      logger.warn('revenueCatWebhook: rejected unauthorized delivery');
      res.status(401).send('Unauthorized');
      return;
    }

    const event = req.body?.event;
    if (!event || typeof event.id !== 'string' || typeof event.type !== 'string') {
      // 400 rather than 500: RevenueCat should not retry a malformed body.
      res.status(400).send('Bad Request');
      return;
    }

    const uid = resolveFirebaseUid(event);
    if (!uid) {
      // Anonymous purchaser — nothing to attach the entitlement to. 200 so it
      // is not retried forever; logged so it can be reconciled by support.
      logger.error('revenueCatWebhook: no Firebase uid on event', {
        eventId: event.id,
        type: event.type,
      });
      res.status(200).send('OK');
      return;
    }

    try {
      await applyRevenueCatEvent(event);
      res.status(200).send('OK');
    } catch (error) {
      // 500 so RevenueCat RETRIES — the event ledger makes that safe.
      logger.error('revenueCatWebhook: transaction failed', {
        eventId: event.id,
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).send('Internal Error');
    }
  },
);

/**
 * The transactional core, exported so integration tests can drive it directly
 * without an HTTPS shell — the same split as `processLedgerWrite`
 * (functions/src/ledgerProcessor.ts), which is how every other pipeline in this
 * repo is tested.
 */
export async function applyRevenueCatEvent(event: RevenueCatEvent): Promise<void> {
  const uid = resolveFirebaseUid(event);
  if (!uid) return;

  const db = getFirestore();
  const eventRef = db.collection('webhook_events').doc(event.id);
  const entRef = db.collection('entitlements').doc(uid);

  await db.runTransaction(async (tx) => {
    // Replay guard INSIDE the transaction: two concurrent deliveries of the
    // same event would otherwise both read "absent" and both apply.
    const seen = await tx.get(eventRef);
    if (seen.exists) {
      logger.info('revenueCatWebhook: duplicate delivery ignored', { eventId: event.id });
      return;
    }

    const entSnap = await tx.get(entRef);
    const data = entSnap.data() ?? {};
    const tripPassExpiresAt =
      data.tripPassExpiresAt instanceof Timestamp ? data.tripPassExpiresAt.toMillis() : undefined;

    const mutation = planEntitlementMutation({ ...event }, { tripPassExpiresAt }, Date.now());

    tx.set(eventRef, {
      type: event.type,
      uid,
      productId: event.product_id ?? null,
      environment: event.environment ?? null,
      mutation: mutation.kind,
      reason: 'reason' in mutation ? (mutation.reason ?? null) : null,
      receivedAt: FieldValue.serverTimestamp(),
    });

    switch (mutation.kind) {
      case 'set-pro':
        tx.set(
          entRef,
          {
            plan: 'pro',
            source: 'revenuecat',
            productId: event.product_id ?? null,
            expiresAt: Timestamp.fromMillis(mutation.expiresAt),
            inGracePeriod: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      case 'clear-pro':
        // plan goes to 'free' but tripPassExpiresAt is left ALONE — a pass
        // held alongside a lapsed subscription must survive (spec §5.1).
        tx.set(
          entRef,
          {
            plan: 'free',
            inGracePeriod: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
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
        // Writes tripPassExpiresAt, NOT plan — writing plan here would
        // downgrade an active Pro subscriber who also bought a pass.
        tx.set(
          entRef,
          {
            source: 'revenuecat',
            tripPassExpiresAt: Timestamp.fromMillis(mutation.tripPassExpiresAt),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      case 'ignore':
        logger.info('revenueCatWebhook: no entitlement change', {
          eventId: event.id,
          type: event.type,
          reason: mutation.reason,
        });
        break;
    }
  });
}
```

The core is exported so integration tests drive it directly, and so a future
"purchase succeeded but the webhook never landed" reconciliation path (chunk 5)
can reuse it unchanged. It re-resolves the uid rather than trusting the shell,
because it must be safe to call on its own.

- [ ] **Step 3: Export it**

In `functions/src/index.ts`, beside the other exports:

```typescript
export { revenueCatWebhook } from './revenueCatWebhook.js';
```

- [ ] **Step 4: Verify the functions build**

Run: `npm --prefix functions run build`
Expected: exit 0, no TS errors.

- [ ] **Step 5: Commit**

```bash
git add functions/src/revenueCatWebhook.ts functions/src/index.ts firestore.rules
git commit -m "feat(monetization): RevenueCat webhook writes entitlements idempotently"
```

---

### Task 3: Emulator-backed integration tests

**Files:**

- Create: `tests/integration/revenueCatWebhook.int.test.ts`

These cover what unit tests structurally cannot: replay, concurrency, and the
read-modify-write of a pass extension.

- [ ] **Step 1: Write the tests**

```typescript
// tests/integration/revenueCatWebhook.int.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import './helpers/env';

// Import the transactional core, not the HTTPS shell — same pattern as
// processLedgerWrite in tests/integration/ledgerPipeline.int.test.ts.
import { applyRevenueCatEvent } from '../../functions/src/revenueCatWebhook.js';

const UID = 'user-rc-1';
const db = () => getFirestore();

const proEvent = (id: string, expiresAtMs: number) => ({
  id,
  type: 'INITIAL_PURCHASE',
  product_id: 'divit_pro_monthly',
  app_user_id: UID,
  environment: 'PRODUCTION',
  expiration_at_ms: expiresAtMs,
});
const passEvent = (id: string) => ({
  id,
  type: 'NON_RENEWING_PURCHASE',
  product_id: 'divit_trip_pass_14d',
  app_user_id: UID,
  environment: 'PRODUCTION',
  expiration_at_ms: null,
});

beforeEach(async () => {
  await db().collection('entitlements').doc(UID).delete();
  const evts = await db().collection('webhook_events').get();
  await Promise.all(evts.docs.map((d) => d.ref.delete()));
});

describe('revenueCatWebhook', () => {
  it('grants pro and is idempotent on replay', async () => {
    const exp = Date.now() + 30 * 24 * 3600 * 1000;
    await applyRevenueCatEvent(proEvent('evt-a', exp));
    await applyRevenueCatEvent(proEvent('evt-a', exp)); // same id — a retry

    const snap = await db().collection('entitlements').doc(UID).get();
    expect(snap.data()?.plan).toBe('pro');
    const ledger = await db().collection('webhook_events').get();
    expect(ledger.size).toBe(1);
  });

  it('EXTENDS a pass on a second purchase instead of restarting it', async () => {
    await applyRevenueCatEvent(passEvent('evt-p1'));
    const first = (await db().collection('entitlements').doc(UID).get()).data()
      ?.tripPassExpiresAt as Timestamp;

    await applyRevenueCatEvent(passEvent('evt-p2'));
    const second = (await db().collection('entitlements').doc(UID).get()).data()
      ?.tripPassExpiresAt as Timestamp;

    const deltaDays = (second.toMillis() - first.toMillis()) / (24 * 3600 * 1000);
    expect(Math.round(deltaDays)).toBe(14);
  });

  it('does not downgrade an active Pro subscriber who buys a pass', async () => {
    await applyRevenueCatEvent(proEvent('evt-a', Date.now() + 30 * 24 * 3600 * 1000));
    await applyRevenueCatEvent(passEvent('evt-p1'));

    const data = (await db().collection('entitlements').doc(UID).get()).data();
    expect(data?.plan).toBe('pro');
    expect(data?.tripPassExpiresAt).toBeDefined();
  });

  it('keeps a live pass when the subscription expires', async () => {
    await applyRevenueCatEvent(passEvent('evt-p1'));
    await applyRevenueCatEvent({
      id: 'evt-exp',
      type: 'EXPIRATION',
      product_id: 'divit_pro_monthly',
      app_user_id: UID,
      environment: 'PRODUCTION',
    });

    const data = (await db().collection('entitlements').doc(UID).get()).data();
    expect(data?.plan).toBe('free');
    expect(data?.tripPassExpiresAt).toBeDefined();
  });

  it('CANCELLATION leaves pro intact', async () => {
    const exp = Date.now() + 30 * 24 * 3600 * 1000;
    await applyRevenueCatEvent(proEvent('evt-a', exp));
    await applyRevenueCatEvent({
      id: 'evt-c',
      type: 'CANCELLATION',
      product_id: 'divit_pro_monthly',
      app_user_id: UID,
      environment: 'PRODUCTION',
    });
    expect((await db().collection('entitlements').doc(UID).get()).data()?.plan).toBe('pro');
  });
});
```

- [ ] **Step 2: Run**

Run: `npm run test:integration -- revenueCatWebhook`
Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/revenueCatWebhook.int.test.ts
git commit -m "test(monetization): emulator coverage for webhook replay and pass extension"
```

---

### Task 4: Client SDK — identify the purchaser as their Firebase UID

**Files:**

- Create: `src/services/purchaseService.ts`
- Modify: `src/contexts/AuthContext.tsx`

This is the step that makes `app_user_id` equal the Firebase UID. Get it wrong
and every webhook arrives anonymous and grants nothing.

- [ ] **Step 1: Install**

```bash
npm install @revenuecat/purchases-capacitor
npx cap sync
```

- [ ] **Step 2: Write the service**

```typescript
// src/services/purchaseService.ts
import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

/**
 * RevenueCat is NATIVE-ONLY in this build (web billing is out of scope for
 * launch). Every function no-ops on web rather than throwing, so the same UI
 * code renders in the browser without a platform check at each call site.
 */
const isNative = () => Capacitor.isNativePlatform();

export async function configurePurchases(firebaseUid: string): Promise<void> {
  if (!isNative()) return;
  const apiKey =
    Capacitor.getPlatform() === 'ios'
      ? import.meta.env.VITE_REVENUECAT_IOS_KEY
      : import.meta.env.VITE_REVENUECAT_ANDROID_KEY;
  if (!apiKey) return;

  // appUserID MUST be the Firebase uid — it becomes `app_user_id` on every
  // webhook event and is how the server knows whose entitlement to write.
  await Purchases.configure({ apiKey, appUserID: firebaseUid });
  if (import.meta.env.DEV) await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
}

export async function identifyPurchaser(firebaseUid: string): Promise<void> {
  if (!isNative()) return;
  await Purchases.logIn({ appUserID: firebaseUid });
}

export async function forgetPurchaser(): Promise<void> {
  if (!isNative()) return;
  await Purchases.logOut();
}

export async function restorePurchases() {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}
```

- [ ] **Step 3: Wire to auth state**

In `src/contexts/AuthContext.tsx`, inside the existing `onAuthStateChanged`
handler (near the `syncUserProfile` call at ~`:95`):

```typescript
import { configurePurchases, identifyPurchaser, forgetPurchaser } from '@/services/purchaseService';

const purchasesConfigured = useRef(false);

// ...inside onAuthStateChanged(async (firebaseUser) => { ... })
try {
  if (firebaseUser) {
    // configure() is once per process; logIn() is for every subsequent user.
    if (!purchasesConfigured.current) {
      await configurePurchases(firebaseUser.uid);
      purchasesConfigured.current = true;
    } else {
      await identifyPurchaser(firebaseUser.uid);
    }
  } else if (purchasesConfigured.current) {
    await forgetPurchaser();
  }
} catch (error) {
  // NEVER block auth on billing. A RevenueCat outage must not stop people
  // using the free app — it would turn a vendor incident into a full outage.
  console.warn('purchases: identify failed (non-fatal)', error);
}
```

**Order matters:** this must run *after* `firebaseUser` is known but must not be
awaited before `setUser(...)`, or a RevenueCat timeout stalls the whole sign-in.

- [ ] **Step 4: Verify**

Run: `npm run typecheck` → must not exceed the CI ratchet of 36.
Run: `npm run build` → exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/services/purchaseService.ts src/contexts/AuthContext.tsx package.json package-lock.json
git commit -m "feat(monetization): identify RevenueCat purchases by Firebase uid"
```

---

### Task 5: App Check

Spec §6.1 — required once scans are a sold good, absent entirely today. Without
it, `analyzeBill` is callable by anything holding a Firebase config, and the
config ships in the client bundle.

- [ ] **Step 1** Register the app for App Check in the Firebase console (App
      Attest for iOS, Play Integrity for Android) and enable a debug provider for
      local dev.
- [ ] **Step 2** In `src/config/firebase.ts`, immediately after `initializeApp`:

```typescript
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// Debug provider BEFORE initializeAppCheck, or local dev and the emulator
// suite cannot obtain a token and every gated call 401s.
if (import.meta.env.DEV) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

if (import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}
```

Guarded on the key being present so a missing env var degrades to "no App
Check" rather than throwing at module scope — `src/config/firebase.ts` throwing
on import is exactly what blanked the app in CI (see
`docs/handoffs/ci-e2e-repair-0908.md`).

- [ ] **Step 3** In `functions/src/index.ts`, on the `analyzeBill` options object
      only (beside `secrets: [geminiApiKey]` at `:113`):

```typescript
enforceAppCheck: true,
```

Do not add it to other callables yet — one gate at a time, so a bad rollout has
one suspect.
- [ ] **Step 4** Deploy to **beta** and confirm a real scan still succeeds:
      `firebase deploy --only functions --project beta`, then `npm run dev:beta`.
      **Roll out in monitor mode first** — enforcing App Check before existing
      clients refresh locks them out.
- [ ] **Step 5** Commit.

---

### Task 6: Stop burning a scan on failure

**Files:** Modify `src/hooks/useReceiptAnalyzer.ts:53`, `functions/src/index.ts`

The client throws _after_ the server consumed quota, so a failed merge costs a
scan. Harmless while caps are dark; user-visible the moment they are not.

- [ ] **Step 1** Add the failing test to `tests/integration/scanUsage.int.test.ts`:

```typescript
it('does not consume quota when the extracted bill fails validation', async () => {
  const before = await readScansThisPeriod(UID);
  await expect(analyzeBillCore(UID, MALFORMED_RECEIPT_RESPONSE)).rejects.toThrow();
  expect(await readScansThisPeriod(UID)).toBe(before);
});
```

- [ ] **Step 2** Confirm it fails: `npm run test:integration -- scanUsage`
      Expected: FAIL — the counter incremented despite the throw.
- [ ] **Step 3** In `functions/src/index.ts`, move the `commitScanQuotaUsage(uid, quota)`
      call (currently `:520`) below the validation that can throw, so it runs on
      the success path only. The spec is explicit (§5.4): the counter must
      increment **only on success**, so a failed scan is never billed.
- [ ] **Step 4** Confirm the test passes; run `npm run test:integration -- scanUsage`.
- [ ] **Step 5** Commit.

---

## Definition of done

- [ ] `npm test` — 702+ passing, no regressions
- [ ] `npm run typecheck` — **≤ 36** errors (the CI ratchet)
- [ ] `npm run lint` — ≤ 71 problems (baseline)
- [ ] `npm --prefix functions run build` — exit 0
- [ ] `npm run test:integration` — all green
- [ ] `npm run test:rules` — all green (`firestore.rules` changed)
- [ ] Adversarial review by a fresh subagent (repo `CLAUDE.md` gate #3)
- [ ] Manual: a sandbox purchase on a real device writes `entitlements/{uid}`
      with the right plan and expiry **(needs Track A complete)**

## Deploy note

This chunk touches `functions/**`, `shared/**`, and `firestore.rules` — **every
push to `main` auto-deploys the backend to PRODUCTION.** The webhook is inert
until RevenueCat is pointed at it, and caps stay dark until
`paywall_enabled` flips, so shipping it early is safe. Set the secret before the
first deploy:

```bash
firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET --project prod
```

## Known deviations from the spec, and gaps left for chunk 5

**Deviation — idempotency key.** Spec §5.3 says "key the webhook handler on
RevenueCat's transaction ID." This plan keys on `event.id` instead, because
`transaction_id` is stable across RENEWAL events for one subscription, so
deduping on it would silently drop every renewal after the first. `event.id` is
unique per event and identical across retries of that event, which is exactly
the property the spec was reaching for. Flagging it because it is a conscious
departure from a written decision.

**Deferred to chunk 5 — "paid but the webhook never landed."** Spec §5.3 calls
this "the single most common consumable failure" and asks for reconciliation on
app foreground plus a manual grant path for support. `applyRevenueCatEvent` is
exported specifically so the reconciliation path can reuse it unchanged. Neither
exists after chunk 4; **a user who pays and does not get their pass has no
recovery route until chunk 5 lands.** Do not enable the Trip Pass product in the
stores before then.

---

## Open question for the owner

**Which environment should the prod webhook accept?** The plan hard-codes
`acceptSandbox = false` in production, so TestFlight and Play internal-testing
purchases will **not** grant entitlements against the prod project. That is the
safe default, but it means store-review testers exercising the purchase flow get
no entitlement. The usual resolution is to point the sandbox webhook at **beta**
and test there. Confirm before Task 2 ships.
