# Free + Paid Tier Launch — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **One task per subagent, fresh context, then a spec review and an adversarial review before the task counts as done.** Commit before letting any agent mutation-test (see the chunk-4 handoff, environment trap 2).

**Goal:** Take Divit from "caps enforced dark, nothing to buy" to a shipped Free tier (2 AI scans/month, 2 active owned groups, both visibly disclosed in the UI) and a purchasable Pro tier (monthly + annual) on iOS and Android, with web users capped and pointed at the app.

**Architecture:** Server stays the only gate (Cloud Functions + Remote Config + `entitlements/{uid}` written by the RevenueCat webhook). The client gains three read-only real-time sources — `entitlements/{uid}`, `usage/{uid}`, and the owned-events list it already subscribes to — plus the three monetization Remote Config keys in the client namespace, and renders quota/plan state from the **same pure evaluators the server uses** (`shared/scanQuota.ts`, `shared/entitlements.ts`). Purchases go through `@revenuecat/purchases-capacitor` identified by Firebase uid; a server-side reconcile callable is the recovery path for a lost webhook.

**Tech Stack:** React 18 + TS + Vite, Capacitor 7, Firebase (Auth, Firestore, Functions v2, Remote Config, App Check), RevenueCat (native SDK + REST v2 via MCP), Vitest (unit / jsdom / rules / emulator integration).

**Author:** Fable 5.1 — planning only. Each task names the model that implements it.

---

## 0. Where we are (verified 2026-09-09, not relayed)

| Piece                                     | State                                                                                                            | Evidence                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Free-tier enforcement (server)            | **Shipped, dark** (`paywall_enabled=false` in prod)                                                              | `functions/src/eventFunctions.ts:205-209`, `functions/src/index.ts:229-290`                   |
| Caps                                      | 2 active owned groups ✅ · **5** scans/month ❌ (target is **2**)                                                | `config/remote-config/prod.json`, `shared/scanQuota.ts:30`, `shared/monetizationLimits.ts:25` |
| RevenueCat webhook → `entitlements/{uid}` | **Shipped to prod**, secret-guarded, idempotent on `event.id`, 17 int + 23 unit tests                            | `functions/src/revenueCatWebhook.ts`; handoff `docs/handoffs/monetization-chunk4-0909.md`     |
| RevenueCat project                        | Project `projaca9e24b` exists. **Only a "Test Store" app. 0 products, 0 entitlements, 0 offerings, 0 webhooks.** | MCP `list-*` calls this session                                                               |
| Store side (Track A)                      | **Nothing done** — no paid-apps agreement, no tax/banking, no products, on either store                          | Owner, this session                                                                           |
| Client entitlement/quota code             | **None.** `grep -rn entitlement src/` → 0 hits. No RevenueCat package installed. No `logEvent`. No App Check.    | Explore agent, this session                                                                   |
| Client can read its own docs              | Yes: `entitlements/{uid}` and `usage/{uid}` are owner-readable, admin-write-only                                 | `firestore.rules:374-383`                                                                     |
| Client can read monetization RC keys      | Yes once published — `scripts/publish-remote-config.mjs:52` writes **every** parameter to both namespaces        | script source                                                                                 |
| Cap errors to client                      | `HttpsError('resource-exhausted', <prose>)` with **no `details`**                                                | `functions/src/index.ts:248`, `functions/src/eventFunctions.ts:208`                           |
| Failed scan burns quota                   | **No (audit)** — server commit is already after validation; only a client-side throw remains (Task 1.3)          | `functions/src/index.ts:~520`; chunk-4 plan Task 6                                            |
| Web purchase path                         | Out of scope (decided 2026-09-08, reconfirmed today)                                                             | roadmap                                                                                       |

### Audit of the live state (read-only, run 2026-09-09 after the first draft — these override the table above where they differ)

| Claim                                                                                                                                                                                                            | Result                                                                                                                                                                                                                                                                                                              | Evidence                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Local gates                                                                                                                                                                                                      | **761/761 unit, 46 files · typecheck 36 (= ratchet, ZERO headroom) · lint 71 · functions build exit 0**                                                                                                                                                                                                             | run this session                        |
| Live Remote Config, prod + beta, client + server namespaces                                                                                                                                                      | **All four match the committed JSON exactly. Zero drift.** `paywall_enabled=false`, scans `5`, groups `2` everywhere. (The "beta has `true` left set" residue in older handoffs is gone.)                                                                                                                           | REST GET, 4 × HTTP 200                  |
| Webhook deployed + inert                                                                                                                                                                                         | Prod: POST without auth → **401**, GET → **405**. **Has never processed an event**: `webhook_events: 0`, `entitlements: 0`.                                                                                                                                                                                         | curl + aggregation count                |
| **Beta has NO `revenueCatWebhook` and NO `REVENUECAT_WEBHOOK_SECRET`** (and is missing 7 other functions: squads ×3, `deleteAccount`, `reconcileLedger`, `reconcileEventFootprints`, `scheduledLedgerReconcile`) | The paid path cannot be exercised on beta today. A `firebase deploy --only functions --project beta` will **abort** on the missing secret (known `--non-interactive` trap).                                                                                                                                         | `functions:list`, `gcloud secrets list` |
| Prod data                                                                                                                                                                                                        | `usage: 1`, `events: 4`, `entitlements: 0`. Caps have effectively never been hit by anyone.                                                                                                                                                                                                                         | aggregation counts                      |
| "A failed scan burns quota"                                                                                                                                                                                      | **FALSE — the server is already correct.** `commitScanQuotaUsage` (`index.ts:520`) runs after every throw path (`:445`, `:~498`); the comment at `:515-519` says so. The handoff's Task 6 refers to a **client-side** throw in `useReceiptAnalyzer.ts:53` on a server-successful response — narrower, see Task 1.3. | read                                    |
| `details` on cap errors                                                                                                                                                                                          | **Absent on all three** `resource-exhausted` throws — the hourly abuse limiter (`index.ts:202`), the monthly quota (`:248`), and the group cap (`eventFunctions.ts:208`) share one error code with no payload.                                                                                                      | read                                    |
| Client pre-flight before `analyzeBill`                                                                                                                                                                           | **None.** `ReceiptUploader.tsx:231` only disables while uploading/analyzing.                                                                                                                                                                                                                                        | read                                    |
| Client can count active owned events                                                                                                                                                                             | **Yes** — `ownerId` and `archived` are on the client event type (`event.types.ts:8,18`), but the subscription is `memberIds array-contains uid`, so the hook must filter `ownerId === uid` itself.                                                                                                                  | read                                    |
| `android.yml` env                                                                                                                                                                                                | Passes only the 6 `VITE_FIREBASE_*` vars (`:35-45`). The two RevenueCat keys must be added.                                                                                                                                                                                                                         | read                                    |
| Terms / Privacy pages                                                                                                                                                                                            | `https://www.divit-bill.com/terms` and `/privacy` both return **200**, but `appstore/listing.md` lists **neither** URL.                                                                                                                                                                                             | curl                                    |

