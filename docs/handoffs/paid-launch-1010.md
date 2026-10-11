# Paid launch: plan written, execution not started

**Status:** MILESTONE (planning done, tree clean at `c50f934`, nothing in flight)
**Workspace:** /Users/simran/Documents/GitHub/Bill-Split
**Updated:** 2026-10-10

## Goal

Take Divit from "paywall built but dark" to taking real money via App Store + Play, with an LLC
behind it, following `docs/plans/2026-10-10-paid-launch-master-plan.md`. **That plan is the
source of truth.** This handoff only adds what the plan doesn't: session history and traps.

## Done this session (all pushed to `main`, CI green)

- `271c980` claimShadowUser settled-debt + duplicate-person fix (`mergeClaimedIdentity`), deployed to prod and beta.
- `5868c7d` desktop nav Bills tab. `1ff4ed4` surface a failed guest claim (toast + Retry). `027e859` centered "Create an account" prompt.
- Prod Auth: **Email/Password provider enabled** on `divit-6d217` (was disabled since 2026-09-07).
- Beta: `claimshadowuser` Cloud Run IAM `allUsers` → `roles/run.invoker` added.
- Pricing research: `reports/Bill splitting app pricing model.md` (+ `research_notes/`), `a9ae9e6`.
- Decision "option C" (freemium + opt-in 14-day annual trial) in TP: `b543115`.
- Master plan `c50f934`, including §2a owner answers: D1 parallel LLC, D2 home state (**state not named yet**),
  D3 keep **2** free scans + make the free plan obvious (new step A-1b), D4 $4.99/$34.99, 14-day trial on annual.
- Repo `CLAUDE.md` rule: one small, focused change per CR (`7804bac`).

## Not yet done (next, in order; see plan "★ Start here")

1. Owner: name the LLC **state**; log in to App Store Connect / Play Console / RevenueCat / Firebase in **Chrome** (Claude in Chrome).
2. AI: **A-1** Settings → Plan card (TP Task 3.3), as one small CR. Then **A-1b** (propose placements first), **A-2**, **A-3**, **A-4**.
3. Owner: store agreements (Y-11/12/20), Apple keys (Y-15), then AI runs A-11a…e (RevenueCat creates the store products).

## Failed approaches — DO NOT REPEAT

| What was tried                                                                                                     | Why it failed                                             | Root cause                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run test:integration -- claimShadowUser`                                                                      | Exit 0, ran **no tests**                                  | npm appends the arg outside the quoted `vitest` command inside `firebase emulators:exec`. Call `emulators:exec` directly (memory `integration-tests-filter-and-ports`)                                                        |
| Running integration tests on default ports                                                                         | "port taken"                                              | Owner's own emulator (`emulators:start`) holds 8081/9099/5001. Don't kill it; use a scratch `firebase.alt.json` with ports 8181/4410/4510                                                                                     |
| First claim-merge version: survivor = the real user's existing (bare) id; "settled iff every merged entry settled" | Second review found it could still re-charge a paid guest | `ensureUserInPeople` rewrites the viewer's bare id → `user-<uid>` without touching `settledPersonIds`; $0-share entries are never marked settled. Fixed: survivor always `user-<uid>`, settledness only over entries that OWE |
| Testing the claim on beta: "We couldn't find your profile"                                                         | Callable never ran                                        | Beta `claimshadowuser` lacked `allUsers` invoker (Cloud Run 401 "Empty Authorization header") — memory `beta-callable-missing-invoker`                                                                                        |
| `for id in $ids` loop in zsh to watch runs                                                                         | Watched nothing                                           | zsh doesn't word-split unquoted vars; use `$(… \| tr '\n' ' ')` or bash                                                                                                                                                       |
| Research subagent given extra scope via SendMessage                                                                | It had already finished                                   | Messages land at the next tool round; resume the agent explicitly with a new SendMessage                                                                                                                                      |
| Reddit as a research source                                                                                        | Fetches blocked, searches empty                           | Sentiment came from HN, reviews and blogs instead; report says so                                                                                                                                                             |

## Key decisions

- **Option C, not a hard paywall:** the 10.7% vs 2.1% figure is across categories (selection), there are free rivals, and usage is episodic. **Invariant: invitees are never paywalled, and existing bills stay open forever.**
- **Free scans stay at 2** (owner), even though the research recommended 5. Don't "fix" it.
- **Store products get created by RevenueCat MCP** (`create-product-store-state-plan` → plan → apply), not by hand. Preview the plan to the owner before applying.
- The owner granted "full access", but signing agreements, typing ID/bank/tax numbers or passwords, payments, and final submit/publish/push clicks remain theirs, with per-action confirmation (plan §1b).

## Current state

- **Working:** everything on `main`; tree clean. Prod paywall still OFF (`paywall_enabled` false), beta ON.
- **Broken:** nothing known.
- **Uncommitted:** this handoff file only.

## Resume instructions

1. `git pull && git log --oneline -1` → expect `c50f934` or later.
2. Open `docs/plans/2026-10-10-paid-launch-master-plan.md` → read "Working rules", "★ Start here", §2a.
3. Ask the owner for the LLC state if it's still missing.
4. Start **A-1** (TP §Task 3.3) as one CR: `src/components/settings/SubscriptionCard.tsx` above `DeleteAccountCard` in `src/pages/SettingsView.tsx` → gates (`npm test`, typecheck ≤36, lint ≤71, build) → owner QA → ship.

## Warnings

- Pushing `main` always triggers CI + a draft Android upload to Play; `functions/`/`shared/` changes deploy to PROD.
- Claude in Chrome: two browsers are connected (macOS "Browser 1", Windows "Browser 2"). Act only on the one the owner is using.
- Never test caps on prod; beta only.
- Open security item: unauthenticated `claimShadowUser` (owner deferred) — `docs/handoffs/claim-shadow-user-settled-debt-1009.md`.
