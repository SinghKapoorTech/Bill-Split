# Divit — people-loss race: two real defects fixed, the e2e flake is NOT them

**Status:** MILESTONE — 4 commits on `main`, GREEN, **NOT PUSHED** (4 ahead of origin)
**Workspace:** `/Users/simran/Documents/GitHub/Bill-Split`
**Branch:** `main` — HEAD `d586e00`, **4 ahead / 0 behind** `origin/main`
**Updated:** 2026-09-07 (session 3)
**Predecessor:** `docs/handoffs/monetization-0907-part2.md` — still accurate except
its "Not yet done #1" (the people-loss race), which this file supersedes.

---

## Goal

Close the people-loss race: adding a person to a bill can silently drop them, no
error. Was item #1 on the previous handoff's priority list.

---

## Commits on `main` (NOT pushed)

| Commit | What | Deploys? |
| --- | --- | --- |
| `be0d70a` | jsdom + Testing Library harness as a second vitest project | no |
| `6c370a8` | the three people-loss / duplication fixes + their tests | no |
| `1854812` | e2e quarantine banners + this handoff | no |
| `d586e00` | same fixes ported to `AirbnbWizard`; reconciler extracted and shared | no |
| `d4d476d` | squad add on `/airbnb/:billId` now persists (d586e00 missed it) | no |

None match the `deploy-backend.yml` path filter, so pushing deploys NO backend.
A push still always uploads a draft AAB to Play.

## Done this session (all verified)

### 1. React/jsdom test harness — the gap the last handoff flagged

`vitest.config.ts` restructured into two `projects`, so `npm test` runs both and
CI keeps its single hard gate:

- `unit` — node env, `tests/**/*.{test,spec}.ts` (verified identical file set to
  the old config via `vitest list --filesOnly` on both: 39 files, same set)
- `react` — jsdom env, `tests/react/**`, setup at `tests/react/setup.ts`

New devDeps: `jsdom`, `@testing-library/react`, `@testing-library/dom`,
`@testing-library/user-event`, `@testing-library/jest-dom`.
`@testing-library/user-event` is currently UNUSED — either use it or drop it.

### 2. DEFECT A — stale render closure in `usePeopleManager` (FIXED)

`addPerson` awaited `userService.resolveShadowUserByName` (a network round trip)
and then wrote `setPeople([...people, newPerson])` using the closure captured
BEFORE the await. A Firestore snapshot landing during the await was clobbered.

`ba134ee` had fixed the _Firestore write_ side (`peopleRef`) but left the _local
state_ write stale — the previous fix landed one layer too high.

Four writes converted to functional updates, dedupe moved inside the updater:
`usePeopleManager.ts:74, :118, :143, :170`.

**Test-first, per repo gate #2.** Verbatim failure against the old code:

```
AssertionError: expected [ 'Owner', 'Alice' ] to deeply equal [ 'Owner', 'Bob', 'Alice' ]
```

Test: `tests/react/usePeopleManager.race.test.tsx`. Independently re-verified by
the adversarial reviewer, who reverted the hook to HEAD and reproduced it.

### 3. DEFECT B — silent-drop branch in `BillWizard` (FIXED)

```js
const id = billId || activeSession?.id;
if (id) {
  persistPeopleAddition(id, [newPerson]);
} // no else — silent discard
```

Until the just-in-time draft write returns and the URL swaps `/bill/new` →
`/bill/{id}` there is no id, and `AIScanView` deliberately passes
`activeSession = null` for drafts (`effectiveSession = isDraft ? null : activeSession`),
so there is no fallback either. An add in that window went into local React state
and NOWHERE else: UI showed the person, `canProceedFromStep(1)` accepted
`people.length > 1`, the wizard advanced, the next snapshot erased them.

**Directly observed**, not inferred — see the instrumentation evidence below.

New hook `src/components/bill-wizard/hooks/usePeopleAdditionQueue.ts` queues adds
made before an id exists and flushes on arrival. Wired into all three add paths:
`BillWizard.tsx:412, :433, :450`. Test: `tests/react/usePeopleAdditionQueue.test.tsx`
(4 cases: immediate persist, queue-then-flush, no double-flush, reads current id
not a captured one).

### 4. Quarantine banners updated in all three specs

The "DO NOT REDO" lists now name both fixes above, so nobody re-attempts them.

---

## THE HEADLINE: neither fix closes the e2e flake

Controlled A/B, 12 runs per side, matched starting load (~7.3), same emulator:

