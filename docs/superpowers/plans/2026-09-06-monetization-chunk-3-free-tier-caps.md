# Chunk 3 — free-tier caps (server-side enforcement)

**Status:** COMPLETE — implemented, reviewed, all gates green. NOT committed, NOT pushed.
**Spec:** `docs/superpowers/specs/2026-09-06-monetization-design.md` §4.2, §4.2.1, §5.1, §5.2, §5.4, §6.5
**Predecessor:** chunk 1 (security prerequisites), chunk 2 (event archive)

## Scope

Enforcement only. **No paywall or quota UI** — that is chunk 6 (spec §4.3.1). The only
client changes here are the plumbing required to make enforcement authoritative.

Three gates, all server-side, all dark behind Remote Config `paywall_enabled`:

1. **No new bills in an archived event** — the debt chunk 2 explicitly left open.
2. **5 AI scans per month** on free, checked before Gemini, incremented on success only.
3. **2 owned active groups** on free, gating create and unarchive.

## Design decisions

### D1 — Group cap needs new callables, because rules cannot count

Events are created client-side (`useEventManager.createEvent` → `addDoc`) and unarchived
client-side (`eventArchiveService.unarchiveEventDoc` → `updateDoc`). Firestore rules cannot
run an aggregation query, so the cap cannot be expressed as a rule. Enforcement therefore
moves to callables (`createEvent`, `unarchiveEvent`), mirroring how `createBill` already
works, and rules are tightened to close the direct paths.

**Archiving stays a direct client write and stays always-allowed.** It frees a slot, it is
the free escape hatch the wall must offer (§4.3.1), and blocking it can never be correct.
Only *un*archiving is gated, because archive → create → unarchive is the three-tap bypass.

### D2 — Count by subtraction, not `archived == false`

`count(ownerId == uid)` − `count(ownerId == uid AND archived == true)`.

A naive `where('archived','==',false)` does not match documents missing the field, so it
under-counts and lets a user exceed the cap. Spec §6.5 argues the equality query becomes
safe once the database is wiped and `archived: false` is written at creation — but "the
database will be wiped" is a future event, and a count that is wrong for one release is a
cap that does not exist. Subtraction is correct under both regimes for two cheap aggregation
reads. `shared/eventArchive.ts` already carries this warning in its header.

We _also_ write `archived: false` at creation (§6.5), so the data is clean either way.

### D3 — No stored group counter

Spec §4.2.1 is explicit: query, do not store. This repo already built a nightly reconciler
(`scheduledLedgerReconcile`) because derived state drifted. A group counter is the same bug.

### D4 — Quota and rate limit are different mechanisms and must not be merged

|            | Hourly rate limit (chunk 1)           | Monthly scan quota (chunk 3)                |
| ---------- | ------------------------------------- | ------------------------------------------- |
| Purpose    | anti-abuse, applies to **every** plan | the free-tier business cap                  |
| Reserved   | **before** Gemini                     | checked before, **committed after success** |
| On failure | **consumed** (bypass closure)         | **not consumed** (§4.3.1)                   |

These live in the same `usage/{userId}` document but in disjoint fields and separate
functions. Merging them would force one of the two failure semantics onto the other.

### D5 — Dark launch means "evaluate and log, do not block"

`paywall_enabled = false` (the default, and the value at launch of this chunk) runs every
gate, logs what it _would_ have done, and allows the action. This exercises the code path in
production before it can hurt anyone, and makes the switch a config change rather than a
release. Enforcement failures **fail open** for the quota/group gates — a broken Remote
Config fetch must not lock users out of their own data. The archive gate is the exception:
it fails closed, because it is a correctness rule, not a business cap.

### D6 — Bound Remote Config by magnitude, not just type

`getNumber()` returns **0** for an unpublished or misspelled key. Chunk 1 measured a worse
case: `windowMs: 3600` (seconds-for-milliseconds) passed every `> 0` check and allowed 3600
scans against a 30/hour limit, silently. Every value is clamped to a plausible range and a
clamp is logged.

## Tasks

- [x] T1 `shared/entitlements.ts` — `resolveEffectivePlan` (pro > trip_pass > free, server clock, absent doc = free)
- [x] T2 `shared/scanQuota.ts` — UTC month boundary, `evaluateScanQuota`
- [x] T3 `shared/monetizationLimits.ts` — defaults + magnitude clamps
- [x] T4 Unit tests for T1–T3 (pure, `tests/`)
- [x] T5 `functions/src/remoteConfigLimits.ts` — fetch, clamp, cache, warn-once
- [x] T6 `functions/src/entitlementService.ts` — read `entitlements/{uid}`
- [x] T7 `functions/src/scanQuotaLimiter.ts` — check + commit-on-success
- [x] T8 `functions/src/eventFunctions.ts` — `createEvent` / `unarchiveEvent` callables + owned-active count
- [x] T9 Archive gate in `createBill` (**failing integration test first**)
- [x] T10 Wire quota into `analyzeBill`
- [x] T11 `firestore.rules` — deny client event create; deny client unarchive (**failing rules test first**)
- [x] T12 `firestore.indexes.json` — `(ownerId, archived)` composite
- [x] T13 Client migration: `useEventManager`, `eventArchiveService`, `EventsView`
- [x] T14 Integration tests: quota rollover, failure does not consume, cap blocks create + unarchive
- [x] T15 Full gates + adversarial review

