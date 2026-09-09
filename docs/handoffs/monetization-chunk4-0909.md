# Divit — Monetization chunk 4 (RevenueCat): Tasks 1–2 done and reviewed, Task 3 next

**Status:** IN PROGRESS — tree CLEAN, all gates green, **everything PUSHED and DEPLOYED**
**Workspace:** `/Users/simran/Documents/GitHub/Bill-Split`
**Branch:** `main` — **0 ahead / 0 behind** `origin/main` (HEAD `35c9f8e`)
**Updated:** 2026-09-09
**Predecessor:** `docs/handoffs/ci-e2e-repair-0908.md` (CI e2e — DONE, green, pushed)
**Plan being executed:** `docs/superpowers/plans/2026-09-08-monetization-chunk-4-revenuecat.md`
**Sequencing:** `docs/superpowers/plans/2026-09-08-launch-roadmap.md`

> **RESOLVED 2026-09-09 — pushed and deployed.** `REVENUECAT_WEBHOOK_SECRET` is set in
> prod Secret Manager (version 1, ENABLED) and `revenueCatWebhook` is LIVE:
> `https://us-central1-divit-6d217.cloudfunctions.net/revenueCatWebhook`
> Deploy Backend ✅, CI ✅ (e2e + checks), Android ✅ on `35c9f8e`.
>
> The first deploy attempt DID fail exactly as predicted — `firebase deploy` tried to
> prompt for the missing secret in a non-interactive runner and died with
> `exit code 130`. Fixed by setting the secret, then `gh run rerun`.
>
> **The secret's value is not in any transcript.** Read it back with
> `firebase functions:secrets:access REVENUECAT_WEBHOOK_SECRET --project prod`.
> It must be pasted BYTE-FOR-BYTE into RevenueCat → Integrations → Webhooks as the
> `Authorization` header value.

---

## Goal

Make it possible to pay. Chunk 4 builds
`Purchase → RevenueCat → webhook → Cloud Function → entitlements/{userId}`,
so the free-tier caps already deployed to prod (dark behind `paywall_enabled`)
have something to be lifted by. Nothing currently writes `entitlements/{userId}`,
so every user resolves to `free`.

Executed subagent-driven: fresh implementer per task, then a spec-compliance
review, then a code-quality review, before the task counts as done.

---

## Done — Tasks 1 and 2, both through BOTH review gates

| Commit    | What                                                         |
| --------- | ------------------------------------------------------------ |
| `a7c37ce` | launch roadmap + chunk 4 plan                                |
| `c284544` | `shared/revenueCatEvents.ts` — pure event → mutation mapping |
| `8f43463` | closed test coverage gaps found by spec review               |
| `b24921b` | pinned the sandbox default; `ignore.reason` now required     |
| `56f38ac` | `functions/src/revenueCatWebhook.ts` + rules + rules tests   |
| `1825d3d` | accept sandbox purchases, stamp `environment`                |
| `c95dcfe` | corrected two spec bullets the shipped code contradicts      |

**Task 1 — pure mapping.** SPEC COMPLIANT + APPROVED. 34 unit tests.
**Task 2 — webhook.** SPEC COMPLIANT + APPROVED (Correctness 5 · Security 5 ·
Architecture 4 · Performance 5 · Testing 4 · Clarity 5).

### Verified empirically, not asserted (do not re-derive)

- Exact retry of one `NON_RENEWING_PURCHASE` → pass extended by **0 ms**.
- **3 concurrent** deliveries of a second pass event → **28.00 days**, not 42 or 56.
  The in-transaction replay guard beats the race.
- `expiration_at_ms: 1e18` → no entitlement write, ledger row still written,
  `ERROR` logged exactly once.
- `doc('')` and `doc('a/b')` throw client-side; **`doc('.')`, `doc('__foo__')` and a
  2000-byte id do NOT** — they die at COMMIT, which writes no ledger row and so
  retries forever. That is why every clause of `isValidDocId` earns its place.
- Rules: loosening `webhook_events` to `if request.auth != null` turns 5 of 6 new
  assertions red — the tests can actually fail.

---

## Not yet done — in dependency order