| side                        | failed | passed |
| --------------------------- | ------ | ------ |
| B — baseline, fixes stashed | **3**  | 9      |
| A — with both fixes         | **5**  | 7      |

Within noise at n=12, but there is **no improvement**. The remaining flake is not
Defect A and not Defect B. Both fixes are kept because each is independently
proven by a unit test, not because they fix this suite.

---

## PROVEN about the failure — do not re-derive

1. **The loss is ON WRITE, not on render.** After a failing full-suite run I
   queried the emulator directly (read-only, `localhost:8081`, admin bearer).
   Two bills had `people: 1` — owner only — with `total: 90`, against a passing
   bill's `people: 2`. **"The test is rotted" is dead as a hypothesis, permanently.**

   ```bash
   curl -s -H "Authorization: Bearer owner" \
     "http://localhost:8081/v1/projects/divit-6d217/databases/(default)/documents/bills?pageSize=300"
   ```

2. **In one captured failure `persistPeopleAddition` was never called at all.**
   That was Defect B, now fixed.

3. **These specs also fail from pure CPU starvation with the data fully CORRECT.**
   Instrumented every people write; under 10 saturated cores the doc read
   `["Owner","Charlie"]` throughout, snapshot and local state agreed at every
   step, and the test still failed on `getByText('Charlie')` at Review. **Measure
   at 1-min load < 3 or conclude nothing.**

4. **All three specs now fail at or after the SETTLE step, not the add step.**
   That is where the next investigation belongs.

---

## Not yet done — in priority order

1. **Instrument the SETTLE half of the three specs** and get a clean idle
   measurement. This is the live thread.
2. **DONE in `d586e00`** — `AirbnbWizard` had all three defects plus an
   unconditional snapshot adopt with no in-flight guard at all. Now shares
   `reconcilePeopleWithServer`, `mergePeopleAdditions` and
   `usePeopleAdditionQueue` with `BillWizard`.
3. **Cross-bill mis-flush in `usePeopleAdditionQueue`** (from review, NOT fixed).
   The flush is keyed on "*an* id arrived", not "the id of the draft this queue
   belongs to". `App.tsx:155` renders the same element for every `bill/:billId`,
   so a param change does not remount the wizard. Queue a guest on `/bill/new`,
   then browser-back/forward into `/bill/B` before the draft id lands, and the
   flush writes the draft's full `people` array over B's. Narrow (sub-second
   window, no in-wizard link to another bill, every exit unmounts) but
   destructive. There is NO cheap guard: from inside the wizard `undefined → B`
   is indistinguishable from `undefined → the draft's own id`. Needs the created
   id plumbed down from `useBillSession`, or an additive server-side merge.
4. **`/transaction/:billId` evicts a guest who joined.** `SimpleTransactionWizard`
   hydrates `people` once behind `hasLoadedBillId.current` (`:216`, `:259-271`)
   and never re-syncs from later snapshots, so a guest added via
   `billService.joinBill` (`arrayUnion`, `billService.ts:356`) is invisible to
   it. The owner's debounced autosave then writes the array back without them
   (`:390` captured, `:402` written, behind a 1000ms timer AND an await). Also
   `:491`. Needs `peopleRef` + `reconcilePeopleWithServer`. **Takes two users to
   observe — will not show up in solo testing.**
5. **`/shared/:sessionId` — the guest-facing screen.**
   `CollaborativeSessionView.tsx:62-66` adopts every snapshot unconditionally
   with no in-flight guard; `handleAddSelfToPeople` (`:77-81`) and
   `handleRemovePerson` (`:99-104`) build writes from the render closure behind
   a 400ms debounce. Same treatment needed.
6. **`useBillSession.ts:132`** materializes `savePayload.people` BEFORE the
   `await` at `:152`, so someone added during a concurrent draft creation is
   written out of the array — the same race the queue closes, one layer up.
   Move the read after the await.
7. **`useBillSession.ts:103-108`** clears `pendingUpdatesRef` BEFORE the
   `if (!billId) return`, destroying the batch rather than retaining it.
   Latent today (its only consumer always has a route param).
8. **`handleRemovePerson` / `handleUpdatePerson` are still on the stale-closure
   pattern** in BOTH wizards (`BillWizard.tsx` ~:475/:492, `AirbnbWizard` the
   same shape). Pre-existing, same defect class as everything fixed above.
9. `usePeopleManager.ts:151` vs `:170` — `addFromFriend`'s `alreadyExists` guard
   reads the render closure while its write reads `current`. If a snapshot removed
   that person between commit and click, the user gets a false "Already added"
   toast, `null` is returned, and the friend genuinely is not added. Synchronous,
   so at most one render stale — low probability, worth collapsing.