### Decisions locked this session (owner)

1. **Free scans/month = 2** (was 5). Group cap stays 2.
2. **Products at launch: Pro monthly + Pro annual only.** Trip Pass code stays in the webhook (harmless, fail-closed on unknown product) but **no Trip Pass product is created** and no Trip Pass UI ships. It is Phase 9, optional.
3. **Web users are capped and told to upgrade in the app.** A Pro purchased on mobile is honoured on web automatically (entitlement keyed by Firebase uid).
4. **Only scans + active groups are gated.** Recurring bills, Airbnb mode, Squads, export stay free. (Spec §4.3 lists them as Pro — that is deferred, not rejected.)
5. Prices per spec unless you change them in the stores: **$4.99/mo, $34.99/yr.** Product ids are fixed by code and must match the stores **exactly**: `divit_pro_monthly`, `divit_pro_annual` (`shared/revenueCatEvents.ts` `PRODUCT_PLANS`).

### Model assignment policy

| Model      | Use for                                                                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opus**   | Anything that touches money, identity, security rules, Cloud Functions, the purchase SDK wiring, reconciliation, App Check, alerting. Also the adversarial review of every task in those areas. |
| **Sonnet** | React hooks/components, copy, Remote Config template edits, pure-logic modules + their tests, analytics events, spec-compliance reviews of UI tasks.                                            |
| **Haiku**  | Doc/listing rewrites, `.env.example`, checklist updates, commit-message hygiene.                                                                                                                |
| **Fable**  | Planning only (this doc). Re-plan if Phase 4 discovers the RevenueCat SDK shape differs from what is assumed.                                                                                   |

### Anti-loop rules (read before every task)

- Every task ends in a **hard stop**: either a green gate you ran and read, or an **OWNER** checkpoint. Do not start the next task while a checkpoint is open.
- **Three failed attempts at one step → stop, write the failure into the handoff, and hand back.** Do not try a fourth variation.
- **Remote Config changes take up to 5 minutes.** Wait, then retry once, before concluding anything.
- **Never test caps on prod.** Beta only. (Prod would cap every user with nothing to buy until Phase 5 is live.)
- **Prove a new test can fail** (break the source, watch red, restore) before trusting green. This repo has shipped three vacuous tests already.
- **Every push touching `functions/**`, `shared/**`, `firestore.rules` deploys PROD backend.** Say so in the ship summary.

### Gates (run after every task; numbers are the current baselines)

```bash
npm test                                   # 761 passed / 46 files (will grow)
npm run --silent typecheck 2>&1 | grep -c 'error TS'   # 36 — must not exceed; ZERO headroom, every new file must be clean; do NOT "fix" old ones
npm run lint 2>&1 | tail -1                # 71 problems — must not exceed
npm run build                              # exit 0 — required when src/ changes
npm --prefix functions run build           # exit 0 — required when functions/ or shared/ change
npm run test:rules                         # required when firestore.rules changes
npm run test:integration                   # required when functions/ or shared/ change
```

If port 8081 is held by a stale `firebase emulators:start`, use the isolated-port recipe in `docs/handoffs/monetization-chunk4-0909.md` "Resume instructions" step 3.

---

## Phase map

| Phase | What                                                                                  | Who                                                    | Blocks on                                                   | Testable how                                                                                      |
| ----- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A** | Store + RevenueCat setup (Track A)                                                    | **OWNER** (+ Fable via RevenueCat MCP for the RC side) | nothing — **start today**, it is the calendar long pole     | RevenueCat `list-products` non-empty; SDK keys exist                                              |
| **1** | Server contract: cap=2, structured error `details`, no-burn-on-failure, limits tests  | Opus                                                   | nothing                                                     | unit + integration, then beta manual A/B checklist                                                |
| **2** | Client state: entitlement, scan quota, group cap, RC limits, disclosure ladder        | Sonnet                                                 | Phase 1 (for `details`); can start in parallel on the hooks | jsdom + pure tests                                                                                |
| **3** | Free-tier UI: chips, walls, Settings plan card, paywall screen (no purchase yet)      | Sonnet                                                 | Phase 2                                                     | build + **OWNER manual QA on beta with `paywall_enabled=true`**                                   |
| **4** | Purchase path: RevenueCat SDK, identify by uid, offerings, purchase, restore          | Opus                                                   | Phase 3 + Phase A (SDK keys + at least sandbox products)    | **OWNER sandbox purchase on a real device** → `entitlements/{uid}` appears → UI flips to Pro live |
| **5** | Reconcile-on-demand callable (lost-webhook recovery) + Restore wiring                 | Opus                                                   | Phase 4                                                     | integration test with a mocked RC API + OWNER sandbox test                                        |
| **6** | App Check (monitor → enforce on `analyzeBill` only)                                   | Opus                                                   | Phase 4 (native apps must ship the provider first)          | beta scan works with token; prod metrics show 0 unverified before enforcing                       |
| **7** | Analytics minimum set                                                                 | Sonnet                                                 | Phase 3/4                                                   | DebugView on beta                                                                                 |
| **8** | Go-live: alerting, listing, store submission with IAP, flip `paywall_enabled` on prod | Opus + OWNER                                           | everything above                                            | `I_MEAN_IT=1 npm run rc:publish -- prod`; A5 rollback test first                                  |
| **9** | _(Optional, later)_ Trip Pass; Pro feature gating; Web Billing                        | —                                                      | after launch data                                           | —                                                                                                 |

**Parallelism that is safe:** Phase A runs alongside everything. Phase 2 hooks can be built while Phase 1 is in review. Nothing else overlaps.

---

## Phase A — Store + RevenueCat setup (OWNER; calendar-bound)

Nothing in Track B can be **manually** verified end-to-end until this lands. Start it first; the tax/banking review is measured in days.

### A0. Entity and banking (OWNER — decided 2026-09-09: launch as an individual)

Not legal or tax advice; state rules vary. The practical picture for a first app:

