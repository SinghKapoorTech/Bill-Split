# Free/paid tier launch — Phase 2 (client state) shipped

**Status:** MILESTONE — Phase 2 complete, tree CLEAN, all gates green, **PUSHED to `main`**, CI green
**Workspace:** /Users/simran/Documents/GitHub/Bill-Split
**Updated:** 2026-09-10

Plan: `docs/superpowers/plans/2026-09-09-free-and-paid-tier-launch.md`
Previous handoff: `docs/handoffs/phase1-complete-and-mac-setup-0909.md`

---

## Goal

Ship a Free tier (2 AI scans/month, 2 active owned groups, both visibly
disclosed) and a purchasable Pro tier on iOS + Android. Phase 1 built the server
contract; **Phase 2 (this session) built the client state that renders it**.
Phase 3 is the first phase that puts anything on screen.

---

## Done

Two commits, `6c3c527..67f5091`:

| Commit    | What                                                           |
| --------- | -------------------------------------------------------------- |
| `6c3c527` | Phase 2 client state — 5 hooks, 2 pure utils, 9 test files     |
| `67f5091` | CI fix — a test that needed a real Firebase key (see Warnings) |

**New files (all read-only, ZERO consumers until Phase 3):**

```
src/utils/quotaDisclosure.ts          scanDisclosure() / groupDisclosure() — pure ladder
src/utils/capError.ts                 capDetailsFromError(err) — reads .details off a callable
src/services/monetizationConfigService.ts   client Remote Config, 5min TTL, 30s failure backoff
src/hooks/useMonetizationConfig.ts    the config as React state + revalidation
src/hooks/useEntitlement.ts           entitlements/{uid} → resolveEffectivePlan
src/hooks/useScanQuota.ts             usage/{uid} → evaluateScanQuota
src/hooks/useGroupCap.ts              owned-active-event count → groupDisclosure
src/hooks/useScanDisclosure.ts        THE COMPOSITION PHASE 3 SHOULD CONSUME
```

**Modified (the only live behaviour change in the whole phase):**

- `src/services/gemini.ts` + `src/utils/analyzeBillError.ts` — `analyzeBill`
  rejections used to be rewrapped as `new Error(mapAnalyzeBillError(error))`,
  which DISCARDED `.details`. `capDetailsFromError` therefore returned `null`
  for 100% of real scan-quota rejections and Phase 3 Task 3.1 was unbuildable.
  Now throws `AnalyzeBillError`, which carries the payload. User-facing message
  is byte-identical (pinned by a test).

**Prod Remote Config drift CLOSED.** `free_scans_per_month` was 5 live / 2 in
repo since `f5824eb`. Published with `npm run rc:publish -- prod`; verified by
reading both live templates back:

```
prod/firebase         paywall_enabled=false  free_scans_per_month=2  free_active_groups=2
prod/firebase-server  paywall_enabled=false  free_scans_per_month=2  free_active_groups=2
```

Enforcement is still DARK. No user is capped. Repo and live config now agree.

### Gates at time of push (all verified WITHOUT `.env` — see Warnings)

```
npm test                     954 passed / 55 files   (baseline was 779/47)
typecheck                    36 errors  (CI ratchet, ZERO headroom — do not exceed)
lint                         71         (baseline held)
npm run build                exit 0
npm --prefix functions build exit 0
CI on 67f5091                success (checks + e2e)
Android Internal Testing     success (draft AAB to Play)
Deploy Backend               DID NOT RUN — paths did not match (correct)
```

---

## Not yet done

Phase 3 — free-tier UI. Tasks 3.1–3.4 in the plan, in order:

1. **3.1** Scan quota chip + pre-action wall (`ReceiptUploader`, `StepHeader:57` re-scan)
2. **3.2** Group cap indicator + wall (`EventDetailView:423` unarchive, create dialog)
3. **3.3** Settings → Plan card
4. **3.4** Paywall screen (static; Phase 4 replaces prices with real `Offerings`)
5. Opus adversarial review of 3.1 + 3.2 gating only — can a capped free user
   reach the camera or the create dialog by any other route?
6. **Phase 3 exit: OWNER manual QA on BETA** (`npm run dev:beta`, beta
   `paywall_enabled=true`). Beta already sits at the correct `free_scans_per_month: 2`.

Still the calendar long pole, unchanged: Apple **Paid Applications agreement +
tax + banking**, and the Play **payments profile**. Phase 4 onward is dead until
both read Active. RevenueCat project `projaca9e24b` is still at zero (1 Test
Store app, 0 products, 0 entitlements, 0 offerings, 0 webhooks).

---

## Failed approaches — DO NOT REPEAT

