# Divit monetization — chunks 1 & 2 shipped, chunk 3 next

**Status:** MILESTONE
**Workspace:** `/Users/simran/Documents/GitHub/Bill-Split`
**Branch:** `main` — merged with `origin/main`, **14 ahead / 0 behind, nothing pushed**
**Updated:** 2026-09-06

## Goal

Ship paid tiers for Divit in 2026: a capped free tier, a $4.99/mo Pro, and a $3.99/14-day
Trip Pass — live at App Store launch, billed through RevenueCat. The full design is in
`docs/superpowers/specs/2026-09-06-monetization-design.md`; **read that first, it is the
source of truth.** This handoff covers execution state only.

## Done

**Chunk 1 — security prerequisites** (`becef89` … `5ec53e2`, plus `1dc5343`)

- `entitlements/{userId}` and `usage/{userId}` created, owner-read, **all client writes
  denied**. Plan state could not previously be stored anywhere safe: `firestore.rules:40`
  grants whole-document self-updates on user profiles, so a `plan` field there would have
  been editable from the browser console.
- `analyzeBill` gained a **30 scans/hour/user** limit. It previously had none at all —
  `maxInstances: 10` is a concurrency cap, not a usage cap.
- A consecutive-failure streak that escalates to photo guidance after 3 **extraction**
  failures. Infrastructure failures (Gemini transport, timeout, Google-side quota) never
  advance it — an outage must never tell users their photo is bad.
- Guest claim screen no longer prints UIDs, names and participant arrays to the production
  console.
- Client error mapping fixed: the Functions SDK sets `code` to `functions/<code>`, so every
  `code === 'unauthenticated'` branch in `src/services/gemini.ts` was **dead from the day it
  was written**.
- **Money bug fixed** (`1dc5343`): the client filtered items with `price > 0`, discarding
  negative discount lines while keeping `subtotal`/`total`. `calculatePersonTotals` derives
  shares from the item list alone, so Burger $20 + Burger $20 + Promo −$10 (total $30)
  charged two diners $20 each — **$40 collected on a $30 receipt**.

**Chunk 2 — event archive** (`20bfeb9`, `d813dd2`)

- Owners can archive an event: it leaves the active list and **stops accepting new bills**.
  Viewing, editing existing bills and **settling up are untouched**.
- A recurring template aimed at an archived event pauses and records `pausedReason`. On
  resume the cursor advances to the first occurrence **on or after today** — today's cycle
  still runs, and unarchiving can never mint a year of backdated bills at once.

**Gates** — baseline was 316 unit tests / 36 typecheck errors / 29 lint errors:

|                        | Now                                          |
| ---------------------- | -------------------------------------------- |
| Unit                   | **511 passed / 0 failed**                    |
| Integration            | **142 passed**                               |
| Rules                  | **43 passed**                                |
| Typecheck              | **36 errors** (unchanged — all pre-existing) |
| Lint                   | **29 errors / 42 warnings** (unchanged)      |
| functions + vite build | clean                                        |

## Not yet done

In dependency order:

1. **Manual QA of chunks 1 & 2** — see Resume instructions. Nothing here is browser-verified.
2. **Chunk 3 — free-tier caps.** 5 scans/month, 2 owned active events, enforcement dark
   behind Remote Config. Includes the **server-side** archive check (§ Warnings).
3. **Chunk 4** — RevenueCat subscriptions. **Chunk 5** — Trip Pass consumable.
   **Chunk 6** — paywall + progressive quota UI (spec §4.3.1).
4. **Independent, any time:** push notifications (spec §6.3 — the biggest launch risk, an app
   that cannot re-engage is a one-session app) and analytics (`logEvent` count is currently
   **zero**).
   **Sign in with Apple is DONE** — landed upstream in `c144ad2` along with in-app account
   deletion. It was listed as an outstanding App Store blocker earlier in the session; it is
   not. A `store-submission` compliance-gate skill also arrived with that work.

## The merge with origin/main (2026-09-06)

`main` had diverged 17 behind / 13 ahead. Merged as `0a3b1cb`. The stash → pull → pop
round-trip was clean: your ledger workstream came back at exactly `382/129`, all nine files,
and the `billFunctions.ts` pop auto-merged with upstream without conflict (both
`validateBillAmounts` and `processedBalancesAnchorId` verified present afterwards).