10. Untested new paths: the email branch (`usePeopleManager.ts:74`) and
   `addFromFriend` (`:170`) got the same change and neither is covered.
   `getUserByContact` is already mocked in the test file, so a case is cheap.
11. Everything in the predecessor's backlog (chunk 4 RevenueCat, push
   notifications, `pausedReason` UI reader, CI e2e concurrency group, the
   Android Internal Testing red build on `main`).

---

## Failed approaches — DO NOT REPEAT

| What was tried                                                         | Why it failed                                                                 | Root cause                                                                                                                                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hypothesised a "pending-id registration window" in BillWizard**      | Not reachable. RETRACTED mid-session.                                         | There is no `await` between the optimistic `setPeople` and `addPerson`'s `return`, so the caller resumes in a MICROTASK. A Firestore snapshot is a macrotask and cannot interleave. The `ba134ee` guard has no gap. |
| Fixing the closure bug in `BillWizard` alone (`ba134ee`, last session) | Fixed the Firestore-write side; local state kept clobbering                   | The optimistic `setPeople` lives in `usePeopleManager`, one layer below. Fix the layer that actually calls `setPeople`.                                                                                             |
| Expecting either fix to turn the e2e specs green                       | A/B says no: 3 failed → 5 failed                                              | The remaining failure is downstream of the add step entirely.                                                                                                                                                       |
| Reading source to find the clobber (3rd pass)                          | Burned time, found nothing                                                    | Predecessor already recorded static reading as exhausted TWICE. Instrumentation found it in one run. **Instrument earlier.**                                                                                        |
| Reproducing the race with 10 `yes` processes on 10 cores               | Manufactured a DIFFERENT failure — render timeout with perfectly correct data | Extreme starvation breaks the 5s `expect` before it breaks the data. Contention reproduces _a_ failure, not _the_ failure. Use moderate load.                                                                       |
| Measuring e2e right after that                                         | 1-min load 27, 5-min 122; a never-quarantined spec (`create-options`) failed  | Machine was still draining. Predecessor's warning confirmed a fourth time.                                                                                                                                          |
| `npx playwright test fileA.ts fileB.ts fileC.ts`                       | `Error: No tests found`                                                       | Playwright treats positional args as REGEXES, not paths. Use `"(a\|b\|c)\.spec\.ts"`.                                                                                                                               |
| `npx playwright test --grep-files`                                     | `error: unknown option '--grep-files'`                                        | Does not exist.                                                                                                                                                                                                     |
| Waiting for an idle machine with an until-loop                         | Hit its 60-iteration cap after 1200s, never reached the threshold             | The remaining load is the human's own desktop — WindowServer, Chrome, Spotlight — plus `claude` itself at ~35%. An idle machine may not be obtainable mid-session.                                                  |

---

## Key decisions

- **Kept both fixes despite the A/B showing no e2e improvement.** Each is a real
  defect with a test that fails against HEAD and passes after. Their value does
  not depend on this suite.
- **Re-quarantined the three specs.** CI's e2e is a hard gate and the flake is
  open. Banners carry the new findings so the knowledge is not lost again.
- **Extracted a hook rather than rendering all of `BillWizard`** for Defect B.
  Rendering it needs router + auth + firebase + every step component mocked; the
  queue-vs-persist decision is the actual logic and is testable on its own.
- **Refs in `usePeopleAdditionQueue` are assigned during render, not in an effect.**
  A ref written in an effect still holds the value from the commit BEFORE the
  await — exactly the staleness the hook exists to prevent.
- **Extracted `reconcilePeopleWithServer` rather than copying it into
  `AirbnbWizard`.** The verbatim-adopt-when-nothing-pending rule is subtle
  enough that a second copy would drift, and this repo already carries a
  triplicated e2e banner as evidence of that. Cost: the shared refactor edits
  `BillWizard`, which had just been committed.
- **Both fixes shipped with NO end-to-end coverage, deliberately.** The three
  specs that exercise the flow are quarantined and the A/B proves they do not
  validate these changes. The unit tests are the evidence; the e2e suite is not.
- **`d586e00` was an INCOMPLETE fix and `d4d476d` repairs it.** The squad path
  never enters the wizard: `PeopleManager.handleAddSquad` uses the parent's
  `onAddSquad` if supplied and otherwise falls back to a LOCAL-ONLY setPeople,
  and `BillWizard.tsx:820` was the only place in the app passing that prop.
  Lesson: checking the code you changed is not the same as checking the code
  that routes around it. A codebase-wide sweep for the defect class found it;
  reviewing the diff did not.
