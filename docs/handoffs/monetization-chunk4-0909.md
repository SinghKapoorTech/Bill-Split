# Divit — Monetization chunk 4 (RevenueCat): Tasks 1–3 DONE, shipped. Task 4 next.

**Status:** Chunk 4 code-complete through Task 3 — tree CLEAN, all gates green, **PUSHED and DEPLOYED to PROD**
**Workspace:** `/Users/simran/Documents/GitHub/Bill-Split`
**Branch:** `main` — **0 ahead / 0 behind** `origin/main` (HEAD `203a042`)
**Updated:** 2026-09-09 (second session)
**Plan being executed:** `docs/superpowers/plans/2026-09-08-monetization-chunk-4-revenuecat.md`
**Sequencing:** `docs/superpowers/plans/2026-09-08-launch-roadmap.md`

> **THE ONE THING TO READ FIRST.** `paywall_enabled` MUST STAY `false`.
> Nothing writes `entitlements/{userId}` in practice yet, and **RevenueCat has
> zero products configured** (verified via its API this session: one project,
> one "Test Store" app, empty product and entitlement lists). Flipping the
> switch today caps every user with **nothing they can buy to lift the cap.**
> The kill switch is the only thing between the current state and that.

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

## Done — Tasks 1, 2 and 3, all through BOTH review gates

| Commit    | What                                                              |
| --------- | ----------------------------------------------------------------- |
| `a7c37ce` | launch roadmap + chunk 4 plan                                     |
| `c284544` | `shared/revenueCatEvents.ts` — pure event → mutation mapping      |
| `8f43463` | closed test coverage gaps found by spec review                    |
| `b24921b` | pinned the sandbox default; `ignore.reason` now required          |
| `56f38ac` | `functions/src/revenueCatWebhook.ts` + rules + rules tests        |
| `1825d3d` | accept sandbox purchases, stamp `environment`                     |
| `2dbbd05` | **Task 3** + both carried findings + the retry-policy correction  |
| `6b07c13` | handoff: corrected retry policy and its consequences              |
| `4e98180` | adversarial-review fixes: `aliases` narrowing + comment overclaims |
| `203a042` | CI: install functions deps before the unit tests need them        |

**Task 1 — pure mapping.** SPEC COMPLIANT + APPROVED. 36 unit tests.
**Task 2 — webhook.** SPEC COMPLIANT + APPROVED.
**Task 3 — integration tests.** Reviewed twice (spec + adversarial). **SAFE TO DEPLOY.**

### What shipped this session