**The one conflict was `functions/src/index.ts`, and it mattered.** Upstream's `5aa1a6f`
deliberately stopped writing receipt contents to Cloud Logging — a separate retention store
that no bill or account deletion reaches, so logging there builds an undeletable spending
profile per user. The scan-hardening work was built on the pre-fix file and would have
reintroduced three of those logs **plus three new ones of its own**. Resolution kept
upstream's privacy posture everywhere and converted every scan diagnostic to shape-only:
lengths, types, field names, and a ratio for the coherence check.

Also kept from this branch, deliberately: `ExtractionError` over `Error` on every extraction
path (a bare `Error` is classified as infrastructure and would never advance the failure
streak), and the amount gate's position **before** the `otherFees` derivation.

## Failed approaches — DO NOT REPEAT

| What was tried                                                                            | Why it failed                          | Root cause                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A credit system** (50 credits/mo, scans + group creation cost credits)                  | Rejected before any code               | A scan costs **$0.0004**. 50 scans = 2¢. The ledger would cost 3–4 orders of magnitude more than it recovers, and it meters the _cheapest_ thing the app does — real cost is engagement (19 Cloud Functions, `ledgerProcessor` on every bill write). Full reasoning: spec §3 |
| **Gating group creation**                                                                 | Rejected in design                     | Groups are the acquisition loop; each pulls 3–8 non-users in via the account-free guest path. Charging for it taxes growth to fund a 2¢ infra bill                                                                                                                           |
| **Running 3 agents concurrently on disjoint file sets**                                   | Corrupted the tree                     | Disjoint _files_ is not sufficient — the git index, stash and `HEAD` are **shared global state**. One agent stashed and briefly reverted 382 lines of unrelated work; two commits swept in other agents' files. **Never run concurrent agents that touch git.**              |
| **Extensionless imports in `functions/src/`** (as originally written in the chunk-1 plan) | Green `tsc`, dead at runtime           | `functions` is `"type": "module"` with `moduleResolution: "bundler"`: it accepts extensionless specifiers and emits them unchanged → `ERR_MODULE_NOT_FOUND` on cold start. **Every relative import under `functions/src/` must end in `.js`**                                |
| **`typeof x === 'number'` as a validation gate**                                          | Let `Infinity` and `NaN` through       | `JSON.parse('{"total":1e400}')` yields `Infinity`; `NaN` also passes `typeof`. A `NaN` streak cleared the limiter's guard and wrote `NaN + 1` back forever → unlimited scans, permanently                                                                                    |
| **Classifying "any non-429 4xx" from Gemini as an image problem**                         | Would have caused a mass false alarm   | Gemini returns **400** for `API_KEY_INVALID`. A bad secret would have told the _entire user base_ "take a clearer photo" during an outage. Now positive-evidence-only: 413/415/422, or a 400 naming the image part                                                           |
| **Server-side `where('archived','==',false)`**                                            | Would have hidden every existing event | Firestore does not match documents **missing** a field. Chunk 2 partitions client-side instead. (A wiped DB + writing `archived:false` at creation removes this constraint — see spec §6.5)                                                                                  |
| **Unconditional fast-forward on unarchive**                                               | Silently dropped a cycle               | Jumping _strictly past_ today meant archiving at 00:15 on rent day and unarchiving that morning lost that month's bill, unrecoverably (deterministic bill id blocks retry). Now: only fast-forward a cursor genuinely behind, landing **on or after** today                  |
| **A test that regex-extracts a predicate from source and `new Function`s it**             | Silently rots                          | Written for `isPersistableAmount` because `index.ts` can't be imported (it initializes firebase-admin at load). Replaced by extracting the predicate to `shared/receiptAmounts.ts` and importing it for real                                                                 |

## Key decisions

- **Caps, not credits.** Reversible: cap → credits harms nobody; credits → cap means
  refunding balances across two app stores.
- **$4.99, above Splitwise's ~$3.** Pricing below an incumbent signals you're the inferior
  copy. The annual tier matters more than the monthly for an episodic product.
