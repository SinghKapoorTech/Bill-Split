# Divit — CI e2e: root cause found and fixed (popup auth depended on the public internet)

**Status:** IN PROGRESS — fix implemented and verified LOCALLY, **not committed, not pushed**
**Workspace:** `/Users/simran/Documents/GitHub/Bill-Split`
**Branch:** `main` — HEAD `6042c25`, **0 ahead / 0 behind** `origin/main`
**Updated:** 2026-09-08
**Predecessor:** `docs/handoffs/people-race-0907-part3.md` — still accurate for the
people-race detail; all of that work is pushed.

---

## Goal

Make CI's e2e job produce a trustworthy signal. Previous session took it from
**16 failures → 1**. This session found the actual root cause of the remaining
failure _and_ of the 5 "flaky" specs — they were the same bug.

---

## What was wrong (both proven from artifacts, not hypothesised)

### 1. The e2e login depended on the public internet

Firebase's `signInWithPopup` uses `browserPopupRedirectResolver`, which loads
gapi from **`https://apis.google.com/js/api.js`** to build the iframe channel
that carries the popup result back to the app — **even against the Auth
emulator**. That put the public internet on the critical path of every test.

Correlation across all six traces captured in run `34180371036`, perfect 6/6:

| trace                  | `apis.google.com/js/api.js` | `accounts:signInWithIdp` |
| ---------------------- | --------------------------- | ------------------------ |
| create-options (d1a46) | 200, 200                    | 1 ✅                     |
| create-options (e2d84) | 200, 200                    | 1 ✅                     |
| dashboard-bills        | 200, 200                    | 1 ✅                     |
| events (detail)        | 200, **−1**                 | **0** ❌                 |
| events (icon button)   | 200, **−1**                 | **0** ❌                 |
| recurring-bill         | 200, **−1**                 | **0** ❌                 |

`−1` is `net::ERR_ABORTED`. When it aborted, the credential never reached the
app, there was no session, and the next `page.goto(...)` landed on the marketing
page — which is why every failure snapshot is the landing page with a **"Sign
In"** button on it.

**The handoff's previous hypothesis — "15s is too short for `Your Events`" — was
WRONG.** The page was never slow. It was logged out. Do not raise that timeout.

### 2. `waitForAuthPersisted` (commit `3090a91`) verified NOTHING

`page.waitForFunction` **does not await a returned promise**, so an async
predicate resolves on the first poll because a `Promise` OBJECT is truthy.
Measured directly:

```
polling:100 + Promise<false>     -> RESOLVED (vacuous!) after 26ms
default polling + Promise<false> -> RESOLVED (vacuous!) after 1ms
polling:100 + plain false        -> timed out (correct) after 3017ms
```

So the helper reported "auth persisted" in runs where **no user had ever been
created**. Combined with its `catch { page.goto('/dashboard') }` fallback, a hard
auth failure was converted into a confusing assertion failure ~15s later in
whatever spec was running. CI improving 3 → 1 was the onboarding fix plus luck.

---

## The fix (uncommitted)

`e2e/helpers/auth.ts` — rewritten:

- `loginAsTestUser` now creates a **fresh email/password account per test**
  through the real UI at `/auth` (`EmailPasswordForm.tsx`). No popup, no gapi,
  no `apis.google.com` — a plain REST call to the Auth emulator.
  Confirmed `signInWithPopup` (`AuthContext.tsx:178`) is the ONLY gapi trigger.
- **No try/catch fallback.** If sign-up breaks it must fail _there_, loudly.
- `waitForAuthPersisted` rewritten on `expect.poll(() => page.evaluate(...))` —
  `page.evaluate` DOES await promises. **Proven it can fail** (rejects after its
  timeout on a page with no session; the old one "passed" in 26ms).

`e2e/global-setup.ts` — the warm-up drove the Google popup too (non-fatal, but
it kept the gapi dependency in the run). Now warms up via `loginAsTestUser`;
`completeEmulatorPopup` deleted.

**Per-test account, not one shared account** — deliberate. Emulators live for the
whole run, and several specs assert first-run empty state (`events.spec.ts`
expects "No events yet"; `dashboard-bills` expects the onboarding dialog). A
shared login would accumulate state across specs. This preserves exactly the
isolation the old auto-generated emulator user gave us.

No CI workflow change needed — email/password works against the emulator with
any API key.

---

## Evidence

Final state, all re-run together after the review fixes landed:

| Gate                                         | Result                                              |
| -------------------------------------------- | --------------------------------------------------- |
| `npm test`                                   | **702 passed / 44 files**                           |
| `npm run typecheck`                          | **36** errors (= CI ratchet, unchanged)             |
| `npm run lint`                               | **71 problems** (29 errors, 42 warnings) = baseline |
| e2e full suite `--repeat-each=3 --retries=0` | **57 passed / 0 failed / 0 skipped — 5.1m**         |
| formerly-quarantined 3, `--repeat-each=12`   | **48 passed / 0 failed — 11.5m**                    |