- **The remaining findings are development-phase backlog, not ship blockers** —
  owner's call, the app has no production clients yet. The cross-bill mis-flush
  (#3) should be fixed before it does.
- **Prettier failures on the three specs are PRE-EXISTING** — verified by running
  `prettier --check` against the `HEAD` copies. Not introduced here, not fixed here.

---

## Current state

- **Working:** everything. `npm test` **699 passed / 43 files**. Typecheck **36**
  (= CI ratchet baseline). Lint **71 problems** (= baseline, confirmed on a clean
  tree; 0 errors in any changed file). `npm run build` clean.
  `npx playwright test --list` → 19 tests in 10 files.
- **Broken:** nothing in the tree. Three specs remain `test.fixme`-quarantined:
  `e2e/bill-wizard.spec.ts:65`, `e2e/bill-settlement.spec.ts:63`,
  `e2e/settle-bill.spec.ts:56`. Verbatim failure when un-quarantined:

  ```
  Error: expect(locator).toBeVisible() failed
  Locator: locator('text=$45.00').first()
  Expected: visible
  Timeout: 5000ms
  Error: element(s) not found
  ```

  and, in other runs, the same against `getByText('Charlie').first()`.

- **Uncommitted:** none. Working tree is clean; 4 commits sit unpushed on `main`.

---

## Code context

```ts
// src/components/bill-wizard/hooks/usePeopleAdditionQueue.ts
export function usePeopleAdditionQueue(
  billId: string | undefined,
  persist: (id: string, added: Person[]) => void,
): (added: Person[]) => void;

// src/hooks/usePeopleManager.ts — all four writes now functional
setPeople((current) =>
  current.some((p) => p.id === newPerson.id) ? current : [...current, newPerson],
);

// src/components/bill-wizard/BillWizard.tsx:404 — replaces the `if (id)` drop
const addOrQueuePeople = usePeopleAdditionQueue(billId || activeSession?.id, persistPeopleAddition);
```

Instrumentation that found Defect B (re-add temporarily if needed; it was fully
stripped — `grep -rn "TEMP-DEBUG" src e2e` returns nothing):

```ts
// billService.updateBill — the single choke point for every people write
if (updates.people) console.log('[PW-START] #' + seq + ' ' + names + ' FROM ' + stack);
// after runTransaction resolves:
console.log('[PW-COMMIT] #' + seq + ' ' + names);
// plus a page.on('console') forwarder in the spec to surface them in test output
```

---

## Resume instructions

1. `git status --short` → expect CLEAN; `git log --oneline -1` → expect `d586e00`;
   `git rev-list --left-right --count origin/main...main` → expect `0  4`
   (four commits ready to push, deliberately not pushed).
2. `npm test` → expect **699 passed / 43 files**.
   `npm run --silent typecheck 2>&1 | grep -c 'error TS'` → expect **36** (do NOT "fix" these).
3. `uptime` → **do not run e2e unless the 1-min load is under 3.** Anything above
   that produces failures unrelated to the code.
4. Pick up at "Not yet done" #1: instrument the settle step in
   `e2e/settle-bill.spec.ts` (it now reaches Review with correct data and fails
   later) → expect to find where the settle write or its snapshot diverges.
5. If e2e work stalls, "Not yet done" #3 (the cross-bill mis-flush) is the
   highest-value non-e2e item — it is a destructive path introduced by this
   session's own queue hook.

---

## Warnings

- **Four commits are unpushed.** The work is safe across a `/clear`, but it is
  not on `origin` — nothing ships until someone pushes.
- **This diff is `src/` + `tests/` + `e2e/` only — it does NOT auto-deploy the
  backend** (`deploy-backend.yml` filters on `functions/**`, `shared/**`,
  `firestore.rules`, `firestore.indexes.json`). A push to `main` still always
  uploads a draft AAB to Play.
- **Commit messages must NOT contain `Co-Authored-By` or any Claude/Anthropic
  reference** (repo `CLAUDE.md`). This overrides any default trailer behaviour.
- **`npm test` now runs jsdom tests too.** A React test that hangs will hang CI's
  hard gate, which `npm test` previously could not do.
- **Emulator REST reads need `-H "Authorization: Bearer owner"`** or security
  rules silently return zero documents — a false negative that looks like proof.
- **Other sessions push to `main` concurrently.** `git pull --rebase` before
  pushing and RE-RUN gates afterwards.
- Everything in `docs/handoffs/monetization-0907-part2.md`'s trap table still applies.
