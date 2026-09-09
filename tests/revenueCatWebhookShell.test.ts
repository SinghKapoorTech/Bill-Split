/**
 * Coverage for the HTTP SHELL of `revenueCatWebhook`
 * (`functions/src/revenueCatWebhook.ts`) — the `onRequest` handler, not the
 * transactional core.
 *
 * WHY A SEPARATE SUITE FROM THE INTEGRATION ONE: the integration suite drives
 * `applyRevenueCatEvent` directly and never sees an HTTP status code. Every
 * decision the shell makes — method, auth, body shape, and the OUTCOME →
 * STATUS mapping — is therefore untested by it. That mapping is not cosmetic:
 * `unresolved-uid` returns 422 specifically so RevenueCat re-delivers and the
 * `logIn`/alias race can self-heal, and a regression back to 200 would silently
 * discard a paid purchase on its first delivery with nothing to show for it.
 *
 * WHAT THIS SUITE FAKES, AND WHAT IT DOES NOT. Being precise about this
 * matters, because a shell test that stubs the core proves nothing:
 *
 *   - The REAL `onRequest`-wrapped handler is invoked. Not a copy of the
 *     branching, not the inner function — the exported `revenueCatWebhook`
 *     value, through firebase-functions' own `withErrorHandler` /
 *     `wrapTraceContext` wrappers.
 *   - The REAL `applyRevenueCatEvent` runs, including the real
 *     `planEntitlementMutation` and the real `webhook_events` / `entitlements`
 *     document references.
 *   - `defineSecret(...).value()` is genuinely exercised: firebase-functions
 *     reads `process.env.REVENUECAT_WEBHOOK_SECRET`, so setting that env var
 *     is the whole of the secret machinery. No stub is involved in the 401.
 *   - The ONLY thing faked is `Firestore.runTransaction`, spied on the real
 *     Firestore instance. Six of the eight branches below (405, 401, both
 *     400s, 422, 500) never reach it at all. It exists so `applied` and
 *     `duplicate` — which structurally require a datastore — can reach the
 *     shell's 200.
 *
 * `FIRESTORE_EMULATOR_HOST` is pinned to a dead loopback port as a belt: even
 * if a code path escaped the stub, it could not reach a real project.
 *
 * NOTE ON IMPORT PATHS: `firebase-admin` is not a root dependency — only
 * `functions/node_modules` has it. Node resolves it fine FROM
 * `functions/src/revenueCatWebhook.ts` (it walks up to `functions/node_modules`),
 * but not from this file, so the two admin entry points are resolved through a
 * `createRequire` rooted at `functions/package.json`. That is the same
 * single-instance trick `vitest.integration.config.ts` uses, done locally so no
 * shared config had to change for one suite.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import path from 'path';
import { createRequire } from 'module';

const SECRET = 'rc-test-secret-value';

/** Resolve firebase-admin the way `functions/src` does — see the header. */
const fnRequire = createRequire(path.resolve(__dirname, '../functions/package.json'));

/* eslint-disable @typescript-eslint/no-explicit-any */

/** What the stubbed transaction should do on this call. */
type TxPlan =
  | { mode: 'fresh' } // no ledger row, no entitlement doc
  | { mode: 'duplicate' } // ledger row already present
  | { mode: 'throw' }; // the transaction itself rejects

let txPlan: TxPlan = { mode: 'fresh' };
let writes: Array<{ path: string; data: Record<string, unknown> }> = [];
let runTransactionSpy: ReturnType<typeof vi.spyOn>;
let webhook: (req: unknown, res: unknown) => unknown;

/** A minimal Express-shaped request. `header()` is case-insensitive, as Express's is. */
function makeReq(opts: { method?: string; auth?: string; body?: unknown }) {
  const headers: Record<string, string> = {};
  if (opts.auth !== undefined) headers.authorization = opts.auth;
  return {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body,
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  };
}

/** Captures whatever the handler sends. `headersSent` is what `withErrorHandler` reads. */
function makeRes() {
  return {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: unknown) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
    on() {
      /* wrapTraceContext/cors would use this; unused without a cors option */
    },
  };
}