## Risks

- **R1 — Tightening `events` create breaks already-installed clients.** Any TestFlight build
  that predates the callable will fail to create events the moment the rules deploy. The app
  is pre-launch and the database is being wiped, so this is acceptable, but it is a
  deploy-ordering constraint: functions must deploy before (or with) rules, and old builds
  must be considered dead. **Flag to the owner before pushing.**
- **R2 — `billFunctions.ts` carries another workstream's uncommitted changes.** The archive
  gate lands in `createBill` (~:285), far from their hunks in `createBillCore` (:80, :184),
  so there is no textual conflict — but committing chunk 3 must stage this file by hunk, not
  wholesale.

## Gate results (2026-09-06)

Baseline for comparison, measured on this tree before any chunk-3 work:
562 unit / 43 rules / 189 integration / 36 typecheck errors / 29 lint errors.

| Gate | Baseline | After chunk 3 |
| --- | --- | --- |
| Unit | 562 | **621** (+59) |
| Rules | 43 | **63** (+20) |
| Integration | 189 | **218** (+29) |
| Typecheck | 36 errors | **36** (unchanged, all pre-existing) |
| Lint | 29 err / 42 warn | **29 / 42** (unchanged) |
| functions tsc | clean | clean |
| vite build | clean | clean |

Every new gate was written to FAIL first and observed failing:
- `archivedEventBillGate.int.test.ts` — 4 failed / 4 passed before the gate landed.
- `archivedEventBills.rules.test.ts` — the 2 BLOCKS failed, all 6 ALLOWS passed.
- `eventCreateUnarchive.rules.test.ts` — all 5 BLOCKS failed, all 7 "still works" passed.

## Deviations from the plan

- **T9 needed a policy parameter, not just a check.** Putting the archive gate in
  `createBillCore` broke two chunk-2 tests that assert `recurringBillProcessor`
  fails OPEN on a missing event or a failed read — deliberate, because an
  unattended rent split that vanishes silently is worse than one that generates
  into a stale event. The core is fail-CLOSED for the client path; the recurring
  caller passes `eventArchiveAlreadyChecked: true` because it has already applied
  its own policy. Both semantics are now explicit and tested.
- **One chunk-2 rules test was inverted on purpose.**
  `events.rules.test.ts > ALLOWS the owner un-archiving` became `BLOCKS ...`.
  Chunk 2 was right that a direct unarchive was fine when nothing counted active
  events; chunk 3 makes it a cap bypass. The test now documents the change.
- **`decideGroupCap` was extracted as a pure function** so the dark-launch switch
  is directly testable rather than provable only by inspection.

## Adversarial review outcome

Verdict: NEEDS WORK, **no critical findings**. No settle/pay-back path is gated
(the reviewer proved this with its own rules probe: a member can still write
`settledPersonIds` on a bill inside an archived event). Everything below is fixed.

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | **Quota defeated by concurrency.** N parallel scans all read `used = 0` and all wrote `1`, making the real free tier the abuse limiter's 30/hour. | Steady state now `FieldValue.increment(1)` (still non-aborting, so it never contends with `reserveScanSlot`'s fail-closed transaction). Rollover needs a real read — the reviewer's proposed fix missed that `periodRolled` is true for EVERY racer on the first scan of a month — so it takes the file's one transaction, at most once per user per month. |
| 2 | **Create-then-move bypass.** `allow update` let the owner repoint `eventId` into an archived event in a second write. | New `isMovingIntoArchivedEvent()` applied to the whole bills update rule. Keyed on `eventId` CHANGING, so settling a bill already in an archived event is untouched. |
| 3 | **`allow create: if false` strands installed builds.** | **Owner decision: hard cutover.** Recorded in firestore.rules. |
| 4 | `EventDetailView` unarchive swallowed the cap message. | Wired to `messageForCallableError`, same as `EventsView`. |
| 5 | No negative cache — a broken Remote Config costs an RPC per scan forever. | 30s failure backoff with an explicit `isFallback` flag. (First attempt was wrong: one timestamp for both TTLs meant it resumed hammering after the first backoff lapsed.) |
| 6 | A degraded read could overwrite a real count with 1. | `commitScanQuotaUsage` skips a degraded decision. |
| 7 | Group-cap TOCTOU. | Documented as accepted, with reasoning: closing it needs the stored counter §4.2.1 forbids, or a transaction over a query Firestore doesn't offer. Bounded by deliberate user actions, unlike the scan race. |
| — | Sequential awaits; ISO date in copy; unbounded `memberIds`. | `Promise.all`; prose date; bounded at 100. |