- **Trip Pass is deliberately poor value per day** ($0.285 vs Pro's $0.166) so repeat buyers
  self-select into the subscription. Its only job is the once-a-year trip organiser.
- **Archive is a soft lock, not a view filter.** A view-only archive makes the cap
  decorative: archive both events, keep using them, create two more.
- **Failed scans consume the hourly rate limit but must NOT consume the monthly quota**
  (spec). Refunding an hourly slot reopens the abuse bypass; charging one of five monthly
  scans for a scan that returned nothing is indefensible.
- **The 30/hour limit is anti-abuse, not the free tier.** It applies to Pro too. Free users
  hit 5/month long first and will never see it.

## Current state

- **Working:** everything above; all gates green (see table). `main` is in a good state.
- **Broken:** nothing from this work. Pre-existing and untouched: 36 typecheck errors,
  8 of which are `Property 'otherFees' is missing in type ... but required in type 'BillData'`
  — fallout from the _uncommitted_ `shared/calculations.ts` change below. That will fail CI's
  typecheck gate when that workstream lands.
- **Uncommitted, and NOT mine — do not touch, commit, or stash:** 9 modified files
  (`billFunctions.ts`, `ledgerProcessor.ts`, `reconciliation/reconcileLedger.ts`,
  `shared/calculations.ts`, `shared/ledgerCalculations.ts`, `shared/reconcileBalances.ts`,
  `useReceiptAnalyzer.ts`, `tests/billPersonTotals.test.ts`,
  `tests/integration/reconcileLedger.int.test.ts`) at exactly
  **`382 insertions(+), 129 deletions(-)`** — verify this number is unchanged after any git
  operation — plus untracked `shared/billAmountValidation.ts`,
  `tests/billAmountValidation.test.ts`, `tests/integration/nanPoisoning.int.test.ts`.
- **Backup refs** `chunk1-backup`, `chunk1-backup2` can be deleted once the owner is happy.

## Code context

```ts
// shared/scanRateLimit.ts — pure, zero imports
export const SCAN_RATE_LIMIT = 30;
export const SCAN_RATE_WINDOW_MS = 60 * 60 * 1000;
export interface ScanRateState {
  windowStartMs: number;
  count: number;
}
export interface ScanRateDecision {
  allowed: boolean;
  next: ScanRateState;
  retryAfterMs: number;
  effectiveLimit: number;
  effectiveWindowMs: number;
  usedConfigFallback?: boolean;
}
export function evaluateScanRate(
  current: ScanRateState | null | undefined,
  nowMs: number,
  limit?: number,
  windowMs?: number,
): ScanRateDecision;
export function describeWindow(ms: number): string;
export function describeDuration(ms: number): string;

// shared/scanFailureStreak.ts
export const SCAN_FAILURE_STREAK_CAP = 3;
export const SCAN_FAILURE_STREAK_MAX = 5;
export const SCAN_STREAK_DECAY_MS = 24 * 60 * 60 * 1000;
export type ScanOutcome = 'success' | 'extraction-failure' | 'infrastructure-failure';
export function nextFailureStreak(current: number | undefined, outcome: ScanOutcome): number;
export function decayedStreak(
  current: number | undefined,
  lastFailureAtMs: number | undefined,
  nowMs: number,
  decayMs?: number,
): number;
export function shouldSuggestDifferentImage(streak: number, cap?: number): boolean;
export function classifyThrownScanError(error: unknown): ScanOutcome;

// shared/receiptAmounts.ts
export const MAX_RECEIPT_AMOUNT = 1_000_000;
export function isPersistableAmount(value: unknown): value is number; // finite, >= 0, <= max
export function isPersistableItemPrice(value: unknown): value is number; // finite, |v| <= max (negatives OK)
export function itemSumIsCoherent(itemsSum: number, total: number): boolean;

// shared/eventArchive.ts
export interface ArchivableEvent {
  archived?: boolean;
}
export function isEventArchived(event: ArchivableEvent): boolean; // ONLY literal true
export function partitionEvents<T extends ArchivableEvent>(
  events: readonly T[],
): { active: T[]; archived: T[] };

// functions/src/scanRateLimiter.ts  (NOTE: .js on every relative import)
export async function reserveScanSlot(uid: string): Promise<{
  allowed: boolean;
  retryAfterMs: number;
  effectiveLimit: number;
  effectiveWindowMs: number;
}>;
export async function recordScanOutcome(uid: string, outcome: ScanOutcome): Promise<number>;
```

Firestore shapes (both **Admin-SDK-write-only**, owner-read):

```
entitlements/{userId}  plan: 'free'|'pro'|'trip_pass', source, productId,
                       expiresAt, inGracePeriod, updatedAt
usage/{userId}         rateWindowStart: Timestamp, rateCount: number,
                       consecutiveScanFailures: number, lastFailureAt: Timestamp
                       (chunk 3 adds: scanPeriodStart, scansThisPeriod)
```

## Resume instructions

1. `git log --oneline -3` → expect `0a3b1cb` (merge) at HEAD; `git rev-list --left-right --count origin/main...main` → expect `0  14`.
2. `git diff --shortstat` → expect **`9 files changed, 382 insertions(+), 129 deletions(-)`**.
   If this differs, someone touched the other workstream — stop and investigate.
3. `npm test && npm run test:rules && npm run test:integration` → expect **562** unit / 43 rules /
   142 integration, zero failures. (`test:rules` and `test:integration` need Java; they start their own
   emulator. If port 8081 is held: `lsof -ti:9099,8081,4000 | xargs kill -9`.)
4. Read `docs/superpowers/specs/2026-09-06-monetization-design.md` §4.2.1, §4.3.1, §5, §6.5
   → that is the chunk-3 brief.
5. Ask the owner for the manual-QA results below before starting chunk 3.

**Manual QA still outstanding — nothing here is browser-verified:**

- `/bill/:id` — 31 scans in an hour. The 31st must toast _"Too many scans. You can scan up to
  30 receipts per hour. Try again in N minutes."_ with **no** `Failed to analyze receipt:`
  prefix. That prefix is the likeliest remaining defect.
- `/join/:shareCode` — guest flow in a private window with devtools open: **no UIDs or
  participant arrays**. Repeat under `npm run dev` and confirm they _do_ appear.
- `/events/:eventId` on an archived event with bills — **settle up must work and look
  unchanged.** This is the hard rule; if it's blocked, stop.
- Mobile nav `+` on an archived event → options briefly disabled ("Checking event…"), then any
  option creates a **private** bill. On an _active_ event, tapping instantly must still attach.

## Warnings

- **Pushing `main` auto-deploys** Cloud Functions, Firestore rules and Storage rules to
  **PROD** (`deploy-backend.yml` path filter), and always uploads a draft AAB to Play.
  Nothing has been pushed. Do not push without explicit instruction.
- **The archive lock is NOT enforced server-side.** Nothing rejects a bill written with an
  archived `eventId`. Bill creation runs through `functions/src/billFunctions.ts`, which is
  part of the untouchable workstream above. **Chunk 3 must add this** or the cap is
  bypassable.
- **Remote Config needs magnitude bounds, not just type checks.** Measured: `windowMs: 3600`
  (the seconds-for-milliseconds typo) allowed **3600 scans against a 30/hour limit**, passing
  every `> 0` validation, with nothing logged. Recommended clamps in spec §5.2.
- **`shared/billAmountValidation.ts` (uncommitted, not mine) overlaps
  `shared/receiptAmounts.ts` (committed, mine).** Deliberately duplicated rather than coupled
  to uncommitted code. Consolidate once that workstream lands.
- **The recurring-bill archive guard is unreachable today** — no wizard sets `eventId` on a
  template. Kept as a safe default. If a wizard ever starts setting it, an archive-time
  confirmation and `pausedReason` UI must land with it (spec).
- **`pausedReason` has no UI reader**, so a system-paused template still renders as Active.
- **No UI is automatically tested.** Vitest runs `environment: 'node'` with no jsdom, and this
  project's rules forbid driving a browser for verification.
- Commit messages in this repo **must not** contain `Co-Authored-By` or any Claude/Anthropic
  reference (repo `CLAUDE.md` + owner instruction).