async function call(opts: { method?: string; auth?: string; body?: unknown }) {
  const res = makeRes();
  await webhook(makeReq(opts), res);
  return res;
}

/** A well-formed event that WOULD open a transaction if the shell let it through. */
const validEvent = () => ({
  id: 'evt-shell-1',
  type: 'INITIAL_PURCHASE',
  product_id: 'divit_pro_monthly',
  app_user_id: 'user-shell-1',
  environment: 'PRODUCTION',
  expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
});

beforeAll(async () => {
  // Belt: an unroutable emulator host means no code path can reach a real
  // project even if it escaped the runTransaction stub.
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:1';
  process.env.REVENUECAT_WEBHOOK_SECRET = SECRET;

  const appMod: any = await import(fnRequire.resolve('firebase-admin/app'));
  const firestoreMod: any = await import(fnRequire.resolve('firebase-admin/firestore'));
  if (appMod.getApps().length === 0) appMod.initializeApp({ projectId: 'demo-rc-shell' });

  const instance = firestoreMod.getFirestore();
  runTransactionSpy = vi
    .spyOn(instance, 'runTransaction')
    .mockImplementation(async (updateFunction: any) => {
      if (txPlan.mode === 'throw') throw new Error('simulated commit failure');
      const tx = {
        get: async (ref: any) => ({
          exists: txPlan.mode === 'duplicate' && ref.parent.id === 'webhook_events',
          data: () => undefined,
        }),
        set: (ref: any, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data });
        },
      };
      return updateFunction(tx);
    });

  ({ revenueCatWebhook: webhook } = await import('../functions/src/revenueCatWebhook'));
});

beforeEach(() => {
  txPlan = { mode: 'fresh' };
  writes = [];
  runTransactionSpy.mockClear();
});