Before: **1 failed, 5 flaky, 3 skipped, 10 passed — 10.9 min** in CI.
Now: 19 tests × 3, retries OFF, nothing skipped, zero failures — at 1-min load
8-11, i.e. adverse conditions. (A PASS under load is strong evidence; a FAILURE
under load would have been ambiguous.)

`npm run build` not run: no `src/` file was touched (test harness only).

Verification-of-the-verification, both measured, not assumed:

- old `waitForAuthPersisted` on a logged-out page → **truthy in 26ms** (vacuous).
- new one → **rejects at ~1940ms** with `Firebase never flushed the signed-in
session to IndexedDB`, and a navigation racing the poll no longer dies with
  `Execution context was destroyed`.

**Not verified in CI yet** — that needs a push to `main`.

---

## Also done this session: all 3 quarantines LIFTED

`e2e/bill-wizard.spec.ts`, `e2e/bill-settlement.spec.ts` and
`e2e/settle-bill.spec.ts` were `test.fixme`-quarantined. They were collateral
damage from the SAME auth bug — the failures were downstream of a logged-out
page, not in the settle step the previous sessions were chasing.

`test.fixme` → `test` on all three. Evidence: **12/12 passes each** at
`--repeat-each=12 --retries=0`, at 1-min load 4-10. The predecessor measured a
~25% failure rate for these, so 12 clean passes is a ~3% fluke — a real fix.

Their long investigation banners are KEPT (they are a valuable record) with a
`RESOLVED` note prepended so they cannot be misread as current state.

**This is the one scope expansion of the session — reversible in one command**
(`sed -i '' 's/^\( *\)test(/\1test.fixme(/' ...`) if it should ship separately.

---

## Not yet done — in priority order