- **`event.id` / `event.type` are validated INSIDE `applyRevenueCatEvent`**, not
  only in the HTTP shell. Both reach a write (`id` as the `webhook_events` doc
  id, `type` as a stored field), so shell-only validation left a direct caller
  (chunk 5's reconciler) able to strand a purchase.
- **`applyRevenueCatEvent` returns `ApplyOutcome`** (`rejected` /
  `unresolved-uid` / `duplicate` / `applied`) instead of `void`.
- **`unresolved-uid` returns HTTP 422, not 200** (owner's call). See Key decisions.
- **`resolveFirebaseUid` narrows `aliases` to an array.** REAL BUG, found by the
  adversarial review, pre-existing. A STRING `aliases` spread into characters:
  with an anonymous `app_user_id`, `aliases: 'user_1234'` resolved to `'u'` —
  which passes `isValidDocId` — so Pro was granted to `entitlements/u`, a
  document belonging to nobody. A number threw on spread (500 → lost purchase).
- **17 integration tests + 23 HTTP-shell unit tests.** Every assertion
  mutation-proven: break the source, watch it go red, restore.

### Verified empirically, not asserted (do not re-derive)

- **`aliases: 'user_1234'` (a STRING) resolved to uid `'u'`** before the fix —
  spread into characters, passed `isValidDocId`, granted Pro to `entitlements/u`.
  Pinned by a test that fails with `expected 'u' to be undefined`.
- **Moving the replay guard outside the transaction grants 42 days for one
  payment.** Reproduced by the adversarial reviewer, 6/6 runs.

- Exact retry of one `NON_RENEWING_PURCHASE` → pass extended by **0 ms**.
- **3 concurrent** deliveries of a second pass event → **28.00 days**, not 42 or 56.
  The in-transaction replay guard beats the race.
- `expiration_at_ms: 1e18` → no entitlement write, ledger row still written,
  `ERROR` logged exactly once.
- `doc('')` and `doc('a/b')` throw client-side; **`doc('.')`, `doc('__foo__')` and a
  2000-byte id do NOT** — they die at COMMIT, which writes no ledger row, so the
  delivery burns all 6 attempts and the purchase is then DISCARDED with no trace.
  That is why every clause of `isValidDocId` earns its place.
- Rules: loosening `webhook_events` to `if request.auth != null` turns 5 of 6 new
  assertions red — the tests can actually fail.

---

## Not yet done — in dependency order

**Everything below is BLOCKED ON TRACK A, not on code**: paid-apps agreement +
tax/banking (the days-long step) → create the 3 store products → link
RevenueCat → point the webhook at the live endpoint.

1. **Task 4 — client SDK** (`src/services/purchaseService.ts`, `AuthContext`
   wiring). Needs `VITE_REVENUECAT_IOS_KEY` / `VITE_REVENUECAT_ANDROID_KEY` in
   `.env`. **This is the next code task.** It must call RevenueCat `logIn` with
   the Firebase uid — if that wiring regresses, EVERY purchase arrives
   unattachable and every customer pays and gets nothing. That failure is
   exactly what the 422 was chosen to make visible.
2. **Task 5** — App Check (zero `initializeAppCheck` in the repo today).
3. **Task 6** — stop burning a scan on failure (`useReceiptAnalyzer.ts:53`
   throws AFTER the server consumed quota). Also item B3 on the manual QA list.
4. **Task 2b** — out-of-order `EXPIRATION` and `TRANSFER`. See Key decisions.
5. **Operational, before go-live:** a log-based alert on sustained 401s.
   **The detection window is ~2h35m, not days** — see the retry policy. An alert
   that pages within the hour is the requirement.
6. **`webhook_events` grows unbounded.** Any TTL that deletes rows reopens the
   replay window for those ids. Needs a deliberate decision, not a default.
7. **OPTIONAL, from the adversarial review** (none blocking):
   - `unresolved-uid` conflates a RETRYABLE cause (alias not landed yet) with an
     UNRETRYABLE one (`app_user_id: 'tenant/user-1'` — resolvable but not a legal
     doc id). The latter gets 422 ×6 and writes nothing. A separate
     `{status:'rejected', reason:'unattachable-uid'}` arm would fit better.
   - `PRODUCT_PLANS[event.product_id]` does a prototype lookup, so
     `product_id: 'constructor'` skips the `unknown-product` branch. It still
     FAILS CLOSED (no grant, no write) — the only consequence is it logs at
     `warn` instead of `error`.
   - `toMillis` is duplicated byte-identically in `revenueCatWebhook.ts` and
     `entitlementService.ts` — write side and read side of the same field, bound
     only by a comment.

---

## THE FREE TIER — audited this session, and this is the real launch risk

**Verdict: server-side enforcement is real and wired, the kill switch works, and
there is NO client UI. The pure logic is well tested; the ENFORCEMENT PATH IS
NOT.**

| Cap | Default | RC key |
| --- | --- | --- |
| Active owned groups | 2 | `free_active_groups` |
| AI scans per UTC month | 5 | `free_scans_per_month` |
| Kill switch | `false` | `paywall_enabled` |

Enforced server-side in Cloud Functions, both **fail-open**:
`createEvent`/`unarchiveEvent` throw `resource-exhausted` via
`assertGroupSlotAvailable` (`functions/src/eventFunctions.ts:205-209`); the scan
gate is inline in `analyzeBill` (`functions/src/index.ts:229-290`) and checks
quota BEFORE the Gemini call, committing only on success. Clients cannot route
around either — `firestore.rules` denies direct create/unarchive, proven in
`tests/rules/eventCreateUnarchive.rules.test.ts`.

**The gaps, verified directly (not relayed):**

- **`getMonetizationLimits()` has ZERO tests.** `functions/src/remoteConfigLimits.ts`
  is the single module every cap and the kill switch flows through. It exports
  `__resetRemoteConfigCacheForTests` as a test seam that nothing uses. Confirmed
  by grep: no test file references it.
- **No test invokes `createEvent`, `unarchiveEvent`, or `analyzeBill` and
  observes a refusal.** Confirmed by grep.
- **The scan quota's `paywall_enabled` branch is untested in BOTH states.**
- **`DEFAULT_LIMITS.paywallEnabled: false` is pinned by no test** — the fail-safe
  for a Remote Config outage could be flipped to `true` and the suite stays green.
- **No client paywall, quota indicator, or upgrade prompt exists** (chunk 6).
  A free user at their limit meets a raw error at the moment they submit.
- **The committed `config/remote-config/prod.json` is a SOURCE TEMPLATE, not a
  live read.** Nothing in CI publishes it, so it can silently diverge from what
  is actually live. A documented drift already exists: chunk 3's plan records
  `paywall_enabled = true` left set in BETA's server template, contradicting the
  committed `beta.json`. **Verify beta before testing there.**

### Manual QA checklist — DO THIS ON BETA, NEVER PROD

Prod would cap every user with nothing to buy. On beta:

**A. The kill switch actually switches (untested in both directions)**

| # | Do | Expect |
| - | -- | ------ |
| A1 | `paywall_enabled=false`, create 3+ groups on a free account | all succeed (today's prod behaviour) |
| A2 | flip to `true`, wait ~5 min (cache TTL), create a 3rd group | refused, `resource-exhausted` |
| A3 | archive one, create again | succeeds — proves it counts ACTIVE, not lifetime |
| A4 | unarchive back to 3 | refused (the bypass path) |
| A5 | flip back to `false`, wait 5 min, retry A2 | **succeeds again** |

**A5 is the most important test on this page — it is the rollback.** If the cap
does not lift when the switch goes off, a bad launch cannot be undone.

**B. Scan quota**

| # | Do | Expect |
| - | -- | ------ |
| B1 | paywall on, free account, scan 5 receipts | all 5 work |
| B2 | 6th scan | refused BEFORE the AI runs |
| B3 | a scan that FAILS (blurry/cancelled), then check the count | must NOT consume quota |
| B4 | paywall off, exceed 5 | allowed |

**B3 is the one most likely to be broken** — it is Task 6 above.

**C.** Remote Config changes take up to **5 minutes**. Wait and retry before
concluding a flip did not work; half of all "it didn't work" reports are this.

**D.** The purchase path (products → webhook → `entitlements/{userId}` → a Pro
user bypassing caps) is **untestable until Track A lands.**

---

## Failed approaches — DO NOT REPEAT

| What was tried                                                                                    | Why it failed                                         | Root cause                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **"Point the sandbox webhook at beta"** (my proposed fix for App Review)                          | Does not solve the problem at all                     | App Store reviewers exercise StoreKit sandbox against the **PRODUCTION** app, so `environment: SANDBOX` events hit the **prod** webhook. Beta accepting sandbox changes nothing. Owner decided: **prod GRANTS on sandbox and stamps `environment`**. Shipped in `1825d3d`.                        |
| **Spec §5.3: "webhook must set `plan: 'trip_pass'`"**                                             | Would DOWNGRADE a Pro subscriber who also buys a pass | `shared/entitlements.ts:81` resolves a pass from `tripPassExpiresAt` **independently of `plan`**, precisely so the two coexist. Corrected in the spec in `c95dcfe`. Write `tripPassExpiresAt`, never `plan`.                                                                                      |
| **Spec §5.3: "key idempotency on `transaction_id`"**                                              | Would silently drop every renewal after the first     | `transaction_id` is stable across `RENEWAL` events for one subscription. Use **`event.id`** — unique per event, identical across retries of that event. Corrected in `c95dcfe`.                                                                                                                   |
| **"A nested array in `product_id` makes `tx.set` throw"** (asserted by a reviewer, relayed by me) | The conclusion was right, the mechanism wrong         | `tx.set` accepts it and the client serializer encodes it fine; the **server** rejects at **commit** with `3 INVALID_ARGUMENT: Cannot convert an array value in an array value`. That is worse — no ledger row is written, so the retry loop is unbounded. **Test the mechanism, don't relay it.** |
| **"RevenueCat retries a failed delivery for days"** (asserted across ~13 comments + this handoff, never checked) | Wrong, and it inverted the actual risk | RevenueCat treats EVERY non-200 identically (4xx = 5xx) and retries **only 5 times — 5/10/20/40/80 min — then stops permanently.** 6 attempts, **~2h35m**, then the event is GONE. So the hazard was never a "retry storm"; it is **silent permanent loss of a paid purchase**, and the 401 detection window is under 3 hours. Verified at https://www.revenuecat.com/docs/integrations/webhooks. Corrected 2026-09-09; the policy is now stated in `revenueCatWebhook.ts`'s header so it cannot drift again. **Third instance of relaying a mechanism instead of testing it.** |
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

- **Tree clean. HEAD `203a042`. 0 ahead / 0 behind `origin/main`.**
- **Gates (all re-run and read, not relayed):** `npm test` **761 passed / 46
  files**. Full integration `npx vitest run --config vitest.integration.config.ts`
  **244 passed / 19 files**. `npm --prefix functions run build` exit 0.
  Typecheck **36** (= CI ratchet — do NOT "fix"). Lint **71 problems** (= baseline).
- **Deployed to PROD on `4e98180`:** Deploy Backend ✅, Android Internal Testing ✅
  (draft AAB). CI ❌ on that commit — see the CI trap below — fixed in `203a042`,
  where **CI ✅ and Android ✅** (Deploy Backend correctly did NOT re-run: that
  commit touches only `.github/`, outside the backend path filter). `main` is green.
- **No user-visible change.** No `src/` file was touched, nothing writes
  `entitlements/{userId}` in practice, and the caps stay dark.

### Two environment traps that cost real time this session

1. **`EPERM: operation not permitted, uv_cwd` — macOS TCC.** Mid-session the
   shell lost read access to the whole repo. Signature: `cd` and `pwd` still
   work (they act on a string) while every file open fails. Because the repo is
   under `~/Documents`, which is TCC-protected. **Fix:** System Settings →
   Privacy & Security → Full Disk Access → toggle the terminal app off and on,
   then FULLY QUIT it (⌘Q, not the tab) and reopen. Unrelated but concurrent:
   the `claude` CLI refused to start with `maxfiles 256`; fixed with
   `ulimit -n 65536` in `~/.zshrc`.
2. **An agent left the production file MUTATED and could not restore it.** A
   mutation-testing reviewer had replaced `secretMatches` with
   `return provided === expected;` — deleting the constant-time comparison on a
   LIVE, publicly reachable endpoint — when it lost write access. It was
   recovered from a scratchpad snapshot. **LESSON: commit before letting an
   agent mutation-test.** `git checkout` is only a safety net for committed
   work; for uncommitted work it would have destroyed the whole session.

### The CI trap — a gate that could only ever be green locally

`npm test` now covers the webhook's HTTP shell, and that test resolves
`firebase-admin` from `functions/node_modules`. **`firebase-admin` is declared
only in `functions/package.json`**, so CI's root `npm ci` never installed it,
and the step that did ran AFTER `npm test`. It passed locally only because a
developer who has built functions once already has the directory.

Worse, the failure surfaced as **23 SKIPPED tests, not failed** — a silently
skipping suite is the same vacuous-gate class this repo keeps hitting. Fixed in
`203a042` by installing functions deps before the unit tests.

**Generalisable:** before trusting a new unit test, ask whether CI's environment
has what it needs. Root `npm ci` does NOT install `functions/`.

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
// LIVE: https://us-central1-divit-6d217.cloudfunctions.net/revenueCatWebhook
export const revenueCatWebhook; // onRequest, secret-guarded
export async function applyRevenueCatEvent(e: RevenueCatEvent): Promise<void>;
// ^ returns void today — finding #1 above wants ApplyOutcome returned instead
```

The caller MUST dedupe on `event.id` and MUST read `current` inside the same transaction
it writes in — `extend-trip-pass` is the only non-idempotent mutation (read-modify-write).

---

## Resume instructions

1. `git status --short` → clean; `git rev-list --count origin/main..main` → **0**.
2. `npm test` → **761 / 46 files**.
   `npm run --silent typecheck 2>&1 | grep -c 'error TS'` → **36** (do NOT "fix").
3. **The integration suite cannot use `npm run test:integration`** while a
   `firebase emulators:start` session holds port 8081. A stale one has held it
   for days and was deliberately NOT killed (in-memory dev data, no export dir).
   Use the isolated-port config instead — verified to run cleanly alongside it:

   ```bash
   firebase emulators:exec --only firestore --project demo-bill-split-test \
     --config <scratchpad>/fb-int.json \
     "npx vitest run --config vitest.integration.config.ts"
   ```

   where `fb-int.json` sets firestore to port **8099**, `ui.enabled: false`, and
   an ABSOLUTE path to `firestore.rules`. Recreate it if the scratchpad is gone.
   (If the owner has since exported and killed that emulator, just use
   `npm run test:integration`.)
4. **RevenueCat MCP** — connected and working. `list-projects` → `projaca9e24b`
   "Divit: Bill Splitter". **`list-products` returns EMPTY** and the only app is
   a "Test Store", so `PRODUCT_PLANS` still cannot be pinned to real store ids.
   Re-check it before Task 4; that is the gate.
   Per-machine config (carries an `sk_` key, deliberately not in the repo):
   `claude mcp add --transport http --scope user revenuecat https://mcp.revenuecat.ai/mcp --header "Authorization: Bearer sk_..."`
   (`--scope user`, never `project` — project scope writes the committed `.mcp.json`.)
5. **Next code task is Task 4** (client SDK). Everything before it is done.
6. Continue subagent-driven: implementer → spec review → quality review, per
   task. **Commit before any agent mutation-tests** (see trap 2 above).

---

## UNKNOWNS — documented, not guessed. Do not "resolve" these by reasoning.

Both were checked against RevenueCat's docs and are genuinely undocumented. An
honest UNKNOWN beats a plausible guess; this chunk has been burned four times by
confident claims nobody executed.

1. **Does RevenueCat auto-disable/pause a webhook whose failure rate rises?**
   Keyword census of the authoritative webhooks page: `disab` 0, `deactivat` 0,
   `suspend` 0, `pause` 0, `rate limit` 0, `throttl` 0. The docs describe
   abandoning the individual EVENT only. **Matters because `unresolved-uid` now
   returns 422**, so a systemic identity bug produces a burst of failures.
2. **Do retries RE-RENDER the payload, or replay the stored body?** The docs say
   only that retries "reuse the payload id and event_timestamp_ms". The
   "422 self-heals the alias race" argument REQUIRES re-rendering with a fresh
   `aliases` array. **It is marked UNVERIFIED in the code and must not be cited
   until observed.** The experiment: force a 422 on a first sandbox delivery,
   then diff the two request bodies. The 422 stands on observability alone,
   which needs no assumption.

Also undocumented: whether a retrying event causes head-of-line blocking or
delayed delivery of OTHER events (`queue` 0, `order` 0, `concurren` 0).

## Warnings

- **`revenueCatWebhook` is LIVE in prod and publicly reachable.** It is inert until
  RevenueCat is pointed at it, and the shared secret is its only guard. Any future push
  touching `functions/**`, `shared/**` or `firestore.rules` auto-deploys to PROD.
- **Before go-live, add a log-based alert on sustained 401s from this function.** A secret
  rotated on one side only means every delivery 401s and every customer in that window paid
  and got nothing, with no user-visible signal. RevenueCat gives up after **~2h35m**, so
  that is the whole detection window. `revenueCatWebhook.ts` already emits the
  `logger.warn` to key on.
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