- **No LLC is required.** Both stores support individual (sole-proprietor) developer accounts. Apple: check _Membership details_ in App Store Connect to confirm the existing account is Individual. Google: an individual account + a Google Payments merchant profile.
- **Bank:** any account in your name works (ACH). **Open a separate free personal checking account first** and point both stores at it — no LLC needed for that, it keeps bookkeeping trivial, and changing payout accounts later is a slow, verification-heavy process on both stores.
- **Tax:** W-9 on both (US). Apple and Google are merchant of record — they collect and remit sales tax/VAT; you receive net proceeds and report them as self-employment income (Schedule C). Apple issues a 1099 at year end.
- **RevenueCat needs no bank or entity** — it only reads from the stores. Free up to $2.5k monthly tracked revenue.
- **When an LLC starts to make sense:** (1) individual accounts show your **legal name** as the seller on both stores — an LLC is the day-one reason if you want "Divit LLC" shown instead; (2) liability, which is low here because Divit never holds funds; (3) cost — filing is $50–$500, but some states charge a recurring minimum regardless of income (California: **$800/year**). At $0 revenue that is a bad trade.
- **Migration later is possible:** Apple can convert an Individual account to an Organization (needs a D-U-N-S number, roughly two weeks); Google lets you change the payments profile. Usual path: launch as an individual, form the LLC when revenue justifies it.

Nothing else in this plan changes with the entity choice.

### A1. Apple (OWNER, manual — no ASC API key exists on this machine)

- [ ] App Store Connect → Business → **Paid Applications** agreement: accept, then complete **Tax** and **Banking**. (Status must read "Active" before sandbox purchases return products.)
- [ ] App `6760331853` → Subscriptions → create **Subscription Group** "Divit Pro".
- [ ] In the group create two auto-renewable subscriptions with **exactly** these Product IDs: `divit_pro_monthly` (1 month, $4.99 tier) and `divit_pro_annual` (1 year, $34.99 tier). Add localization (display name, description), a review screenshot (any placeholder until Phase 3 exists — replace before submission).
- [ ] Users and Access → Integrations → **In-App Purchase** → generate an In-App Purchase key (`.p8`); note Key ID + Issuer ID. Also App Information → **App-Specific Shared Secret** (RevenueCat accepts either; the `.p8` is preferred for StoreKit 2).
- [ ] Users and Access → **Sandbox Testers** → create one tester (use a fresh email alias). Sign in with it on a **physical iPhone** under Settings → App Store → Sandbox Account.

### A2. Google (OWNER, manual — no Play CLI locally)

- [ ] Play Console → Setup → **Payments profile** (merchant account) — required before any subscription can be created.
- [ ] `com.singhkapoortech.divit` → Monetize → Subscriptions → create **one subscription** `divit_pro` with two base plans: `monthly` ($4.99) and `annual` ($34.99). **Record the exact product identifier RevenueCat will see** — on the newer Play model it can arrive as `divit_pro:monthly`, not `divit_pro_monthly`. **This is the known trap** (`monetization-chunk4-0909.md` Warnings). If Play insists on `productId:basePlanId`, `PRODUCT_PLANS` in `shared/revenueCatEvents.ts` must add those ids (Opus, a 5-line change + test) — do not assume, read it off a real sandbox event in Phase 4.
- [ ] Setup → **License testing** → add your Google account email so purchases are sandbox.
- [ ] A build that includes the RevenueCat SDK must be on the **internal testing** track before Play products are purchasable (every push to `main` already uploads a draft AAB; promote one manually after Phase 4).

### A3. RevenueCat (Fable via MCP where possible; OWNER supplies credentials)

The MCP key on this machine is a `sk_` v2 key; its write scope is unrecorded. Try the MCP first; fall back to the dashboard for anything that 403s.

- [ ] `create-app` type `app_store`, bundle id `com.singhkapoortech.divit`, with the In-App Purchase key from A1. Then `validate-app-credentials`.
- [ ] `create-app` type `play_store`, package `com.singhkapoortech.divit`, with a Play service-account JSON that has **Financial data + Manage orders** in Play Console (create a new SA for this; do not reuse the CI upload SA).
- [ ] `create-entitlement` lookup_key **`pro`**, display "Divit Pro".
- [ ] `create-product` ×2 per store app with the store ids above; `attach-products-to-entitlement` → `pro`.
- [ ] `create-offering` lookup_key **`default`**, `is_current: true`; `create-packages` `$rc_monthly` and `$rc_annual`; `attach-products-to-package` for each store's product.
- [ ] `create-webhook-integration`: URL `https://us-central1-divit-6d217.cloudfunctions.net/revenueCatWebhook`, Authorization header value = the exact secret in `firebase functions:secrets:access REVENUECAT_WEBHOOK_SECRET --project prod` (OWNER pastes; never in chat/transcript). Environment filter: **all** (prod accepts and stamps sandbox — decided 2026-09-08).
- [ ] `list-app-public-api-keys` for each app → put into `.env` as `VITE_REVENUECAT_IOS_KEY` / `VITE_REVENUECAT_ANDROID_KEY`, and into GitHub secrets with the same names (the Android CI build reads env at build time — check `android.yml` passes `VITE_*`; add these two).

**Exit criteria for Phase A:** `list-products` shows 4 products (2 per store), `list-entitlements` shows `pro` with 4 attached, `list-offerings` shows `default` current with 2 packages, `list-webhook-integrations` shows the prod URL. Paid agreements "Active" on both stores.

**Do not wait for Phase A to start Phases 1–3.**

---

## Phase 1 — Server contract (Opus)

Four small tasks. Every one touches `functions/**` or `shared/**` → **each push deploys PROD backend.** Nothing here is user-visible while `paywall_enabled=false`, so shipping is safe; still batch them into one push.

### Task 1.1 — Free scans/month becomes 2 (Sonnet is fine here; it is constants + tests)

**Files:** modify `shared/scanQuota.ts:30`, `shared/monetizationLimits.ts:25`, `config/remote-config/prod.json`, `config/remote-config/beta.json`; tests `tests/scanQuota.test.ts`, `tests/monetizationLimits.test.ts`.

- [ ] In `tests/scanQuota.test.ts` add: `it('free tier allows exactly 2 scans per UTC month', …)` — evaluate with `used: 2` → `allowed: false`, `used: 1` → `allowed: true, remaining: 1`. Add to `tests/monetizationLimits.test.ts`: `expect(FREE_SCANS_PER_MONTH_DEFAULT).toBe(2)` **and** `expect(DEFAULT_LIMITS.paywallEnabled).toBe(false)` (the unpinned fail-safe flagged in the handoff; `DEFAULT_LIMITS` lives in `functions/src/remoteConfigLimits.ts` — import it the way `tests/analyzeBillGates.test.ts` imports functions modules, or pin `resolvePaywallEnabled(undefined) === false` in shared).
- [ ] Run `npx vitest run tests/scanQuota.test.ts tests/monetizationLimits.test.ts` → the new tests FAIL (5 ≠ 2).
- [ ] Change both constants to `2`; change both RC JSON `free_scans_per_month` defaults to `"2"`; update any existing test that hard-codes 5 (there will be several — change the expectation, not the semantics).
- [ ] Re-run → PASS. `npm test` → all green, count noted.
- [ ] Commit `feat(monetization): free tier is 2 AI scans per month`.