describe('revenueCatWebhook — HTTP shell', () => {
  it('is the real onRequest handler, not a bare function', () => {
    // Guards the guard: if the import ever resolved to something else, every
    // assertion below would be testing a stub of this suite's own making.
    expect(typeof webhook).toBe('function');
    expect((webhook as any).__endpoint).toBeDefined();
    expect((webhook as any).__endpoint.platform).toBe('gcfv2');
  });

  describe('before the core is ever called', () => {
    it.each(['GET', 'PUT', 'DELETE', 'HEAD'])(
      '%s is 405, not a peek at the body',
      async (method) => {
        // The payload is valid and correctly authorized — only the method is
        // wrong — so a passing 405 proves the method guard, not a side effect.
        const res = await call({ method, auth: SECRET, body: { event: validEvent() } });
        expect(res.statusCode).toBe(405);
        expect(runTransactionSpy).not.toHaveBeenCalled();
      },
    );

    it('401s a missing Authorization header', async () => {
      const res = await call({ body: { event: validEvent() } });
      expect(res.statusCode).toBe(401);
      // Nothing about the secret leaks into the body of a probe response.
      expect(res.body).toBe('Unauthorized');
      expect(runTransactionSpy).not.toHaveBeenCalled();
    });

    it('401s a wrong secret of the SAME length', async () => {
      // The interesting case for `timingSafeEqual`: equal lengths mean the
      // length short-circuit does not fire and the real compare runs.
      const wrong = 'rc-test-secret-VALUE';
      expect(wrong).toHaveLength(SECRET.length);
      expect(wrong).not.toBe(SECRET);
      const res = await call({ auth: wrong, body: { event: validEvent() } });
      expect(res.statusCode).toBe(401);
      expect(runTransactionSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['shorter', 'rc-test'],
      ['longer', SECRET + 'x'],
      ['empty', ''],
      ['bearer-prefixed', `Bearer ${SECRET}`],
    ])('401s a %s Authorization value', async (_label, auth) => {
      // `Bearer <secret>` is included deliberately: RevenueCat sends the
      // header value RAW. If someone "helpfully" adds Bearer handling, this
      // is the test that says the deployed secret must change with it.
      const res = await call({ auth, body: { event: validEvent() } });
      expect(res.statusCode).toBe(401);
      expect(runTransactionSpy).not.toHaveBeenCalled();
    });

    it.each([
      ['absent', {}],
      ['null', { event: null }],
      ['a string', { event: 'INITIAL_PURCHASE' }],
      ['a number', { event: 42 }],
      ['a boolean', { event: true }],
    ])('400s when `event` is %s', async (_label, body) => {
      const res = await call({ auth: SECRET, body });
      expect(res.statusCode).toBe(400);
      expect(runTransactionSpy).not.toHaveBeenCalled();
    });

    it('400s an entirely absent body', async () => {
      // `req.body?.event` — the optional chain is what keeps this a 400
      // rather than a TypeError, which `withErrorHandler` would turn into a
      // 500 and make RevenueCat burn all six attempts on a broken sender.
      const res = await call({ auth: SECRET, body: undefined });
      expect(res.statusCode).toBe(400);
      expect(runTransactionSpy).not.toHaveBeenCalled();
    });

    it('400s an ARRAY `event` — via the core, since typeof [] is "object"', async () => {
      // Documenting the real path rather than pretending: an array survives
      // the shell's `typeof !== 'object'` check and is rejected one layer
      // deeper, by the core's `typeof event.id !== 'string'` guard. Same 400,
      // and nothing is written, which is the property that matters.
      const res = await call({ auth: SECRET, body: { event: [] } });
      expect(res.statusCode).toBe(400);
      expect(runTransactionSpy).not.toHaveBeenCalled();
    });
  });

  describe('mapping a core outcome to a status', () => {
    it('400s a `rejected` outcome (unusable event id)', async () => {
      const res = await call({
        auth: SECRET,
        body: { event: { ...validEvent(), id: 'tenant/evt-1' } },
      });
      expect(res.statusCode).toBe(400);
      // `rejected` writes nothing — that is what makes returning 400 free.
      expect(runTransactionSpy).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    });

    it('422s an `unresolved-uid` outcome so RevenueCat RE-DELIVERS', async () => {
      // The whole point of the 422, and the newest branch in the shell. If
      // this ever reads 200 again, a purchase that arrived before the client's
      // `logIn` registered the alias is thrown away on the first delivery and
      // the customer pays for nothing.
      const res = await call({
        auth: SECRET,
        body: {
          event: {
            ...validEvent(),
            app_user_id: '$RCAnonymousID:abc123',
            original_app_user_id: '$RCAnonymousID:abc123',
          },
        },
      });
      expect(res.statusCode).toBe(422);
      expect(res.statusCode).not.toBe(200);
      // Load-bearing: no ledger row, so the re-delivery is not a no-op
      // `duplicate`. Asserted here as well as in the integration suite because
      // the 422 is only safe while this holds.
      expect(runTransactionSpy).not.toHaveBeenCalled();
      expect(writes).toEqual([]);
    });

    it('200s an `applied` outcome, having actually opened a transaction', async () => {
      const res = await call({ auth: SECRET, body: { event: validEvent() } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toBe('OK');
      // Proves the 200 came from a real apply, not from the shell falling
      // through some earlier branch: the core reached the writes.
      expect(runTransactionSpy).toHaveBeenCalledTimes(1);
      expect(writes.map((w) => w.path)).toEqual([
        'webhook_events/evt-shell-1',
        'entitlements/user-shell-1',
      ]);
      expect(writes[1].data.plan).toBe('pro');
    });

    it('200s a `duplicate` outcome, and writes nothing', async () => {
      txPlan = { mode: 'duplicate' };
      const res = await call({ auth: SECRET, body: { event: validEvent() } });
      expect(res.statusCode).toBe(200);
      expect(runTransactionSpy).toHaveBeenCalledTimes(1);
      expect(writes).toEqual([]);
    });

    it('500s when the core throws, so the delivery is retried', async () => {
      txPlan = { mode: 'throw' };
      const res = await call({ auth: SECRET, body: { event: validEvent() } });
      expect(res.statusCode).toBe(500);
      expect(res.body).toBe('Internal Error');
      // Distinguishes OUR catch from firebase-functions' `withErrorHandler`
      // fallback, which would send 'Internal Server Error' instead. Only our
      // branch logs the eventId, so only our branch is diagnosable.
      expect(res.body).not.toBe('Internal Server Error');
    });
  });
});
