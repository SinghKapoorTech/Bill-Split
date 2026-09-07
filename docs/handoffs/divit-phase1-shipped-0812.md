# Divit production readiness — Phase 1 shipped

**Status:** MILESTONE (Phase 1 complete and deployed; Phase 2 not started)
**Workspace:** `/Users/simran/Documents/GitHub/Bill-Split`
**Updated:** 2026-08-12
**Tree:** clean, all work committed and pushed. `main` @ `bdfe222`.

## Goal

Take Divit from "TestFlight beta with real user money" to production-ready, working through
`/Users/simran/Desktop/divit-audit/PLAN.md` (71 audited issues across 6 phases). Phase 1 was
"stop the ongoing damage" — the defects actively corrupting data or leaking secrets.

**Read `/Users/simran/Desktop/divit-audit/PLAN.md` first.** It is current as of this handoff and
is the authoritative plan; this file is session state only.

## Done

Commit `bdfe222` — all 8 Phase 1 tasks, deployed to prod, all pipelines green.

- **A-06** Venmo payment redirection — `encodeURIComponent` on `recipientId` at both link builders
  (`src/utils/venmo.ts`), plus permissive validation at persist sites. Covered by `tests/venmo.test.ts` (30 tests).
- **A-08** Ledger anchor — `personIdToFirebaseUid()` at the write-target sites in
  `functions/src/ledgerProcessor.ts`, plus `billService.updateBill`, `PaidByBanner`, and the
  guest-claim path in `billFunctions.ts`. Covered by `tests/integration/paidByAnchor.int.test.ts` (6 tests).
- **A-09** Spend ceiling — `functions/src/globalOptions.ts` (new). **Verified live in prod:**
  `ledgerProcessor=50`, `analyzeBill=10`, `friendAddProcessor=50`.
- **C-06 / C-07** — informational logging stripped from prod builds (`console.error` kept);
  dead `VITE_GEMINI_API_KEY` decl and unused root `@google/generative-ai` removed.
- **E-04** — `.limit()` moved onto the `friendAddProcessor` query.
- **I-01** — CI typecheck ratchet at baseline 36. First live run reported
  `type errors: 36 (budget 36, tsc exit 2)`.
- **A-01 (agent part)** — `ios/App/App/public` untracked (5 stale files).
- **Reported UI bug** — `Created`/`Paid` attribution wired into bill, transaction and Airbnb review
  steps; transaction `ownerId` now sourced from the session, not the viewer.

Gate deltas vs recorded baseline: typecheck **36 → 36**, unit **256 → 291**, integration **72 → 78**,
lint **29 err / 42 warn → identical**, both builds clean.

## Not yet done

**Human-owned, post-deploy (do these first):**

1. One receipt scan in prod — the ONLY path exercising rotated key + 8 MB cap + Gemini together.
2. Android internal-testing build — confirm OCR quality held at `width: 1600`.
3. `Settings → Venmo ID` — confirm an email/phone saves (validation was widened post-review).
4. Destroy `GEMINI_API_KEY` version 1 (still ENABLED with the old key).

**Next investigation — the only known live defect:**

`wouldStampBills` is **3** and **growing** (2 on Aug 5–7, 3 on Aug 11). These are bills whose stored
footprint memo disagrees with a fresh recompute. Balances are correct _today_ but each will compute a
bad delta on its next edit (`delta = newFootprint − storedFootprint`). Nothing repairs them
automatically — both reconciler entry points default to `dryRun: true`. A growing count means a LIVE
path still produces them. **Find the source before repairing the symptom.**

**Then Phase 2** (money correctness) — see PLAN.md. Hard ordering constraints:

- `2.1` must be first: `eventBalanceCalculator.test.ts:88` and `billPersonTotals.test.ts:90` encode
  contradictory behaviour for a no-items bill. Split math cannot change while both stand.
- `C-01` + `D-03` **must land together** — `D-03` removes the `amountOwed >= 0` predicate that is
  accidentally the only thing keeping `NaN` out of a balance doc.
- `D-04` (cent-exact allocator) is the largest change in the plan.

**Deferred review findings** (all confirmed real, all with reasons in PLAN.md):