### Task 1.2 — Structured `details` on both cap errors (Opus)

The client must render a typed wall, not parse prose. Add a `details` object to the two `HttpsError` throws; keep the message text unchanged (it is still the fallback copy).

**Files:** create `shared/capErrors.ts`; modify `functions/src/index.ts:~248`, `functions/src/eventFunctions.ts:205-209`; tests `tests/capErrors.test.ts`, extend `tests/analyzeBillGates.test.ts` (source-text assertion pattern).

```ts
// shared/capErrors.ts — pure, no imports
export type CapErrorDetails =
  | { reason: 'scan-quota'; used: number; limit: number; resetsAtMs: number }
  | { reason: 'scan-rate-limit'; retryAfterMs: number } // the hourly abuse limiter, index.ts:202 — NOT a paywall trigger
  | { reason: 'group-cap'; activeCount: number; limit: number };

export function isCapErrorDetails(d: unknown): d is CapErrorDetails {
  if (!d || typeof d !== 'object') return false;
  const r = (d as { reason?: unknown }).reason;
  return r === 'scan-quota' || r === 'group-cap';
}
```

- [ ] Test first: `tests/capErrors.test.ts` — `isCapErrorDetails` accepts both shapes, rejects `null`, `'scan-quota'` (a string), and `{reason:'other'}`. Run → FAIL (module missing). Implement → PASS.
- [ ] In `functions/src/index.ts` change the throw to `new HttpsError('resource-exhausted', <same message>, { reason: 'scan-quota', used: decision.used, limit: decision.limit, resetsAtMs: decision.resetsAtMs } satisfies CapErrorDetails)`. In `eventFunctions.ts` `assertGroupSlotAvailable`: `new HttpsError('resource-exhausted', capMessage(activeCount, limit), { reason: 'group-cap', activeCount, limit } satisfies CapErrorDetails)`.
- [ ] Also give the hourly rate-limiter throw (`index.ts:202`) `{ reason: 'scan-rate-limit', retryAfterMs }` so the client can tell "slow down" from "out of scans" — today all three share `resource-exhausted` with no payload, and a wall shown for a rate-limit would be a lie.
- [ ] Extend `tests/analyzeBillGates.test.ts` with a source-text assertion that the `resource-exhausted` throw in `index.ts` contains `reason: 'scan-quota'` (this file cannot be imported — see its header). For `eventFunctions.ts` the function IS importable: in `tests/integration/groupCapAndQuota.int.test.ts` add a case that calls `assertGroupSlotAvailable` (export it if it is not) with a stubbed limits object at cap and asserts `err.details` deep-equals `{reason:'group-cap', activeCount:2, limit:2}`. Prove it can fail by deleting the `details` arg once.
- [ ] `npm --prefix functions run build` exit 0; `npm run test:integration` green. Commit `feat(monetization): cap errors carry structured details for the client`.

### Task 1.3 — Pin "a failed scan does not consume quota" + close the client-side hole (Opus)

**Audit correction:** the server is **already right** — `commitScanQuotaUsage` (`functions/src/index.ts:520`) runs only after every validation throw. No server change. Two things remain: pin it, and look at the client.

**Files:** test `tests/integration/scanUsage.int.test.ts` (new); read `src/hooks/useReceiptAnalyzer.ts:40-60`.

- [ ] Integration test that **pins** the current behaviour: seed `usage/{uid}` with `scansThisPeriod: 1`; call `checkScanQuota` then the validation helpers with an unusable bill so the failure path is taken; assert `scansThisPeriod` is still `1`; then take the success path and assert `2`. Prove it can fail by temporarily moving the commit above the validation in a scratch copy (or by asserting `2` on the failure path) — watch red, restore.
- [ ] Client: `useReceiptAnalyzer.ts:53` throws on a response the **server counted as a success**. Read what it rejects. If it is a client-side shape check that a valid server response can fail, remove it (the server already validated); if it is unreachable for a valid response, leave it and note that in the commit. Do **not** add a refund path — a server-successful scan legitimately costs a scan.
- [ ] Commit `test(monetization): pin that failed scans never consume quota`.

### Task 1.4 — `getMonetizationLimits()` gets tests (Opus)

The single module every cap flows through has zero tests (handoff). Uses the existing seam `__resetRemoteConfigCacheForTests`.

**Files:** test `tests/remoteConfigLimits.test.ts` (new; mock `firebase-admin/remote-config` `getRemoteConfig().getServerTemplate()`).

- [ ] Cases: (a) template present → values parsed + clamped; (b) `getServerTemplate` throws on first call → returns `DEFAULT_LIMITS` with `degraded:true` and `paywallEnabled:false`; (c) second call within `CACHE_TTL_MS` does not re-fetch (spy call count 1); (d) fetch fails after a good fetch → returns last-good, not defaults. Prove (b) can fail by flipping the default once.
- [ ] Commit `test(monetization): cover the Remote Config limits loader`.

### Phase 1 exit — OWNER checkpoint on BETA (~30 min, do after the push deploys)