1. **Push and confirm CI goes green.** Not done; needs explicit go-ahead.
   Pushing `main` uploads a **draft** AAB to Play and probably deploys Vercel;
   no backend deploy (nothing matches `deploy-backend.yml`'s path filter).
2. **Give e2e its own concurrency group.** `ci.yml` uses
   `concurrency: ci-${{ github.ref }}, cancel-in-progress: true`, and e2e is the
   longest job so it is always the casualty. Much less pressing now the suite is
   ~40s instead of ~11 min.
3. **Adversarial review findings already APPLIED** (do not redo): unique test
   name (username-probe rot), `.catch(() => false)` on the poll generator
   (`expect.poll` does not retry a REJECTING generator — only a falsy one),
   login timeout 30s → 20s, and a factually wrong comment about the Apple
   button. Two review notes deliberately NOT actioned: `e2e/helpers/event.ts:29`
   `addMemberByUsername` filters by display name (unused by any spec, and the
   unique-name fix removes the hazard), and `VerifyEmailBanner` now renders on
   every e2e dashboard because these accounts are unverified (cosmetic; nothing
   asserts against it).
4. **Cross-bill mis-flush in `usePeopleAdditionQueue`** (predecessor #3).
   Destructive: can write a draft's `people` array over a different bill.
5. **`/transaction/:billId` evicts a joined guest**, **`/shared/:sessionId`**,
   `useBillSession.ts:132`, and the two stale-closure removal handlers —
   predecessor #4-#8. Found by a codebase-wide sweep, not yet fixed.
6. `e2e/login.spec.ts` still exercises the Google popup, but only checks that the
   popup opens and never completes sign-in, so it does not need the gapi result
   channel. It has a `.catch(() => null)` swallow (line 34) — suspect by this
   repo's standards, but currently harmless.

---

## Failed approaches — DO NOT REPEAT

| What was tried                                                             | Why it failed                                                       | Root cause                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Assuming `Your Events` needed a longer timeout**                         | The element was never going to appear                               | The page was LOGGED OUT, not slow. Reading the failure snapshot (landing page + "Sign In") took seconds and killed the hypothesis. **Read the artifact before changing a timeout.**                                                                                                            |
| **`page.waitForFunction` with an async predicate**                         | Vacuous — passes on the first poll, always                          | It does not await promises; a Promise object is truthy. Use `expect.poll(() => page.evaluate(...))`. **Prove a new check CAN fail before trusting that it passed.**                                                                                                                            |
| **`catch { page.goto('/dashboard') }` after a login `waitForURL` timeout** | Masked a hard auth failure as a downstream assertion failure        | It made a broken login look like a broken feature test, 15s later and in a different file. A login helper must fail at the login.                                                                                                                                                              |
| **Calling `loginAsTestUser(page)` from `globalSetup` with no `baseURL`**   | `page.goto: Cannot navigate to invalid URL` on the relative `/auth` | `globalSetup` launches its OWN browser, so it does NOT inherit `use.baseURL` from `playwright.config.ts` the way tests do. Pass `baseURL` to `browser.newContext()`. It failed SILENTLY because the warm-up is non-fatal by design — the suite stayed green while losing the warm-up entirely. |
| **Blamed `getAnalytics(app)` for the CI blank page** (previous session)    | Wrong function                                                      | It is `getAuth(app)` that throws `auth/invalid-api-key` on an empty key.                                                                                                                                                                                                                       |
| **Blamed `AuthContext`'s 10s fallback**                                    | Disproved by the failure snapshot                                   | Page stayed on marketing the whole timeout, so there was genuinely NO session. Still a latent false-logout, pinned in `tests/authGate.timeout.test.ts`.                                                                                                                                        |
| **Dismissing onboarding with `.or()`** / `isVisible().catch(() => false)`  | Replaced one race with another; silent swallow                      | The dialog is DETERMINISTIC — only its timing varies — so it must be waited for, never raced. **Any `.catch(() => false)` in this suite is suspect.**                                                                                                                                          |
| **Treating one green local run as proof of a flake fix**                   | It failed 1-in-4 on repeat                                          | Use `--repeat-each=4`+ and compare COUNTS, never exit codes.                                                                                                                                                                                                                                   |
| **Reproducing the people race with 10 `yes` processes**                    | Manufactured a DIFFERENT failure                                    | Extreme starvation breaks the 5s `expect` before it breaks the data.                                                                                                                                                                                                                           |
| **Reviewing the diff to find remaining people-loss bugs**                  | Missed the Airbnb squad hole entirely                               | **Sweep for the defect CLASS, don't just review the diff.** (That lesson is what found the popup in `global-setup.ts` this session.)                                                                                                                                                           |
| **Waiting for an idle machine with an until-loop**                         | Hit its iteration cap after 1200s                                   | An idle machine may be unobtainable. Use a controlled A/B at matched load, or accept that a PASS under high load is strong evidence while a failure is ambiguous.                                                                                                                              |
| `npx playwright test fileA.ts fileB.ts`                                    | `Error: No tests found`                                             | Positional args are REGEXES. Use `"(a\|b\|c)\.spec\.ts"`.                                                                                                                                                                                                                                      |

---

## Key decisions

- **Per-test account, not one shared test account** — see rationale above.
- **Email/password over the Google popup for tests** — removes the only
  public-internet dependency in the harness. The Google path is still covered by
  `e2e/login.spec.ts` (UI + popup opens), which does not need the gapi channel.
- **CI gets fake Firebase values, not secrets.** `projectId` MUST stay the real
  `divit-6d217` because global-setup starts emulators with no `--project` and
  `firebase.json` sets `singleProjectMode`.
- Everything else from the predecessor's decision list still stands.

---

## Code context

```ts
// e2e/helpers/auth.ts
export function newTestAccount(): TestAccount; // unique @divit.test address
export async function loginAsTestUser(page): Promise<TestAccount>;
export async function waitForAuthPersisted(page, timeout?); // expect.poll + page.evaluate
```

Form selectors (`src/components/auth/EmailPasswordForm.tsx`): mounts in
`signin` mode; toggle is **`Create an account`**, submit is **`Create account`**
(distinct strings — `exact: true` on both). Fields `#auth-name` / `#auth-email` /
`#auth-password`, labelled `Name` / `Email` / `Password`. Password `minLength=6`.
Provider buttons `Sign in with Google` / `Sign in with Apple` share the page, so
`exact: true` matters on `Sign in` too.

Useful one-liners:

```bash
# Page snapshots at the moment of failure — the single most useful CI artifact.
gh run download <RUN_ID> -n playwright-report -D /tmp/ciart -R amaninderpreetsingh/Bill-Split
find /tmp/ciart -name error-context.md

# Read the emulator directly. WITHOUT the bearer, rules silently return 0 docs.
curl -s -H "Authorization: Bearer owner" \
  "http://localhost:8081/v1/projects/divit-6d217/databases/(default)/documents/bills?pageSize=300"
```

---

## Warnings

- **`main` CI is still RED** until this is pushed — it has been red for three pushes.
- **Commit messages must NOT contain `Co-Authored-By` or any Claude/Anthropic
  reference** (repo `CLAUDE.md`). Overrides any default trailer behaviour.
- **Pushing `main` uploads a draft AAB to Play and probably deploys Vercel.**
- **Emulator REST reads need `-H "Authorization: Bearer owner"`.**
- **Check `uptime` before any local e2e run.** A PASS under load is meaningful; a
  FAILURE under load is ambiguous.
- Everything in `docs/handoffs/people-race-0907-part3.md`'s trap table still applies.