| What was tried                                                           | Why it failed                                                                                                                                                               | Root cause                                                                                                                            |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `vi.mock(mod, async (importOriginal) => ({...actual, fn: mockFn}))`      | Green locally, **red on `main`**. `FirebaseError: Firebase: Error (auth/invalid-api-key)` at `src/config/firebase.ts:28:5`                                                  | `importOriginal()` loads the REAL module → imports `@/config/firebase` → `getAuth(app)` at module load. Needs `.env`, which CI lacks. |
| Open-coding `activeCount >= limit` in `useGroupCap`                      | Lost the `paywall_enabled` term. With the switch DARK (prod's current state) a free user at 2 groups got a dead Create button with NO copy, for an action the server allows | Re-deriving a decision the shared pure evaluator already owns. Every time a mute was added, the hand-rolled copy lost it.             |
| `useState(user === undefined)` as the `loading` initializer              | Inert AND backwards. `false` for an already-signed-in user → first committed render was `{free, unlimited:false, loading:false}` — the exact wall-flash it claimed to stop  | Both `true` and `false` passed every test: RTL flushes effects inside `act()`, so the first render is invisible to normal assertions  |
| Inferring "did this fall back?" by `value === MONETIZATION_FALLBACK`     | A rejected `fetchAndActivate` on a fresh client reads `defaultConfig` and returns an object EQUAL but not IDENTICAL → cached as a good read for 5 min instead of 30s        | Identity comparison cannot see a structurally-identical object built by the success path. Needs an explicit `degraded` flag.          |
| Mount-only fetch in `useMonetizationConfig` (no revalidation)            | The 5-min TTL is unreachable from a screen that stays mounted — and Phase 3 mounts the wall INSIDE the uploader. A wall could outlive its own kill switch indefinitely      | A cache only expires if someone asks again. Beta QA would miss it: navigating away remounts.                                          |
| Asserting `console.error` was never called after unmount                 | Unfalsifiable. Passed whether or not the guard existed                                                                                                                      | React 18.3 made post-unmount `setState` a silent no-op and removed the warning                                                        |
| `expect(text).toContain('2')` to pin the rendered limit                  | Hardcoding `2` in place of `${limit}` left **24/24 green**                                                                                                                  | `base.limit` was also 2, and `2` appeared nowhere else in the string                                                                  |
| Source-text wiring assertion without stripping comments                  | False PASS on a real regression (regex matched a commented-out line) AND false FAIL on an unrelated `throw new Error('no image')` guard                                     | Whole-file regex over raw source. Must strip comments and scope to the catch block.                                                   |
| Settling `useEntitlement` to `{free, loading:false}` on a listener error | `onSnapshot`'s error callback is TERMINAL and the effect only re-runs on `[uid, user]`, so it is durable — a paying subscriber pinned behind a wall all session             | Permission-denied token-propagation race. Muting beats asserting.                                                                     |

---

## Key decisions

- **`loading` is a MUTE signal, not a spinner signal, and is NOT guaranteed to
  settle.** `useEntitlement` stays loading forever after a terminal listener
  error — deliberately. Phase 3 must render **nothing** while it is true, never
  a skeleton, or a permission-denied yields an infinite spinner. Documented on
  the field itself in `useScanDisclosure`.
- **Failure direction is OPEN/DARK everywhere.** Config outage → paywall dark;
  unusable quota data → fresh period; entitlement unknown → free; malformed cap
  payload → prose fallback. The server is the real gate and will refuse a scan
  the client wrongly permitted; a client that walls a user the server would have
  served is unrecoverable from the user's side.
- **Every decision delegates to the shared pure evaluator.** Never re-derive.
  This is what makes the plan's "client renders from the same evaluators the
  server enforces with" literally true instead of approximately.
- **Service TTL is 5 min, not "memoised per app session"** (a deliberate
  deviation from the plan's wording) — matched to the server's `CACHE_TTL_MS` so
  a kill-switch flip reaches clients within the window step 8.5 assumes.
- **`'silent'` stays in `DisclosureLevel`** though no input returns it at a
  limit of 2. It is the spec's vocabulary and Phase 3 switches over these levels.
- **Three tests were DELETED for being unfalsifiable** rather than kept for the
  count, and two guards are documented as deliberately uncovered (the unmount
  guard; the month-boundary race). Do not "restore coverage" for these — read
  the comments first.

---

## Current state

- **Working:** everything. Tree clean, `main` == `origin/main` at `67f5091`,
  CI green, Android build green.
- **Broken:** nothing.
- **Uncommitted:** nothing.

---

## Code context

```ts
// src/hooks/useScanDisclosure.ts — WHAT PHASE 3 SHOULD CONSUME for scans
export interface ScanDisclosureState extends ScanDisclosure {
  used: number;
  remaining: number;
  limit: number;
  resetsAtMs: number;
  unlimited: boolean;
  loading: boolean; // ⚠️ MUTE signal. Not guaranteed to settle. Render NOTHING, not a spinner.
}
export function useScanDisclosure(): ScanDisclosureState;

// src/utils/quotaDisclosure.ts
export type DisclosureLevel = 'hidden' | 'silent' | 'ambient' | 'last' | 'wall';
export interface ScanDisclosure {
  level: DisclosureLevel;
  text: string;
}

// src/hooks/useGroupCap.ts — self-composing; already consumes useEntitlement + config
export interface CappableEvent extends ArchivableEvent {
  ownerId?: string;
}
export interface GroupCapSnapshot {
  activeCount: number;
  limit: number;
  atCap: boolean; // honours loading + unlimited + paywallEnabled
  text: string; // '' when nothing should be shown
  unlimited: boolean;
  loading: boolean;
}
export function useGroupCap(
  events: readonly CappableEvent[] | null | undefined,
  eventsLoading?: boolean,
): GroupCapSnapshot;

// src/hooks/useEntitlement.ts
export interface EntitlementSnapshot {
  plan: 'free' | 'pro' | 'trip_pass';
  unlimited: boolean;
  expiresAt?: number; // expiry of the plan IN FORCE, not the raw doc field
  loading: boolean;
}

// src/utils/capError.ts — for the server-race fallback
export function capDetailsFromError(err: unknown): CapErrorDetails | null;
// then narrow with isPaywallTrigger from @shared/capErrors — do NOT treat
// non-null as "show the paywall": the hourly rate limiter is a valid
// CapErrorDetails and is emphatically NOT a paywall trigger.
```

---

## Resume instructions

1. `git log --oneline -3` → expect `67f5091` on top, tree clean, `main` in sync.
2. `npm test` → expect **954 passed / 55 files**.
   `npm run --silent typecheck 2>&1 | grep -c 'error TS'` → expect **36**.
3. Read the plan's **Phase 3** section (~line 293-340). All copy there is final
   unless the owner edits it.
4. Start **Task 3.1** (scan quota chip + wall). Consume `useScanDisclosure()`,
   NOT `useScanQuota()` directly — see Warnings.
5. After each task: `npm test`, typecheck ≤ 36, lint ≤ 71, build 0. Commit per task.
6. Phase 3 exit is **OWNER manual QA on beta** — `npm run dev:beta`, with beta's
   `paywall_enabled` flipped to `true` first.

---

## Warnings

- **RUN THE SUITE WITHOUT `.env` BEFORE CLAIMING GREEN.**
  `mv .env .env.bak && npm test; mv .env.bak .env`.
  A populated `.env` made a broken test pass three times this session and put a
  red gate on `main`. Full write-up: `~/.claude/memory/vitest-importOriginal-firebase-env.md`.
  Never use `vi.mock` with `importOriginal` on any module that transitively
  imports `@/config/firebase`.
- **Consume `useScanDisclosure`, not `useScanQuota`, for anything user-facing.**
  The obvious composition is wrong: the only `loading` next to `remaining` is the
  quota's, which knows nothing about `entitlements/{uid}`. For a NEW SUBSCRIBER —
  `usage/{uid}` still reads 2-of-2 because buying Pro does not reset the counter,
  while the entitlement snapshot is in flight — that renders a wall in front of
  someone who just paid, for a network round trip.
- **`paywall_enabled` is FALSE in prod.** Nothing enforces. To QA the UI, flip
  **beta** only: `npm run rc:publish -- beta` after editing
  `config/remote-config/beta.json`. The script refuses to switch prod ON without
  `I_MEAN_IT=1`.
- **`usage/{uid}` is SHARED with the hourly rate limiter** in disjoint fields.
  Quota = `scanPeriodStart` / `scansThisPeriod`. Limiter = `scanWindowStart` /
  `scansThisWindow`. Mixing them shows a Pro subscriber a free-tier wall.
- **Typecheck has ZERO headroom** at the 36-error ratchet. One new error fails CI.
- **Beta still diverges from prod:** Email/Password sign-in is enabled on beta
  only (revert command in `phase1-complete-and-mac-setup-0909.md` §3).
- **Open, not done:** `src/services/minimumVersionService.ts` sets
  `minimumFetchIntervalMillis = 1 hour` unconditionally on the SHARED
  `getRemoteConfig(app)` singleton. `monetizationConfigService` defends its side
  (merges defaults, only ever tightens the interval) but a later writer can still
  loosen it. One-line fix, never made.
- **Flip-day policy still undecided** (carried from the last handoff §4.3): while
  enforcement is dark the server still commits `scansThisPeriod`, so counts climb
  past the cap. Decide before Phase 8 — flip on a UTC month boundary, or zero
  `scansThisPeriod` as part of enabling enforcement.