**Beta prerequisite (audit finding):** beta has no `REVENUECAT_WEBHOOK_SECRET`, and the deploy aborts on a missing secret. First `firebase functions:secrets:set REVENUECAT_WEBHOOK_SECRET --project beta` (any throwaway value — beta never receives real webhooks). Then `firebase deploy --only functions --project beta` (this also brings beta's 8 missing functions up to date) and `npm run rc:publish -- beta` after setting `paywall_enabled: "true"` in `config/remote-config/beta.json` **locally only** (do not commit `true`). Then run rows **A1–A5** and **B1–B4** from `docs/handoffs/monetization-chunk4-0909.md` "Manual QA checklist" with the scan numbers changed to **2 / 3rd scan refused**. **A5 (the rollback) is the most important row.** Report which rows passed. Restore beta.json before committing anything.

---

## Phase 2 — Client state (Sonnet)

Read-only, real-time, no UI yet. Every hook returns a `loading` flag and a safe default so the UI never flashes a wall at a Pro user or hides one from a free user.

**Files (all new):**

- `src/services/monetizationConfigService.ts` — client Remote Config fetch of `paywall_enabled`, `free_scans_per_month`, `free_active_groups`. Model on `src/services/minimumVersionService.ts:71-101` (same `fetchAndActivate` + `getValue` pattern; `minimumFetchIntervalMillis` 5 min). Returns `{ paywallEnabled: boolean; freeScansPerMonth: number; freeActiveGroups: number }` with defaults `{false, 2, 2}` from `shared/monetizationLimits.ts` (use `resolveLimit`/`resolvePaywallEnabled` — same clamping as the server).
- `src/hooks/useMonetizationConfig.ts` — wraps the service; memoised per app session.
- `src/hooks/useEntitlement.ts` — `onSnapshot(doc(db,'entitlements',uid))` → `{ plan: Plan; unlimited: boolean; expiresAt?: number; loading }` via `resolveEffectivePlan` from `@shared/entitlements`. Absent doc → `free`. Errors → `free` + `console.warn` (never throw).
- `src/hooks/useScanQuota.ts` — `onSnapshot(doc(db,'usage',uid))` + `useMonetizationConfig` → `evaluateScanQuota({scanPeriodStart, scansThisPeriod}, Date.now(), freeScansPerMonth)` from `@shared/scanQuota` → `{ used, remaining, limit, resetsAtMs, loading }`. **Time skew note:** the server uses server time; the client uses `Date.now()`. Only the month boundary matters; accept it.
- `src/hooks/useGroupCap.ts` — takes the owned events array `useEventManager` already holds; `activeCount = events.filter(e => e.ownerId === uid && e.archived !== true).length` (**count by subtraction — never `archived === false`**, legacy docs lack the field) → `{ activeCount, limit, atCap: activeCount >= limit }`.
- `src/utils/quotaDisclosure.ts` — the §4.3.1 ladder as a pure function.
- `src/utils/capError.ts` — `capDetailsFromError(err): CapErrorDetails | null` using `isCapErrorDetails` on `err.details` (Firebase callable errors expose `.details`).

```ts
// src/utils/quotaDisclosure.ts
export type DisclosureLevel = 'hidden' | 'silent' | 'ambient' | 'last' | 'wall';
export interface ScanDisclosure {
  level: DisclosureLevel;
  text: string;
}

export function scanDisclosure(args: {
  unlimited: boolean;
  paywallEnabled: boolean;
  remaining: number;
  limit: number;
  resetsAtMs: number;
}): ScanDisclosure {
  const { unlimited, paywallEnabled, remaining, limit, resetsAtMs } = args;
  if (unlimited || !paywallEnabled) return { level: 'hidden', text: '' };
  const reset = new Date(resetsAtMs).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  if (remaining <= 0)
    return {
      level: 'wall',
      text: `You've used your ${limit} free scans this month · resets ${reset}`,
    };
  if (remaining === 1)
    return { level: 'last', text: `Last free scan this month · resets ${reset}` };
  // With limit=2 the "ambient" band is remaining===2 (the spec's 3-2 band scaled down).
  return { level: 'ambient', text: `${remaining} scans left this month · resets ${reset}` };
}

export function groupDisclosure(args: {
  unlimited: boolean;
  paywallEnabled: boolean;
  activeCount: number;
  limit: number;
}) {
  const { unlimited, paywallEnabled, activeCount, limit } = args;
  if (unlimited || !paywallEnabled || activeCount < limit) return { atCap: false, text: '' };
  return { atCap: true, text: `${Math.min(activeCount, limit)} of ${limit} groups active` };
}
```

**Note the deliberate deviation from spec §4.3.1:** with a limit of 2 there is no "silent" band — the user sees the count from their first scan. That is the correct reading of "5 or 4 remaining = silent" scaled to 2.

- [x] Task 2.1: `tests/quotaDisclosure.test.ts` — table test over `remaining ∈ {2,1,0}` × `unlimited` × `paywallEnabled`; assert level AND that the text contains the reset date ("Always show the reset date alongside the count"). Write first, watch fail, implement.
- [x] Task 2.2: `tests/react/useEntitlement.test.tsx`, `tests/react/useScanQuota.test.tsx`, `tests/react/useGroupCap.test.tsx` — model on `tests/react/usePeopleManager.race.test.tsx`; mock `firebase/firestore` `onSnapshot` to push (a) no doc, (b) a Pro doc with future `expiresAt`, (c) an expired Pro doc, and for usage (a) absent, (b) `{scansThisPeriod:2, scanPeriodStart: this month}` → `remaining 0`, (c) last month's period → `remaining 2` (rolled). For groups: 3 owned events, one `archived:true`, one missing the field → `activeCount 2`.
- [x] Task 2.3: `monetizationConfigService` + `useMonetizationConfig`; test that a fetch failure yields `{false, 2, 2}` (fail-safe = dark).
- [ ] `npm test`, typecheck ≤ 36, build exit 0. Commit per task.

**Phase 2 exit:** green gates. No owner action (nothing visible yet).

---

## Phase 3 — Free-tier UI (Sonnet; adversarial review by Opus on the gating logic only)

All copy below is final unless the owner edits it. Gating in the UI is a **pre-action courtesy**; the server remains the gate, and the `capError` fallback handles the race where the client thought it was fine.

### Task 3.1 — Scan quota chip + pre-action wall

**Files:** create `src/components/monetization/ScanQuotaChip.tsx`, `src/components/monetization/ScanQuotaWall.tsx`; modify `src/components/receipt/ReceiptUploader.tsx:29` (render chip above the CTA; when `level==='wall'` replace the CTA with the wall — the camera must never open at zero), `src/pages/Dashboard.tsx` (ambient chip near the AI-scan entry), `src/hooks/useReceiptAnalyzer.ts:68-73` (on `resource-exhausted` with `details.reason==='scan-quota'` open `ScanQuotaWall` instead of the toast).

Wall copy: **"You've used your 2 free scans this month."** sub: "Scans reset {Month D}. You can still add items by hand." Buttons: `[ Add items manually ]` `[ See Pro ]`. On web the second button reads `[ Get Pro in the app ]` and opens `/upgrade`.

### Task 3.2 — Group cap indicator + wall

**Files:** create `src/components/monetization/GroupCapWall.tsx`; modify `src/pages/EventsView.tsx` (header near the `Plus` button shows "2 of 2 groups active" only when `atCap`; the `Plus` opens `GroupCapWall` instead of `CreateEventDialog` when `atCap`), `src/components/events/CreateEventDialog.tsx` (no change if the gate is upstream), `EventsView.tsx:103,140` and `src/pages/EventDetailView.tsx:423` (on `details.reason==='group-cap'` open the wall instead of the toast — covers unarchive).

Wall copy (spec, verbatim): **"You have 2 active groups."** "Archive one you're finished with, or go unlimited with Pro." `[ Archive a group ]` (scrolls/links to the active list) `[ See Pro ]`.

### Task 3.3 — Settings → Plan card

**Files:** create `src/components/settings/SubscriptionCard.tsx`; modify `src/pages/SettingsView.tsx:50-66` (insert above `DeleteAccountCard`).

Shows: plan badge (Free / Pro · renews {date}); scans line ("1 of 2 free scans used · resets Oct 1" or "Unlimited"); groups line ("2 of 2 active" / "Unlimited"); buttons `Upgrade to Pro` (native → paywall; web → "Available in the iOS and Android app" + store badges), `Restore purchases` (native only; wired in Phase 4 — render disabled with tooltip until then), `Manage subscription` (native → `Purchases.showManageSubscriptions()` in Phase 4; hidden until then).

### Task 3.4 — Paywall screen (static in this phase)

**Files:** create `src/pages/UpgradeView.tsx` at route `/upgrade` (`src/App.tsx:~160`), `src/components/monetization/PaywallPlans.tsx`.

Must contain (Guideline 3.1.2): both plans with **price and duration** ("$4.99 / month", "$34.99 / year · save 42%"), what Pro includes (unlimited AI scans, unlimited active groups), a **Restore purchases** link, and **Terms of Use + Privacy Policy** links — `https://www.divit-bill.com/terms` and `https://www.divit-bill.com/privacy` (both verified 200 this session; neither is in `appstore/listing.md` yet — Phase 8.2 adds them). Prices are **placeholders until Phase 4 replaces them with `Offerings` from the SDK** — mark them with a `// TODO(phase4)` that Task 4.3 removes. On web: same page, buttons replaced with "Get Divit on the App Store / Google Play".