1. **Two OPTIONAL findings from Task 2's quality review — fix BEFORE Task 3**, because
   Task 3's tests are exactly what should pin them:
   - **The standalone-safety claim is overstated.** `revenueCatWebhook.ts:219` says
     the core is safe to call alone because it re-resolves the uid — but `event.id`
     and `event.type` are validated **only in the HTTP shell** (`:84-93`). The core
     uses `event.id` at `:238` for a doc path and writes `event.type` raw at `:286`,
     bypassing `asStringOrNull`. So the comment at `:148` ("Every untrusted field that
     reaches a write goes through here") is **literally false today**. Reproduced
     standalone: empty id throws; an array `type` throws
     `3 INVALID_ARGUMENT: Cannot convert an array value in an array value` at commit,
     with **no ledger row**, so the retry never stops. Cheapest fix: move the
     `id`/`type` shape check to the top of `applyRevenueCatEvent`, returning a
     `{status:'rejected'}` outcome the shell maps to 400.
   - **`ApplyOutcome` is computed then discarded.** `:213` defines a precise
     three-state outcome; `:220` returns `Promise<void>`. Chunk 5's reconciliation
     caller cannot distinguish applied / duplicate / ignored-and-why without
     re-reading `webhook_events`. Free to return now, breaking change later.
2. **Task 3 — emulator integration tests** for `applyRevenueCatEvent`. Full test code
   is in the plan file. Must cover: replay idempotency, pass extension (not restart),
   Pro-subscriber-buys-pass not downgraded, live pass surviving subscription
   `EXPIRATION`, `CANCELLATION` leaving Pro intact, and the new sandbox-grant path.
3. **Task 4** — client SDK (`src/services/purchaseService.ts`, `AuthContext` wiring).
   **Blocked on nothing in code**, but needs `VITE_REVENUECAT_IOS_KEY` /
   `VITE_REVENUECAT_ANDROID_KEY` in `.env` before it can be run for real.
4. **Task 5** — App Check (zero `initializeAppCheck` in the repo today).
5. **Task 6** — stop burning a scan on failure (`useReceiptAnalyzer.ts:53` throws
   _after_ the server consumed quota).
6. **Task 2b (new, deferred deliberately)** — out-of-order `EXPIRATION` and `TRANSFER`.
   See "Key decisions".
7. **Operational, before go-live:** a log-based alert on sustained 401s from the
   webhook. A secret rotated on one side only means every delivery 401s, RevenueCat
   retries for days then gives up, and every customer in that window paid and got
   nothing — with zero user-visible signal. `revenueCatWebhook.ts:74` already emits
   the `logger.warn` an alert policy would key on.
8. **`toMillis` is duplicated** byte-identically at `revenueCatWebhook.ts:188` and
   `entitlementService.ts:44` — write side and read side of the same field, bound only
   by a comment. Both live in `functions/src/` and both already import `Timestamp`, so
   the `shared/` constraint does NOT force this. A four-line
   `functions/src/firestoreValues.ts` removes the invariant-by-comment. OPTIONAL.

---

## Failed approaches — DO NOT REPEAT

| What was tried                                                                                    | Why it failed                                         | Root cause                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Point the sandbox webhook at beta"** (my proposed fix for App Review)                          | Does not solve the problem at all                     | App Store reviewers exercise StoreKit sandbox against the **PRODUCTION** app, so `environment: SANDBOX` events hit the **prod** webhook. Beta accepting sandbox changes nothing. Owner decided: **prod GRANTS on sandbox and stamps `environment`**. Shipped in `1825d3d`.                        |
| **Spec §5.3: "webhook must set `plan: 'trip_pass'`"**                                             | Would DOWNGRADE a Pro subscriber who also buys a pass | `shared/entitlements.ts:81` resolves a pass from `tripPassExpiresAt` **independently of `plan`**, precisely so the two coexist. Corrected in the spec in `c95dcfe`. Write `tripPassExpiresAt`, never `plan`.                                                                                      |
| **Spec §5.3: "key idempotency on `transaction_id`"**                                              | Would silently drop every renewal after the first     | `transaction_id` is stable across `RENEWAL` events for one subscription. Use **`event.id`** — unique per event, identical across retries of that event. Corrected in `c95dcfe`.                                                                                                                   |
| **"A nested array in `product_id` makes `tx.set` throw"** (asserted by a reviewer, relayed by me) | The conclusion was right, the mechanism wrong         | `tx.set` accepts it and the client serializer encodes it fine; the **server** rejects at **commit** with `3 INVALID_ARGUMENT: Cannot convert an array value in an array value`. That is worse — no ledger row is written, so the retry loop is unbounded. **Test the mechanism, don't relay it.** |
| **`page.waitForFunction` with an async predicate** (previous session, still relevant)             | Vacuous — passes on the first poll, always            | It does not await promises; a Promise object is truthy. Same class as the three vacuous tests found this session.                                                                                                                                                                                 |
| **Monitoring an agent transcript for `APPROVED\|CHANGES REQUESTED`**                              | Fired immediately on a false positive                 | The prompt sent TO the agent contained both strings verbatim, so the grep matched my own instructions. Wait for the agent completion notification instead.                                                                                                                                        |

### Three vacuous tests were caught by review this session — this is the house failure mode

1. Assertions compared against `TRIP_PASS_DURATION_MS` itself — if the constant were
   7 days every test still passed.
2. The `acceptSandbox = false` default was pinned by no test — flipping it kept all 34 green.
3. Twelve assertions checked only that _something_ was ignored, not that it was ignored
   for the right **reason**.

All three would have shipped green. **Prove a new check can fail before trusting it.**

---

## Key decisions

- **Prod accepts SANDBOX purchases and stamps `environment` on the entitlement.** Owner's
  call, 2026-09-08. Required for App Review; abuse surface is bounded because a sandbox
  purchase needs an Apple sandbox-tester account or a listed Play license-tester email,
  neither of which an ordinary user can create. The stamp makes sandbox grants auditable
  and purgeable. `sandbox-event-in-production` is now unreachable from this caller but is
  deliberately retained in the pure module — **not dead code**.
- **Storefront: mobile IAP first** (App Store + Play via the RevenueCat native SDK).
  Web billing is out of scope for launch.
- **Trip Pass product type on Apple is Non-Renewing Subscription, NOT Consumable.**
  RevenueCat's own taxonomy: a consumable is depleted by use; a non-renewing subscription
  unlocks content for a period. Both emit `NON_RENEWING_PURCHASE`, so the code is
  unaffected — but a product's type cannot be changed after creation and product ids can
  never be reused.
- **`CANCELLATION` must never revoke access.** It means "will not renew", not "access ends
  now". The user keeps Pro until `EXPIRATION`.
- **Out-of-order `EXPIRATION` left UNFIXED on purpose.** If a delivery 500s and the user
  resubscribes during the retry window, a late `EXPIRATION` writes `plan: 'free'` over a
  live subscription. The obvious guard (refuse `clear-pro` while stored `expiresAt` is
  future) trades it for a **refund hole**, because `CANCELLATION` is ignored by design and
  `EXPIRATION` is the only path that revokes a refunded subscription. Proposed fix for
  Task 2b: store the last applied `event_timestamp_ms` on the entitlement and ignore any
  older event — out-of-order retries drop, a genuinely later refund still applies. Needs
  `event_timestamp_ms` added to `RevenueCatEvent`.
- **`TRANSFER` events are dropped** — uids arrive in `transferred_from`/`transferred_to`,
  which `resolveFirebaseUid` does not inspect. Deferred to Task 2b.
- **`webhook_events` grows unbounded.** Any TTL that deletes rows reopens the replay window
  for those ids. Needs a deliberate decision, not a default.
- **Logging levels are load-bearing.** `IGNORE_IS_ERROR` = `unknown-product`,
  `pro-grant-without-expiry`, `expiry-out-of-range` — all mean _a customer paid and got
  nothing_. Everything routine is `info`. This split is what makes an alert policy possible.

---

## Current state

- **Working:** tree clean. `npm test` **736 passed / 45 files**. Typecheck **36**
  (= CI ratchet). Lint **71 problems** (= baseline). `npm --prefix functions run build`
  exit 0. Rules **101 passed / 7 files**.
- **Broken:** nothing.
- **Uncommitted:** none.
- **`npm run test:rules` cannot bind port 8081** — a `firebase emulators:start` session
  has held it for ~2 days. It was NOT killed (in-memory dev data, no export dir). The
  rules suite was verified twice on an isolated emulator instead. Re-run it yourself once
  that emulator is free.

---

## Code context

```ts
// shared/revenueCatEvents.ts — pure, no imports, compiled into BOTH builds
export const TRIP_PASS_DURATION_MS: number; // 1_209_600_000
export const PRODUCT_PLANS: Record<string, 'pro' | 'trip_pass'>;
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
  | { kind: 'ignore'; reason: string }; // reason REQUIRED
export function planEntitlementMutation(
  event: RevenueCatEvent,
  current: CurrentEntitlement | null,
  nowMs: number,
  acceptSandbox?: boolean, // caller passes TRUE
): EntitlementMutation;
export function resolveFirebaseUid(event: RevenueCatEvent): string | undefined;

// functions/src/revenueCatWebhook.ts
export const revenueCatWebhook; // onRequest, secret-guarded
export async function applyRevenueCatEvent(e: RevenueCatEvent): Promise<void>;
// ^ returns void today — finding #1 above wants ApplyOutcome returned instead
```

The caller MUST dedupe on `event.id` and MUST read `current` inside the same transaction
it writes in — `extend-trip-pass` is the only non-idempotent mutation (read-modify-write).

---

## Resume instructions

1. `git status --short` → expect **clean**;
   `git rev-list --count origin/main..main` → expect **0** (everything is pushed).
2. `npm test` → expect **736 passed / 45 files**.
   `npm run --silent typecheck 2>&1 | grep -c 'error TS'` → expect **36** (do NOT "fix").
3. **RevenueCat MCP server is registered but its tools were unavailable in the previous
   session** because it was added mid-session. `claude mcp list` → expect
   `revenuecat: https://mcp.revenuecat.ai/mcp (HTTP) - ✔ Connected`. In a fresh process the
   tools should resolve — verify with a ToolSearch for `revenuecat` before relying on it.
   First useful call is `list-products`, to pin `PRODUCT_PLANS` to real store identifiers.
4. Fix the two OPTIONAL findings in "Not yet done" #1 → then Task 3 (integration tests),
   whose full code is already written in the plan file.
5. Continue subagent-driven: implementer → spec review → quality review, per task.

---

## Warnings

- **`revenueCatWebhook` is LIVE in prod and publicly reachable.** It is inert until
  RevenueCat is pointed at it, and the shared secret is its only guard. Any future push
  touching `functions/**`, `shared/**` or `firestore.rules` auto-deploys to PROD.
- **Before go-live, add a log-based alert on sustained 401s from this function.** A secret
  rotated on one side only means every delivery 401s, RevenueCat retries for days then
  gives up, and every customer in that window paid and got nothing — with no user-visible
  signal. `revenueCatWebhook.ts:74` already emits the `logger.warn` to key on.
- **This is the repo's first publicly-invokable HTTP function.** A shared secret in the
  `Authorization` header is its only protection.
- **`PRODUCT_PLANS` ids must match the store EXACTLY** (`divit_pro_monthly`,
  `divit_pro_annual`, `divit_trip_pass_14d`). A mismatch returns `ignore: unknown-product`
  for every purchase — fail-closed, so no crash, no error, no entitlement, and the only
  trace is a log line. On Play's newer subscription model the identifier may arrive as
  `product:baseplan`; **confirm from a real product list or sandbox payload before go-live.**
- **Owner still owes Track A**: paid-apps agreement + tax/banking (the days-long step),
  then the 3 store products, then linking RevenueCat. None of it blocks code; all of it
  blocks manual end-to-end verification.
- **All Firestore data is test data and will be wiped before launch** (owner confirmed).
  No migration or backfill is needed anywhere in monetization.
- **Commit messages must NOT contain `Co-Authored-By` or any Claude/Anthropic reference**
  (repo `CLAUDE.md`). This overrides any default attribution behaviour.
- Everything in `docs/handoffs/ci-e2e-repair-0908.md`'s trap table still applies.