| #   | Where                                                                     | Why deferred                                                                                                            |
| --- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | `ledgerProcessor.ts:542` event legacy anchors                             | Needs a pre-`d51a389` bill with a prefixed anchor. **Verified 0 exist in prod.** Cleanup belongs to the reconciler.     |
| 2   | `PaidByBanner.tsx:58` `person-`/`guest-` payer ids                        | Pre-existing, unchanged by the diff; arguably correct (a non-user payer can't be represented in a two-uid balance doc). |
| 3   | `SimpleTransactionWizard.tsx:611` `settledPersonIds` from `activeSession` | Pre-existing; correct fix needs sourcing the opened bill, not the active session.                                       |
| 4   | `SimpleTransactionWizard.tsx:612` `ownerId` viewer fallback               | Strictly better than the previous `user?.uid`; same root cause as #3.                                                   |
| 5   | `firestore.ts:110` `createPersonObject` unsanitized                       | `encodeURIComponent` is the actual control; this is coverage cosmetics. `saveFriendToFirestore` has zero callers.       |

Plus **PLAN.md item 2.8** — reconciler hardening (alerting; make `uidFilter` mandatory for `dryRun:false`).

## Failed approaches — DO NOT REPEAT

| What was tried                                                                | Why it failed                                                                                                                                                                         | Root cause                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setGlobalOptions({maxInstances:50})` called inside `functions/src/index.ts`  | Applied to NOTHING outside index.ts — `ledgerProcessor`, `friendAddProcessor`, `createBill` all stayed at the platform default of 1000                                                | ESM evaluates imported modules before the importer's body, and firebase-functions snapshots global options at function DEFINITION time. Fix: own module (`globalOptions.ts`) imported FIRST. **Verify with `node -e` on `functions/lib/.../index.js` reading `__endpoint.maxInstances`; `null`/`ResetValue` = uncapped.** |
| The plan's 1.5 MB `base64Image` cap                                           | Would have rejected EVERY native receipt scan — the app's primary feature                                                                                                             | Only the web path compresses (`useFileUpload.ts:33`, ~1MB). Native `Camera.getPhoto` had no width cap and sent 3–7MB. Fixed the real cost driver at capture (`width:1600`) and set the server cap to a generous safety net (8MB).                                                                                         |
| The plan's hard-fail CI typecheck gate                                        | Would be red on every run forever, so ignored — the opposite of the plan's own stated goal                                                                                            | A permanently-red gate cannot signal that the count ROSE. Ratchet at baseline instead.                                                                                                                                                                                                                                    |
| Strict Venmo regex `/^[A-Za-z0-9_-]{5,30}$/`                                  | Locks out any user whose Venmo is reached by email or phone — they could not save their profile at all                                                                                | Venmo's `recipients` param accepts username, email OR phone. Validation that rejects legitimate users is worse than the bug it guards. `encodeURIComponent` is the real fix; validation is now permissive (rejects only `& ? # = / \ < > " '` and whitespace, 3–50 chars).                                                |
| Normalizing `payloadPreviousAnchorId` (`:945`) and the DELETE anchor (`:871`) | Destroys the only locator for where a legacy footprint WAS written; makes stale and current anchors compare equal, skipping the reversal and applying only a delta to an unseeded doc | Conflated two different things. **Normalize the write TARGET; preserve the read LOCATOR.** Both reverted; keep them un-normalized.                                                                                                                                                                                        |
| `sanitizeVenmoHandle(x) ?? ''` in `useFriendsEditor`                          | Converts "typed an invalid handle" into "erase the stored one" — an unrelated edit (renaming a friend) would wipe a good venmoId                                                      | Coercing a rejection to empty string is a silent destructive write. Reject-and-toast instead.                                                                                                                                                                                                                             |
| `esbuild: { drop: ['console'] }` in production                                | Removes all 138 `console.error` calls; the app has NO other error sink, so a prod ledger failure leaves zero client-side evidence                                                     | `drop` is all-or-nothing. Use `pure: ['console.log','console.debug','console.info','console.trace']` — minification removes those, `console.error`/`warn` survive. Verified: canary `GuestClaimView` → 0, `console.error` → 155.                                                                                          |
| `git stash push` to measure a clean lint baseline                             | Silently reverted the staged `git rm --cached ios/App/App/public`                                                                                                                     | `stash` includes staged changes. After any stash round-trip, RE-VERIFY staged deletions with `git ls-files <path> \| wc -l`.                                                                                                                                                                                              |
| `grep -rn "roleTags"` to find the attribution wiring                          | Returned zero hits → wrongly concluded the feature was never wired anywhere                                                                                                           | **The prop is `roleLabels`, not `roleTags`.** The interface comment says "role tags" which is what misled the grep. `GuestClaimView:354,363` does pass it.                                                                                                                                                                |
| Claimed the camera change wouldn't ship on this push                          | Wrong for Android                                                                                                                                                                     | `android.yml` has NO `paths:` filter — it fires on every push to main and uploads a signed AAB to Play Internal Testing. Only iOS/TestFlight needs a separate Xcode Cloud build.                                                                                                                                          |
| Claimed receipt scanning was "probably broken" after the key rotation         | False alarm — the deployed function was already on secret version 2                                                                                                                   | `defineSecret` DOES pin to a version at deploy time, but `firebase functions:secrets:set` redeploys the consuming functions, which repins. Verify before alarming: `gcloud functions describe analyzeBill --gen2 --region us-central1 --format="value(serviceConfig.secretEnvironmentVariables)"`.                        |

## Key decisions

- **Ratchet, not hard gate, for CI typecheck.** Delivers "the count can only go down" literally.
  Lower `MAX` in `.github/workflows/ci.yml` as Phase 2 clears `I-02`.
- **Normalize write targets, preserve read locators** in the ledger. This distinction is load-bearing —
  two reviewers independently found bugs on both sides of it.
- **Permissive Venmo validation.** `encodeURIComponent` at the builder is the security control; the
  persist-time check only catches garbage.
- **`pure` over `drop` for console.** Keeps a diagnostic trail in prod. Revisit if a real
  error-reporting service is ever added.
- **No Phase 1.5 write pass.** A-08 never corrupted prod — proven three independent ways
  (0 bills with prefixed `paidById`, 0 with prefixed `processedBalancesAnchorId`, reconciler
  `wouldPatch: 0` and `wouldDelete: 0`). The `appstore/README.md` corruption claim is NOT A-08.

## Current state

- **Working:** everything. `main` @ `bdfe222` deployed; CI, Deploy Backend and Android all green.
  Spend ceilings confirmed on the running prod services.
- **Broken:** nothing known. 36 pre-existing type errors and 29 lint errors are the _baseline_, not
  regressions — always compare counts, never exit codes.
- **Uncommitted:** none.

## Code context

```ts
// shared/ledgerCalculations.ts:20 — only strips `user-`, NOT `person-`/`guest-`
export function personIdToFirebaseUid(personId: string): string;

// shared/ledgerCalculations.ts:106 — rejects ALL THREE prefixes; this is what
// silently skips a delta and erases a debt when an anchor isn't normalized
export function isWritableBalancePair(a: string, b: string): boolean;

// src/utils/venmo.ts — permissive by design
export function isValidVenmoHandle(handle: string | undefined | null): boolean;
export function sanitizeVenmoHandle(handle: string | undefined | null): string | undefined;

// src/utils/billParticipants.ts:15 — strips the prefix on BOTH sides, which is why
// a raw `paidById` still matches `people[].id = user-{uid}`
export function sameParticipant(a?: string | null, b?: string | null): boolean;
export function buildParticipantRoles(people, ownerId, paidById): Record<string, string>;

// functions/src/reconciliation/reconcileLedger.ts — dryRun defaults TRUE at both
// entry points (index.ts:593 callable, index.ts:614 scheduled). Every write is
// behind `if (!dryRun)` at :507. isJunk (:159) flags `user-`-prefixed participants.
export interface ReconcileOpts {
  dryRun: boolean;
  uidFilter?: string[];
}
```

## Resume instructions

1. `cat /Users/simran/Desktop/divit-audit/PLAN.md` → expect Phase 1 marked COMPLETE, Phase 1.5
   RESOLVED, and a Phase 2 list ending with item 2.8.
2. `git log --oneline -1` → expect `bdfe222`.
3. Confirm the human did the 4 post-deploy items above, especially the receipt scan.
4. Pull the current drift report:
   `gcloud logging read 'resource.labels.service_name="scheduledledgerreconcile" AND jsonPayload.message="scheduledLedgerReconcile drift report"' --project divit-6d217 --limit 3 --format="table(timestamp,jsonPayload.scanned,jsonPayload.wouldPatch,jsonPayload.wouldStampBills)"`
   → expect `wouldPatch 0`. If `wouldPatch > 0`, STOP and investigate — that is new money drift.
   Note `wouldStampBills` and whether it grew past 3.
5. Investigate the stamp source: for the affected bills determine which condition fires —
   `friendValuesDiffer`, `friendAnchorDiffers`, or the event-side `eventValuesDiffer` /
   `eventAnchorDiffers` / `eventIdDiffers` (`reconcileLedger.ts:366-408`).
   → expect one specific live path to explain all of them.
6. Only then start Phase 2, beginning with `2.1` (the contradictory tests).

## Warnings

- **`main` auto-deploys to PRODUCTION with no approval gate.** The `Production` GitHub environment
  has zero protection rules. A push ships functions + Firestore rules + Storage rules to
  `divit-6d217`, the frontend to Vercel, AND a signed AAB to Play Internal Testing.
- **Never commit without being asked.** Repo forbids `Co-Authored-By` trailers.
- **Typecheck against `tsconfig.app.json`.** Root `tsconfig.json` is a reference-only stub
  (`"files": []`) that checks ZERO files and exits 0. `vite build` does not typecheck at all.
- **Never touch §5 of the audit** — `RELEVANT_FIELDS` excluding every field the pipeline writes is
  the most dangerous property in the design and it is currently CORRECT.
- **`firebase functions:log` paginates unreliably.** It showed a 4-day gap that did not exist. Use
  `gcloud logging read` for anything you intend to draw a conclusion from.
- **Integration tests need Java** (present) and run offline-only against `demo-bill-split-test`.
  They can never touch prod or beta.
- Pre-existing, deliberately not fixed: `android.yml:29` and `ios/App/ci_scripts/ci_post_clone.sh:53`
  both run `npm run build` WITHOUT `CAPACITOR_BUILD=1`, so CI builds get `base:"/"` instead of `"./"`.