- [ ] Each task: build, typecheck ≤ 36, lint ≤ 71, `npm test`. Add `tests/react/ScanQuotaWall.test.tsx` (renders both buttons; at `level!=='wall'` renders nothing) and `tests/react/GroupCapWall.test.tsx`. Commit per task.
- [ ] Opus adversarial review of 3.1 + 3.2 only: can a free user at cap reach the camera or the create dialog through any other route (`/transaction/:billId`, `/airbnb/:billId`, `StepHeader.tsx:57` re-scan, `EventDetailView.tsx:423` unarchive)? Every entry must be gated or fall back to the `details` wall.

### Phase 3 exit — OWNER manual QA on BETA (`npm run dev:beta`, beta `paywall_enabled=true`)

| #   | Do                                                    | Expect                                                                                       |
| --- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Fresh free account, open Dashboard                    | chip "2 scans left this month · resets {date}"                                               |
| 2   | Scan one receipt successfully                         | chip → "Last free scan this month" **immediately** (onSnapshot)                              |
| 3   | Scan a blank image (fails)                            | chip does NOT move                                                                           |
| 4   | Scan 2nd receipt                                      | success; chip → wall state; the scan CTA is replaced by the wall **before** the camera opens |
| 5   | Create 2 groups                                       | no indicator; create a 3rd → wall "You have 2 active groups." with both buttons              |
| 6   | Archive one, create again                             | succeeds; archive indicator gone                                                             |
| 7   | Settings → Plan card                                  | Free · "2 of 2 scans used" · "2 of 2 groups active"                                          |
| 8   | Same account on the web build                         | same caps; buttons say "Get Pro in the app"                                                  |
| 9   | Flip beta `paywall_enabled=false`, wait 5 min, reload | every chip/wall disappears; scans and groups unlimited                                       |

Row 9 proves the UI honours the kill switch. Say "verified" and Phase 4 starts.

---

## Phase 4 — Purchase path (Opus). Blocks on Phase A exit + Phase 3 "verified".

**Everything here must be right or a customer pays and gets nothing.** The single invariant: **RevenueCat `app_user_id` == Firebase uid**, because the webhook resolves the entitlement doc from it (`resolveFirebaseUid`). Never configure the SDK before the uid is known.

### Task 4.1 — Install + service

- [ ] `npm i @revenuecat/purchases-capacitor` (Capacitor 7 line — check `npm view @revenuecat/purchases-capacitor peerDependencies` and pin the major that lists `@capacitor/core ^7`), `npx cap sync`. Commit the `ios/App/Podfile.lock` + `android` changes.
- [ ] Create `src/services/purchaseService.ts` — the chunk-4 plan's Task 4 design (`docs/superpowers/plans/2026-09-08-monetization-chunk-4-revenuecat.md` "Task 4") **plus** the two functions it omitted:

```ts
import { Capacitor } from '@capacitor/core';
import {
  Purchases,
  LOG_LEVEL,
  type PurchasesPackage,
  type CustomerInfo,
} from '@revenuecat/purchases-capacitor';

const isNative = () => Capacitor.isNativePlatform();
const apiKey = () =>
  Capacitor.getPlatform() === 'ios'
    ? import.meta.env.VITE_REVENUECAT_IOS_KEY
    : import.meta.env.VITE_REVENUECAT_ANDROID_KEY;

export async function configurePurchases(firebaseUid: string): Promise<void> {
  if (!isNative() || !apiKey()) return; // web / missing key: silent no-op
  if (import.meta.env.DEV) await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });
  await Purchases.configure({ apiKey: apiKey()!, appUserID: firebaseUid });
}
export async function identifyPurchaser(firebaseUid: string) {
  if (isNative()) await Purchases.logIn({ appUserID: firebaseUid });
}
export async function forgetPurchaser() {
  if (isNative()) await Purchases.logOut();
}

export interface ProOffer {
  id: 'monthly' | 'annual';
  priceString: string;
  pkg: PurchasesPackage;
}
export async function getProOffers(): Promise<ProOffer[]> {
  if (!isNative()) return [];
  const { current } = await Purchases.getOfferings();
  const out: ProOffer[] = [];
  if (current?.monthly)
    out.push({
      id: 'monthly',
      priceString: current.monthly.product.priceString,
      pkg: current.monthly,
    });
  if (current?.annual)
    out.push({
      id: 'annual',
      priceString: current.annual.product.priceString,
      pkg: current.annual,
    });
  return out;
}
export async function purchase(pkg: PurchasesPackage): Promise<CustomerInfo | null> {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
}
export async function restorePurchases(): Promise<CustomerInfo | null> {
  if (!isNative()) return null;
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}
export async function openManageSubscriptions() {
  if (isNative()) await Purchases.showManageSubscriptions?.();
}
```

Verify the exact method names against the installed package's `.d.ts` (context7: `@revenuecat/purchases-capacitor`). **If they differ, fix the plan text, do not improvise a wrapper.**

- [ ] `tests/react/purchaseService.web.test.ts`: with `Capacitor.isNativePlatform()` mocked `false`, every export resolves without calling `Purchases.*` (spy count 0). This pins the web no-op contract the UI relies on.

### Task 4.2 — AuthContext wiring

**Files:** modify `src/contexts/AuthContext.tsx:83-95` (inside `onAuthStateChanged`, next to `syncUserProfile`) and `:298` (`signOut`).