Also removed: the pure `commitScanQuota` helper, which was dead after fix #1 and
wrong in a way a pure function cannot fix. `shared/scanQuota.ts` carries a note
saying why there deliberately isn't one.

### Latent, not fixed (no caller today)

`isUnarchiving()` also denies an owner writing a first-time explicit
`archived: false` onto a legacy no-field event. Nothing in `src/` does this —
`unarchiveEventDoc` is a callable now — but a future client-side backfill of
`archived: false` would be denied and would look like a permissions bug.

## Final gates

| Gate | Baseline | Final |
| --- | --- | --- |
| Unit | 562 | **617** |
| Rules | 43 | **68** |
| Integration | 189 | **227** |
| Typecheck | 36 errors | **36** (unchanged) |
| Lint | 29 err / 42 warn | **29 / 42** (unchanged) |
| functions tsc / vite build | clean | clean |

Unit is 617 rather than 621 because the four `commitScanQuota` tests went with
the helper they covered.

## Verified on beta + iOS device (2026-09-07)

Deployed to **beta** (`divit-beta`) and driven through the real iOS app on an
iPhone 17 Pro simulator with Maestro. Prod untouched throughout.

**Deployed:** firestore rules (released), `createEvent` + `unarchiveEvent` (created),
`createBill`, `analyzeBill`, `ledgerProcessor`, `processSettlement`,
`processEventSettlement` (updated).

### The headline result — an A/B on real infrastructure

Fixture: 2 active owned events (one of them `Tahoe Weekend`, which has **no
`archived` field at all** — the legacy shape) + 1 archived, with
`free_active_groups = 2`. Unarchiving the archived one must be refused.

| | Server RC template | Function log | Outcome |
| --- | --- | --- | --- |
| 08:06 | **missing** | `group cap would block (enforcement dark)`, `activeCount: 2, limit: 2` | unarchive **succeeded** |
| 08:10 | **published** | HTTP **429** (`resource-exhausted`) | unarchive **blocked** |

Same request, same data, same code — the only variable was the Remote Config
template. That is both the dark-launch behaviour and the enforcement proven in
one pass, on real Cloud Functions against real Firestore.

### ⚠️ SHIPPING BLOCKER FOUND: the server template is a different template

`getServerTemplate()` reads the **`firebase-server`** namespace. The Firebase
console's Remote Config page shows the **client** template by default, and the
`firebase remoteconfig:*` CLI commands and the Admin SDK's `publishTemplate`
target the client namespace too. Publishing `paywall_enabled` the obvious way
reaches none of this code.

The failure mode is safe but silent: the fetch 404s, the limits fall back to
defaults, `paywallEnabled` is therefore `false`, and every cap computes
`wouldBlock` correctly and then permits the action. One `logger.warn` per
instance is the only evidence. **The caps would simply never turn on.**

To publish: Remote Config → **Client/Server selector → Server** → publish.
Documented at `functions/src/remoteConfigLimits.ts`.

### Also settled empirically

- **The `events (ownerId, archived)` composite index is NOT required.** It was
  never deployed to beta (the index deploy failed on a pre-existing
  `event_balances` conflict), and the count still returned `activeCount: 2`.
  Firestore served the equality-only aggregation by merging single-field
  indexes, exactly as the reviewer predicted. The index is kept as harmless
  insurance; the count fails open if it were ever needed and missing.
- **Legacy events with no `archived` field count as ACTIVE** against the cap, on
  real data — the trap `shared/eventArchive.ts` exists to prevent.
- **Auth is enforced**: both new callables reject unauthenticated calls with
  `User must be authenticated`.

### Beta-only residue (not prod)

- `paywall_enabled = true` in beta's **server** template — beta now enforces
  while prod ships dark. Flip to `false` if you want beta to mirror prod.
- `APPLE_SIGNIN_PRIVATE_KEY` is a **placeholder** on beta (the real key is not
  in this session). `deleteAccount` and Apple token revocation will not work on
  beta until it is replaced; neither was deployed.
- Test fixtures `capTestActiveB` / `capTestArchivedC` were deleted.

### Not verified

Scan quota (5/month) end-to-end — it needs real Gemini calls and a month
boundary. Covered by unit + integration tests only.
