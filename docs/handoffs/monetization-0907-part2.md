# Divit — chunk 3 SHIPPED to prod; ledger + wizard bugs found and fixed

**Status:** MILESTONE — everything is committed AND pushed; `main` is clean
**Workspace:** `/Users/simran/Documents/GitHub/Bill-Split`
**Branch:** `main` — HEAD `ba134ee`, **0 ahead / 0 behind** `origin/main`
**Updated:** 2026-09-07 (session 2)
**Predecessor:** `docs/handoffs/monetization-0907.md` — read it for the beta/iOS
verification detail and the Remote Config namespace trap. **Its "Current state"
and "Not done" sections are now STALE** (it says "nothing committed, nothing
pushed"; that was true when written, and is no longer).

---

## Goal

Paid tiers for Divit in 2026: capped free tier, $4.99/mo Pro, $3.99/14-day Trip
Pass, via RevenueCat. Source of truth for the design is
`docs/superpowers/specs/2026-09-06-monetization-design.md`. This file covers
execution state and what to do next.

---

## Done this session (all pushed)

| Commit | What | Deploys to prod? |
| --- | --- | --- |
| `e7cbe4b` | Chunk 3 free-tier caps, minimum-version gate, RC tooling, e2e wired into CI | **YES — deployed** |
| `543d939` | CI fix: `spawnSync /bin/zsh ENOENT` in e2e global setup | no |
| `0e7915a` | Ledger NaN validation + 2 HIGH-severity fixes found in review | **YES — deployed** |
| `ba134ee` | Bill-wizard people race (partial fix) + accurate quarantine banners | no (src/ + e2e/ only) |

Not mine, landed from other sessions mid-work: `e94e84b` (auth: email/password
sign-in, verified-email gates — **deployed to prod**) and `0b2efde` (chore).

**Remote Config published to PROD** (`divit-6d217`), both namespaces, version 1,
in sync: `paywall_enabled=false` (dark), `free_active_groups=2`,
`free_scans_per_month=5`, both version floors `""` (nobody walled).
Command used: `npm run rc:publish -- prod`.

### Real bugs found and fixed (none were on the original task list)

1. **Discount receipts would have failed to save.** `shared/billAmountValidation.ts`
   rejected ALL negative amounts including line items, and its docstring claimed
   "`useReceiptAnalyzer` keeps only `price > 0`". That claim was FALSE —
   `src/hooks/useReceiptAnalyzer.ts:44` filters `price !== 0`, and
   `shared/receiptAmounts.ts:42` says "Deliberately NOT non-negative: comped
   lines and discounts legitimately carry a negative price". Commit `1dc5343`
   was literally "stop dropping discount lines, which over-collected". Fixed:
   line items allow negatives, aggregates stay non-negative, magnitude bound now
   uses `Math.abs` so a huge negative is still rejected.
2. **Emptied bills stranded balances forever.** The Stage-1 validation bail sat
   ABOVE the deliberate teardown whose own comment warns "Returning early here
   would strand the balance forever". Fixed by scoping the bail to when
   `billData` is actually present.
3. **Ledger pipeline died on every draft bill.** Same bail: `validateBillAmounts`
   errors on MISSING `billData`, and every bill starts as a draft with none.
   **Proven by controlled experiment, both directions** (see below).
4. **People could silently vanish from a bill.** PARTIAL fix in `ba134ee`; the
   race is still open. See "Not yet done" #1.

### Verified against PRODUCTION data (read-only)

Repo gate #4 (backward compatibility) for removing the no-items even-split
branch in `shared/calculations.ts`: queried prod for `splitEvenly == true` →
**31 bills, ZERO with empty/missing `items`**. No existing document is affected.

---

## Not yet done — in priority order

### 1. The people-loss race (OPEN, user-visible)

**Symptom:** add a person to a bill; they can silently vanish, no error.

**Mechanism (verified by inspection, corroborated by an independent review):**
- `src/pages/AIScanView.tsx:128` re-derives `people` from EVERY `activeSession`
  snapshot: `setPeople(ensureUserInPeople(activeSession.people || [], user, profile))`,
  and the effect is keyed on `user`/`profile` object identity too.
- `src/components/bill-wizard/BillWizard.tsx` mirrors that into local state.
- `canProceedFromStep(1)` is `people.length > 1` (`useBillWizard.ts:88`), so the
  wizard ADVANCES and only then loses the guest — Review shows the owner
  carrying the full total. That is the "contradiction" that stalled the first
  investigation.

**What already landed in `ba134ee` (partial):**
- `peopleRef` — writes build from current state, never the render closure.
- `pendingPersonIdsRef` — the sync effect re-attaches only still-in-flight
  additions; when nothing is in flight it adopts the server array VERBATIM (a
  blanket merge-by-id would break REMOVALS).
- `persistPeopleAddition(id, added)` — all three add paths route through it.

**IMPORTANT:** reverting that fix changed NOTHING for the failing e2e tests, so
it is **not proven** to close the race. Do not assume it is fixed.

**Next step:** OBSERVE the People step (console instrumentation or a headed
run). Static source reading has been exhausted twice.

### 2. CI's e2e job has never completed a single run

Cancelled **three times** by `concurrency: cancel-in-progress: true` in
`.github/workflows/ci.yml` — every new push kills the in-flight run, and e2e is
the longest job so it is always the casualty. The gate is configured but
unproven. Either give e2e its own concurrency group, or accept it as
best-effort and say so in the workflow.

### 3. `0b2efde` — Android Internal Testing FAILED on main

Not from this session's work. A red Android build on `main` is worth a look.

### 4. Open code-review findings (from `/code-review` high, this session)

- **MEDIUM** — reconciler vs pipeline disagree about invalid bills
  (`shared/reconcileBalances.ts:164`, `functions/src/reconciliation/reconcileLedger.ts:349`).
  Largely defused by fixing the negative-price bug (discount bills are no longer
  "invalid"), but for genuinely corrupt bills an admin
  `reconcileLedger({dryRun:false})` would still ZERO a real balance.
- **LOW** — `src/hooks/useReceiptAnalyzer.ts:53` throws AFTER the server has
  consumed the scan quota, so a failed merge burns a paid scan. Matters more now
  that caps ship.
- **LOW** — `shared/ledgerCalculations.ts:98` D-03 finiteness check is
  unreachable in production once validation is in place; comment is misleading.
- **LOW** — `e2e/settle-bill.spec.ts` `getByText('Bills')` has the same
  substring hazard just fixed for `Balances`; and that test asserts no balance
  amount, so "updates event balances" is not actually covered.

### 5. DECISION NEEDED — NaN-corruption settlement gap

For a genuinely corrupt (NaN) write, the Stage-1 bail still means
`processSettlement` can zero `balances` while `event_balances` retains the debt.
The bail is a DOCUMENTED, deliberate choice ("destroying value to punish a
malformed write" would be worse). Changing it is a design decision about money
logic, not a bug fix. Owner call.

### 6. Product backlog (unchanged)

Chunk 4 RevenueCat → Chunk 5 Trip Pass → Chunk 6 paywall + progressive quota UI
(spec §4.3.1). Push notifications (spec §6.3 — biggest launch risk) and
analytics (`logEvent` count still zero). Scan quota never tested end-to-end
(needs Gemini + a month boundary). No jsdom/React harness, so
`minimumVersionService`/`useMinimumVersion` are untested at the seam where their
one real bug lived. `pausedReason` has no UI reader (a system-paused template
renders as "Active") — fix BEFORE wiring `eventId` into the recurring wizards.

---

## Failed approaches — DO NOT REPEAT

| What was tried | Why it failed | Root cause |
| --- | --- | --- |
| **Quarantining 3 e2e specs as "rotted"** | Masked a REAL ledger regression | They were correctly detecting bug #3. "The test is rotted" is a HYPOTHESIS, not a diagnosis. The one time the experiment was actually run, the opposite was true. |
| Trusting the handoff's "one stale selector in `e2e/helpers/bill.ts`" | Undercounted the work | It was THREE unrelated causes, and the bill-wizard flow alone was rotted at FOUR separate steps. Each fix exposed the next. |
| Triaging e2e failures by timing signature alone | Grouped unrelated bugs | Identical 90s timeouts hid two different stacked selector bugs. 1.5m = test timeout / locator never resolves; ~18s = an explicit 15s wait; 46s = a 45s expect. Useful for splitting, useless for concluding. |
| `getByRole('button', { name: /add$/i })` for the item confirm button | Matched ZERO elements, hung 90s | The desktop TABLE layout renders it icon-only with NO accessible name. Fixed with `aria-label` + `data-testid` on BOTH layouts. |
| `getByRole('switch', …).or(getByText(/split even/i))` for Split Evenly | Never clicked anything | It's a BUTTON (`BillItemsTable.tsx:81`), and the getByText fallback's strict-mode violation was **swallowed by `.catch(() => false)`** — so it failed silently and presented as a mysterious disabled Next button. |
| Waiting for `/dashboard` after the recurring wizard | 15s timeout | All three recurring wizards navigate to **`/bills`** (`RecurringQuickWizard.tsx:268`, `RecurringDetailedWizard.tsx:227`, `RecurringAirbnbWizard.tsx:215`). |
| Asserting a recurring bill on `/bills` under the default filter | 0 elements | `billFilters.ts:34 recurringMatchesFilter` returns `filter === 'recurring'` — templates are DELIBERATELY excluded from "all". Click the `role="tab"` named "Recurring" first. |
| `getByRole('button', { name: 'Delete recurring bill X' })` | Strict mode, 2 elements | The card is itself a `<button>` NESTING the delete button, so its computed name CONTAINS the label. Playwright name matching is SUBSTRING by default — needs `exact: true`. (Aside: button-inside-button is invalid HTML; worth fixing in `MobileRecurringBillCard`.) |
| Asserting on dashboard content right after login | "element(s) not found" | Every e2e run is a NEW account, `profileSync.ts:40` writes `hasSeenOnboarding: false`, so `Dashboard.tsx:22-25` opens a Radix MODAL, which marks everything outside it `aria-hidden`. `getByRole` reads the a11y tree. Dismiss via the Skip button first. |
| Firebase MCP `firestore_query_collection` with `boolean_value: "true"` | Silent FALSE NEGATIVE — returned 0 docs | The string form matches nothing. Pass a real JSON boolean `true`. Caught only by a sanity query; would otherwise have "proven" there is no affected prod data. |
| Querying the Firestore EMULATOR over REST unauthenticated | Silent FALSE NEGATIVE — "0 bills" | The REST API is subject to security rules. Use `-H "Authorization: Bearer owner"` for admin access. |
| Running the e2e suite while a build/test/`/code-review` runs | 3 tests fail with 90s timeouts | CPU contention. Same tests pass in ~5s idle. Happened THREE times. Check `uptime` before trusting a red e2e run. |
| Running the e2e suite against a just-started emulator | First tests fail (auth popup, `+` button) | Cold start. The run takes ~2m instead of ~45s. Warm it or re-run. |
| Killing ONLY port 5001 to rebuild functions | Auth emulator broke | `global-setup.ts:isEmulatorRunning()` probes 8081 AND 5001; with 5001 down it tries to start a SECOND emulator set against already-bound ports. Kill all of them: `lsof -ti:9099,8081,4000,5001,4400,4500,9150 \| xargs kill -9`. |
| Concluding from a run measured after `git checkout`/emulator kills | Reported "19 failed" | The tree/emulator was mid-swap. A measurement taken during your own edits is garbage. |

Plus everything in `docs/handoffs/monetization-0907.md`'s trap table — the
Remote Config namespace trap, `codesign -d --entitlements` on simulator builds,
`firebase deploy | tail` exit codes, Maestro `tapOn` false greens, and the rest.
**All still apply.**

---

## Key decisions

- **Re-quarantined the 3 flaky specs (owner decision).** They are NOT rotted and
  the banners say so. Rationale: CI's e2e job is a HARD gate, and the remaining
  race makes them intermittently red. The banners carry the full history so the
  knowledge is not lost again.
- **The sync effect adopts the server array VERBATIM when nothing is in flight**,
  rather than merging by id. A blanket merge looks safer but breaks REMOVALS — a
  person deleted elsewhere would never disappear. Trading data loss for data
  resurrection is not a fix.
- **Line items allow negative prices; aggregates do not.** A discount belongs on
  a line, never on a total.
- **The `aria-label`s added to `ItemFormFields` are a real a11y fix**, not a test
  hook. Those icon-only buttons had no accessible name at all.
- **Kept the partial race fix even though it is unproven** — it removes a defect
  verified by inspection (persisting a render-closure array after an `await`).
- **Caps still ship DARK.** `paywall_enabled=false` in prod. A MISSING RC
  template also fails safe to dark, so publishing changed no behaviour — it just
  makes the state explicit and pre-arms the version-gate keys.

---

## Current state

- **Working:** `main` is clean and pushed. e2e **16 passed / 3 skipped, exit 0,
  ~43s** on an idle+warm machine. Unit **680**. Rules **78**. Integration **227**.
  Typecheck **36** (pre-existing baseline). Lint **29** (baseline). `vite build`
  and `functions tsc` clean.
- **Broken:** nothing in the tree. Three specs are `test.fixme`-quarantined with
  full banners: `e2e/bill-settlement.spec.ts:13`, `e2e/bill-wizard.spec.ts:15`,
  `e2e/settle-bill.spec.ts:6`. Their verbatim failures when un-quarantined are
  `Error: element(s) not found` waiting for `locator('text=$45.00').first()` and
  for `getByText('Alice').first()`.
- **Uncommitted:** none.

---

## Code context

```ts
// shared/billAmountValidation.ts — line items may be negative, aggregates may not
export function validateAmount(
  label: string,
  value: unknown,
  options: { allowNegative?: boolean } = {},
): string | null

// functions/src/ledgerProcessor.ts — Stage 1, scoped so an EMPTIED bill still tears down
if (after.billData !== undefined && after.billData !== null) {
  const amountError = validateBillAmounts(after.billData);
  if (amountError) { /* log + return */ }
}

// src/components/bill-wizard/BillWizard.tsx — the partial race fix
const peopleRef = useRef<Person[]>(people);              // current, not closure
const pendingPersonIdsRef = useRef<Set<string>>(new Set()); // writes in flight
const persistPeopleAddition = (id: string, added: Person[]) => { /* … */ };

// src/components/bill-wizard/hooks/useBillWizard.ts:88 — why the wizard advances
case 1: return people.length > 1;
```

---

## Resume instructions

1. `git log --oneline -1` → expect `ba134ee`; `git rev-list --left-right --count origin/main...main` → expect `0  0`.
2. `npm test` → expect **680 passed**. `npm run --silent typecheck 2>&1 | grep -c 'error TS'` → expect **36** (baseline; do NOT "fix" these).
3. Rules + integration need Java and start their own emulators:
   `npm run test:rules` → **78 passed**; `npm run test:integration` → **227 passed**.
   If ports are held: `lsof -ti:9099,8081,4000,5001,4400,4500,9150 | xargs kill -9`.
   **Never** run the integration suite with a functions emulator up — it double-fires triggers.
4. e2e: `npx playwright test e2e/ --retries=0 --reporter=line` → expect
   **16 passed / 3 skipped**. Check `uptime` first — run it on an idle machine or
   the result is meaningless. Fast loop: `npm run test:e2e:fast`.
5. Pick up at "Not yet done" #1 — instrument the People step and watch `people`
   across the add → Next transition. → expect to see the guest present locally,
   then absent after a snapshot.

---

## Warnings

- **Pushing `main` auto-deploys the backend to PROD** when the diff touches
  `functions/**`, `shared/**`, `firestore.rules` or `firestore.indexes.json`
  (`deploy-backend.yml` path filter). It ALSO always uploads a draft AAB to Play.
  A `src/`-only or `e2e/`-only diff does NOT deploy.
- **Turning the paywall on in prod** requires `I_MEAN_IT=1 npm run rc:publish -- prod`.
  The guard only fires when `paywall_enabled` is `true`.
- **Commit messages must NOT contain `Co-Authored-By` or any Claude/Anthropic
  reference** (repo `CLAUDE.md`). This overrides any default trailer behaviour.
- **`firestore.indexes.json` full deploy fails on BETA** on a pre-existing
  `event_balances` index conflict. Prod deployed clean. For beta:
  `firebase deploy --only firestore:rules --project beta`.
- **`APPLE_SIGNIN_PRIVATE_KEY` is a PLACEHOLDER on beta** — `deleteAccount` and
  Apple token revocation will not work there.
- **Other sessions are pushing to `main` concurrently.** Two commits landed
  mid-work. `git pull --rebase` before pushing, and RE-RUN GATES after rebasing —
  numbers measured against the old base are stale.
- Never run concurrent agents that touch git.