- [ ] `const purchasesConfigured = useRef(false)`. On user: `if (!purchasesConfigured.current) { await configurePurchases(uid); purchasesConfigured.current = true } else { await identifyPurchaser(uid) }` — wrapped in `try/catch` → `console.warn`, **fire-and-forget, never awaited before `setUser`** (a RevenueCat outage must not become an auth outage). On sign-out: `forgetPurchaser()` same wrapping.
- [ ] Test (jsdom): mock the service; assert `configurePurchases` is called with the uid on first auth, `identifyPurchaser` on a second uid, `forgetPurchaser` on sign-out, and that a rejecting `configurePurchases` does not prevent `user` from being set.

### Task 4.3 — Paywall + Settings wiring

- [ ] `UpgradeView` loads `getProOffers()` and replaces the placeholder prices with `priceString` (remove the `TODO(phase4)`); on empty offers (web, or store not ready) shows the static copy with "Get the app" / "Store not available yet — try again later".
- [ ] Purchase button → `purchase(pkg)`; on success show "You're Pro" and rely on **`useEntitlement` flipping live when the webhook lands** (do not trust `customerInfo` alone — the server is the truth). If `entitlements/{uid}` has not flipped within **15 s**, show "Finalising your purchase…" and call the Phase 5 reconcile callable (stub it as a no-op with a `TODO(phase5)` for now — the only TODO allowed).
- [ ] `SubscriptionCard`: enable **Restore purchases** → `restorePurchases()` then reconcile; **Manage subscription** → `openManageSubscriptions()`.
- [ ] `.env.example` + GitHub secrets: `VITE_REVENUECAT_IOS_KEY`, `VITE_REVENUECAT_ANDROID_KEY` (Haiku). Confirm `android.yml` exports them into the build env.

### Task 4.4 — Product-id contract check (Opus, 10 minutes)

- [ ] After the OWNER's first sandbox purchase, read the webhook's log line for `product_id` (`firebase functions:log --only revenueCatWebhook --project prod`). If Play delivers `divit_pro:monthly`-style ids, add them to `PRODUCT_PLANS` with a test, ship. If a purchase produced `ignore: unknown-product`, **that customer's entitlement was never written** — grant manually via the Phase 5 reconcile once it exists.

### Phase 4 exit — OWNER end-to-end on a REAL device (prod backend, sandbox store)

Prereqs: Phase A complete; a TestFlight (or local Xcode → device) build with the SDK; iPhone signed into the sandbox tester. Android: internal-testing build + license-tester account.

| #   | Do                                                                            | Expect                                                                                              |
| --- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Sign in, Settings → Plan                                                      | "Free"                                                                                              |
| 2   | Upgrade → both plans show **store** prices (not placeholders)                 | yes                                                                                                 |
| 3   | Buy monthly (sandbox)                                                         | Apple sheet → success → within ~5 s Plan card flips to "Pro · renews {date}"; chips/walls disappear |
| 4   | `firebase functions:log --only revenueCatWebhook --project prod`              | one `INITIAL_PURCHASE`, `applied`, `environment: SANDBOX`                                           |
| 5   | Firestore console: `entitlements/{uid}`                                       | `plan: 'pro'`, `expiresAt` future, `environment: 'SANDBOX'`                                         |
| 6   | Sign out, sign in on the **web** with the same account                        | Pro, no chips                                                                                       |
| 7   | Delete the app, reinstall, sign in, **Restore purchases**                     | Pro again                                                                                           |
| 8   | Sandbox renewals tick every ~5 min for monthly: watch 2 `RENEWAL` events land | `expiresAt` advances                                                                                |
| 9   | Cancel in sandbox settings; wait for `EXPIRATION`                             | Plan card → Free, chips return                                                                      |

Row 3's "within ~5 s" is the webhook path. If it exceeds 15 s the reconcile in Phase 5 is what saves the customer — which is why Phase 5 is **not optional**.

---

## Phase 5 — Reconcile-on-demand + Restore (Opus)

**Why this exists:** RevenueCat retries a failed delivery only 6 times over ~2h35m, then the event is **gone forever** (verified in the chunk-4 handoff). A webhook outage of three hours silently loses every purchase in it. The client must be able to ask the server "check RevenueCat now".

### Task 5.1 — `reconcileEntitlement` callable

**Files:** create `functions/src/reconcileEntitlement.ts`; modify `functions/src/index.ts` (export); secret `REVENUECAT_SECRET_API_KEY` (v1 secret key from the RevenueCat dashboard → `firebase functions:secrets:set REVENUECAT_SECRET_API_KEY --project prod`); tests `tests/integration/reconcileEntitlement.int.test.ts`, `tests/reconcileEntitlement.test.ts`.

Design:

1. Auth required; `uid = request.auth.uid`. Rate-limit: one call per uid per 60 s (store `lastReconcileAt` on `usage/{uid}` — same disjoint-field pattern as the scan limiter).
2. `GET https://api.revenuecat.com/v1/subscribers/{uid}` with the secret key. Parse `subscriber.entitlements.pro` → `{ expires_date, product_identifier, grace_period_expires_date }`.
3. Map to the **same** `EntitlementMutation` shapes as the webhook (`set-pro` with `expiresAt`, or `clear-pro` when absent/expired) and apply through **`applyRevenueCatEvent`'s transaction path** — build a synthetic `RevenueCatEvent` with `id: 'reconcile:' + uid + ':' + expires_date` so the replay ledger dedupes repeat calls. Do **not** write `entitlements/{uid}` with a second code path.
4. Never throw to the client on RevenueCat failure — return `{ status: 'unavailable' }`; the UI keeps waiting.

- [ ] Pure test: subscriber JSON fixtures (active, expired, grace, no entitlement) → expected mutation. Integration test: apply → doc written; call twice → one ledger row (replay guard). Prove the replay test can fail by changing the synthetic id to include `Date.now()`.
- [ ] Rules: no change (callable). `npm --prefix functions run build`, integration green.

### Task 5.2 — Client wiring

- [ ] `src/services/entitlementSyncService.ts` → `httpsCallable('reconcileEntitlement')`. Call it: after a purchase if the doc has not flipped in 15 s (replaces the Task 4.3 stub), after **Restore purchases**, and once on **app foreground** (`@capacitor/app` `appStateChange` `isActive`) at most every 10 min.
- [ ] Remove the last `TODO(phase5)`. `grep -rn "TODO(phase" src/` → 0.

**Phase 5 exit — OWNER:** on the device, put the phone in airplane mode _after_ buying but _before_ the sheet closes… (too fiddly). Instead: **Fable/Opus temporarily rotates the webhook secret on the RevenueCat side only** (MCP `update-webhook-integration`) so deliveries 401, OWNER buys annual in sandbox → Plan stays Free → tap **Restore purchases** → Plan flips to Pro via reconcile. Restore the secret. Check `functions:log`: one `401` warn line (this is also the Phase 8 alert's test signal).

---

## Phase 6 — App Check (Opus)

Spec §6.1: required once scans are a sold good. Absent entirely today.

- [ ] Firebase console (OWNER): App Check → register iOS app with **App Attest**, Android with **Play Integrity**, web with **reCAPTCHA v3** (site key → `VITE_RECAPTCHA_SITE_KEY`). Enable the **debug provider** for local dev and CI.
- [ ] `src/config/firebase.ts` after `initializeApp`: in DEV set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true`; call `initializeAppCheck` **only if the site key is present** (a module-scope throw here blanked the app once — `docs/handoffs/ci-e2e-repair-0908.md`). Native: the Capacitor Firebase App Check plugin (`@capacitor-firebase/app-check`) — confirm the version line matches `@capacitor-firebase/authentication ^7.3.1`.
- [ ] Deploy with **monitor mode** (no `enforceAppCheck`) → prod. Wait for a store build containing the provider to reach users (OWNER decides when: the metric "unverified requests" on `analyzeBill` in the Firebase console must be ~0 for 7 days).
- [ ] Then `enforceAppCheck: true` on **`analyzeBill` only** ("one gate at a time"). Beta first, real scan works, then prod.

**Phase 6 exit:** OWNER scans on beta with an enforced build → works; a `curl` to `analyzeBill` without a token → `401/403`.

---

## Phase 7 — Analytics minimum set (Sonnet)

Zero `logEvent` calls exist. Without these the paywall cannot be tuned. `analytics` is already exported from `src/config/firebase.ts:40`.

- [ ] `src/services/analyticsService.ts` with typed helpers: `track('scan_performed' | 'scan_cap_reached' | 'group_cap_reached' | 'paywall_viewed' | 'purchase_started' | 'purchase_completed' | 'purchase_failed' | 'restore_completed' | 'group_created' | 'settlement_completed', params?)`. No-op when analytics is unavailable (native web-view without measurement id).
- [ ] Wire: `useReceiptAnalyzer` (performed / cap), walls (cap reached / paywall_viewed with `source`), `UpgradeView` (started/completed/failed with `plan`), Settings restore, `useEventManager.createEvent`, settlement success.
- [ ] Test: a jsdom test asserting each helper calls `logEvent` with the exact event name (table test) — protects the names, which are the contract with the dashboards.

**Phase 7 exit:** OWNER opens Firebase DebugView on beta, performs a scan and views the paywall, sees both events.

---

## Phase 8 — Go-live (Opus + OWNER)

Order matters. Do not flip the switch before the app that contains the paywall is **live in both stores**, or free users hit walls with nothing to buy.

- [ ] **8.1 Alert on webhook 401s (Opus).** `gcloud logging metrics create revenuecat_webhook_401 --project divit-6d217 --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="revenuecatwebhook" AND severity>=WARNING AND textPayload:"401"'` (adjust to the actual `logger.warn` message) + an alerting policy that emails the owner when count ≥ 1 in 10 min. **Test it** with the Phase 5 exit rotation trick. Detection window is 2h35m; the policy must page inside it.
- [ ] **8.2 Listing (Haiku).** Rewrite `appstore/listing.md:64` ("Divit is free to use") → free tier + Pro description; add the IAP names/prices to the review notes; add the **Privacy Policy URL** (`/privacy`) and **Terms (EULA) URL** (`/terms`) fields — both pages exist and return 200 but the listing lists neither (audit finding).
- [ ] **8.3 Store submission (OWNER, with the `store-submission` skill).** Submit the iOS build with both subscriptions attached to the version; Play: promote the internal build to production with the subscription active. Review notes must include a sandbox path to the paywall.
- [ ] **8.4 `webhook_events` retention decision (OWNER).** Default recommendation: **keep forever** (Firestore cost is negligible at this scale; any TTL reopens the replay window). Record the decision in the handoff.
- [ ] **8.5 Flip prod.** After both store builds are live: set `paywall_enabled: "true"` in `config/remote-config/prod.json`, commit, `I_MEAN_IT=1 npm run rc:publish -- prod`. Wait 5 min. OWNER: on a **free** prod account, confirm chip + wall appear and the paywall lists real prices. Then the **rollback drill**: publish `false`, wait 5 min, confirm walls vanish. Then publish `true` again. Launch.

**Phase 8 exit:** paywall live in prod; alert tested; rollback drill passed and recorded.

---

## Phase 9 — After launch (optional, not planned in detail)

- Trip Pass (webhook already handles `NON_RENEWING_PURCHASE`; needs product, offering package, UI sheet with "does not renew, non-refundable", restore of an unexpired pass, and the reconcile extended to `non_subscriptions`).
- Pro feature gating (recurring, Airbnb, Squads, export) — server checks + UI locks.
- RevenueCat Web Billing (Stripe) for web users.
- Handoff items still open from chunk 4: out-of-order `EXPIRATION` (Task 2b), `TRANSFER` events, `ADMIN_UIDS` hardcoded, push notifications.

---

## OWNER master checklist (everything that needs your hands, in order)

| When               | What                                                                                                                                   | Where                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **Today**          | Apple Paid Applications agreement + tax + banking                                                                                      | App Store Connect            |
| Today              | Play payments profile                                                                                                                  | Play Console                 |
| After agreements   | Create 2 subscriptions per store with the exact ids                                                                                    | ASC / Play                   |
| After products     | IAP key (.p8), Play SA JSON, sandbox tester, license tester                                                                            | ASC / Play / GCP             |
| Then               | Hand keys to Fable → RevenueCat apps/products/entitlement/offering/webhook via MCP; put `VITE_REVENUECAT_*` in `.env` + GitHub secrets | this session                 |
| After Phase 1 push | Deploy functions to beta; beta RC `paywall_enabled=true`; run A1–A5, B1–B4 (scan cap = 2)                                              | beta                         |
| After Phase 3      | Manual QA table (9 rows) on beta; say "verified"                                                                                       | beta                         |
| After Phase 4      | Real-device sandbox purchase table (9 rows)                                                                                            | prod backend + sandbox store |
| After Phase 5      | Lost-webhook drill via Restore                                                                                                         | prod                         |
| Phase 6            | Register App Check providers in Firebase console; decide when to enforce                                                               | Firebase console             |
| Phase 7            | DebugView check                                                                                                                        | Firebase console             |
| Phase 8            | Store submissions; retention decision; the flip + rollback drill                                                                       | stores + RC                  |

## What is explicitly NOT verified by this plan (be honest at the end)

- Real (non-sandbox) money flow — first real purchase is the test.
- Apple's review outcome for the paywall copy.
- Whether RevenueCat re-renders payloads on retry (chunk-4 UNKNOWN #2) — still unknown; the reconcile path makes it moot.
- Play's product-id format until a real sandbox event is read (Task 4.4).
