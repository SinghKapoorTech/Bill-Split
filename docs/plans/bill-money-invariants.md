# Bill money invariants

**Status:** SPEC, revision 2 — reviewed before the enforcement code exists.
**Revision 1** was reviewed and came back *"not sound enough to implement
against"* with 3 blockers and 13 defects. That review cost one agent run on a
**document**; the same mistakes found in code would have been three more
review rounds. Revision 2 is the corrected design. Every claim below was
checked against the source; `file:line` references are load-bearing.

**Why this document exists:** five consecutive adversarial review rounds on one
data-loss fix each found a *different* money bug, and all five were the same
mistake — patching one field at one call site when the real defect was an
invariant enforced nowhere.

---

## 1. The problem shape

A bill's money is determined by **six independent fields** that must agree:

| Field | Written as | Guarded before this spec |
| --- | --- | --- |
| `people` | whole-array replace | yes — `allowPeopleRemoval` guard |
| `itemAssignments` | whole-value replace, **or** per-item `arrayUnion`/`arrayRemove` | no |
| `billData` | `validateBillAmounts` at CREATE and in the ledger — but **per-field only**, never sum-vs-total |
| `paidById` | whole-value replace | normalized in `updateBill` (`billService.ts:236`); membership checked **only** in the `createBill` callable (`functions/src/billFunctions.ts:326-334`), NOT in `createBillCore` |
| `settledPersonIds` | `arrayUnion`/`arrayRemove` | no |
| `splitEvenly` | whole-value replace | no — and it is in the anonymous-writable whitelist (`firestore.rules:180`) |

Nothing checked that they agree, and ~30 write paths each touch a different
subset. Defending them one at a time is unwinnable — that is literally what
rounds 1-5 were.

### The load-bearing mechanism

`shared/calculations.ts:26-34`:

```ts
const splitPrice = item.price / assignedPeople.length;   // RAW length
assignedPeople.forEach((personId) => {
  if (personSubtotals[personId] !== undefined) { ... }   // non-person DISCARDED
});
```

An assignee absent from `people` still **takes a share of the divisor** and
then has it **thrown away**. Money leaves the bill silently; the payer absorbs
it; the UI never shows it because the wizard renders local state.

### `splitEvenly` changes the arithmetic entirely — verified

`shared/calculations.ts:99-101` **reassigns** `effectiveAssignments` from
`buildEvenSplitAssignments(...)`. So when `splitEvenly` is true, stored
`itemAssignments` is **dead state**: I1 violations underneath are invisible,
and flipping the flag moves money. Measured: items `[100]`, stored
`{i1:['a']}`, people `[a,b]` -> `false` gives a:100/b:0; `true` gives
a:50/b:50.

And `shared/calculations.ts:104-127` makes `billData.total` **authoritative**
on the discount path. Measured: `splitEvenly:true`, items `[100]`,
`total: 0` gives **every person owes $0.00**, `validateBillAmounts` passes
(0 is a valid non-negative), then the ledger reverses the entire footprint.

---

## 2. The invariants

For a bill `B`, with `uid(x) = personIdToFirebaseUid(x)` (strips a `user-`
prefix only; `person-`/`guest-`/`anonymous` ids map to themselves).
Let `P = { uid(p.id) for p in B.people }`.

- **I1 — Assignee closure.** For every item id `k` and every `a` in
  `B.itemAssignments[k]`: `uid(a)` is in `P`.
- **I2 — Distinct participants, and distinct assignees.**
  `|P| == len(B.people)`, **and** for every `k`, `B.itemAssignments[k]` has no
  duplicate under `uid`. *(The second half was missing in rev 1. Measured: item
  $30, `{i1:['a','a']}`, people `[a,b]` gives a owes $30.00, b owes $0.00,
  with I1 and participant-distinctness both intact.)*
- **I3 — Payer is a participant.** `uid(B.paidById ?? B.ownerId)` is in
  `P` union `{ uid(B.ownerId) }`.
- **I4 — Settled ids are participants.** Every `s` in `B.settledPersonIds`
  satisfies `uid(s)` in `P`, **and** `unsettledParticipantIds` is consistent
  with `settledPersonIds` under `uid`. *(Second half was missing: it is a
  SECOND independent record of settledness and is what the debtor's UI reads,
  `src/utils/billCalculations.ts:183-197`.)*
- **I5 — Derived-split coherence.** If `B.isSimpleTransaction` **and not**
  `B.splitEvenly`, then `len(B.billData.items) == |P|` and every item has
  exactly one assignee. *(Restated: rev 1 keyed this on `splitMethod`, which
  **is not persisted anywhere** — `grep splitMethod src/types functions/src
  shared` returns zero hits. It exists only as React state, so the choke point
  could never have evaluated it.)*
- **I6 — Derived totals must sum.** If `B.isSimpleTransaction`, then
  `|sum(items.price) - B.billData.subtotal| <= 0.01`. *(Only for DERIVED
  items. A receipt-scanned bill may legitimately diverge — that is the discount
  path — so this must NOT be a global rule.)*
- **I7 — Usable total.** If `sum(items.price) > 0` then `B.billData.total > 0`.
  *(Closes the `total: 0` + `splitEvenly` total-loss above.)*
- **I8 — Non-degenerate basis.** If any item is assigned then
  `sum(items.price) > 0`. *(Closes the `[+20, -20]` case:
  `calculations.ts:45` guards `totalItemsSubtotal > 0 ? ... : 0`, so every
  proportion collapses to 0 and tax+tip are charged to nobody. Measured:
  sum of personTotals = $0.00 against a $5.00 declared total, with I1 and full
  assignment holding.)*

### Conservation — stated correctly this time

Revision 1 claimed "I1 implies money is conserved." **That is false**; three
counterexamples were verified. The true statement:

> **I1 and I2 and I8 and (every item has >=1 assignee) and NOT `splitEvenly`**
> implies `sum(personTotals.total) == sum(items.price) + tax + tip + otherFees`

Three things rev 1 got wrong:

1. The right-hand side is the **component sum, not `billData.total`**. Measured
   legitimate counterexample: items `[100]`, tax 10, `total: 90`, all assigned
   gives sum = $110.00 vs a declared $90.00. An oracle keyed on
   `billData.total` fails on a legitimate discount bill.
2. **`all items assigned` is a required hypothesis.** The tax/tip denominator
   is the sum of *all* item prices (`calculations.ts:41`), by design, so a
   partially claimed bill under-collects tax/tip with I1 fully intact. That is
   intended behaviour, so it must be a hypothesis, not an invariant.
3. **`NOT splitEvenly` is required**, because that branch ignores
   `itemAssignments` altogether.

### Which invariant catches which historical bug

| Round | Bug | Caught by |
| --- | --- | --- |
| original | stale draft payload erased a guest | I1 |
| 2 | stale `itemAssignments` / `paidById` on a parked write | I1, I3 |
| 4a | removal never purged assignments on a manual bill | I1 |
| 4b | simple-transaction removal left the derived item | I1, I5 |
| 5 | removal rebuilt items from a stale amount map | **I6** |
| sweep | `paidById` written raw and unvalidated | I3 |
| sweep | `claimShadowUser` id-form mismatch | I4 |
| this review | `total: 0` under `splitEvenly` | **I7** |
| this review | `[+20, -20]` zero-basis | **I8** |
| this review | duplicate assignees in one item | **I2** |

I6, I7, I8 and half of I2 exist **only because the spec was reviewed before
being implemented.** None were in revision 1.

---

## 3. Where enforcement goes — the design rev 1 got wrong

Revision 1 said "one choke point: `billService.updateBill`, validating the
merged state." **That is unimplementable as written.** Verified at
`src/services/billService.ts:352-370`: when `updates.people` is absent,
`updateBill` is a plain `updateDoc` with **no read and no transaction**. The
`runTransaction` exists *only* on the `people` branch. So the merged candidate
is unavailable for precisely the writes that matter most —
`itemAssignments`-only, `billData`-only, `paidById`-only.

And `updateBill` is not the only writer. These bypass it entirely:
`toggleItemAssignment` (`:486`), `setItemAssignment` (`:516`), `joinBill`
(`:426`), `updatePersonDetails` (`:530`), every Cloud Function
(`createBillCore`, `claimShadowUser`, `leaveBillAsGuest`, `updateGuestName`,
`reassignOwnedBills`, the recurring generator), and — per
`firestore.rules:342` plus `:178-181` — an **unauthenticated holder of a
6-char share code**, who can `updateDoc` `people`, `itemAssignments` and
`splitEvenly` directly.

### Two enforcement points, and the authoritative one is the server

**Primary — `functions/src/ledgerProcessor.ts`, Stage 1.** The only place that
sees **every** write from **every** writer: client, Admin SDK, and anonymous
rules-permitted. It already loads the bill, already computes `personTotals`,
and already calls `validateBillAmounts` (`ledgerProcessor.ts:257, 561, 1008`).
On a violation it must **refuse to apply the footprint** and flag the bill
rather than committing wrong money. This is the line that protects the ledger.

**Secondary — `billService.updateBill`, for UX.** Make it *unconditionally*
transactional (read-validate-write on both branches) so a bad write is
repaired or dropped before it lands, giving immediate local feedback. A
convenience layer, not the guarantee.

**Honest scope limits:**
- `toggleItemAssignment` uses `arrayUnion` with an opaque sentinel. A client
  cannot validate it without a read, and adding one defeats its purpose (it
  exists to be contention-safe). Covered by the server backstop only.
- `firestore.rules` cannot express any of I1-I8: no cross-field iteration.
  Rules remain **access** control. Note the access control itself hands
  anonymous share-code holders the money-mutating fields — see section 6.

### Failure policy: FAIL SAFE, never fail closed

Established the hard way in round 2: every caller swallows errors
(`src/hooks/useBills.ts:159-166` catches, toasts, returns `null`), so
**throwing discards the whole payload** — for `handleAnalyze` that is an entire
receipt scan.

| Violation | Client (`updateBill`) | Server (`ledgerProcessor`) |
| --- | --- | --- |
| I1 non-person assignee | **Repair**: drop those assignees, write the rest | Drop from the computation; log |
| I1 `people` drops someone assigned | **Strip** `people`, report `peopleStripped` | n/a |
| I2 duplicate participant (I2a) | **LOG ONLY.** De-duplicating `people` while both id forms remain in `itemAssignments` IS the ghost bug, so the repair would have to rewrite assignments in the same write. Left to the server. Distinguished from I2b by `v.ids`: I2b reports the ITEM id, I2a the duplicated uid. | De-duplicate before computing |
| I2 duplicate assignee in an item | **Repair**: de-duplicate | De-duplicate |
| I3 payer not a participant | **Fall back to `ownerId`** — NOT keep-stored: the stored anchor may *be* the removed person. The code already does this at `SimpleTransactionWizard.tsx:288-295` | Anchor on `ownerId` |
| I4 settled id not a participant | Log only | Log; do not settle a non-participant |
| I5 / I6 / I7 / I8 arithmetic | **LOG ONLY — reversed from rev 2.** Dropping the `billData` key makes `updateBill` resolve while discarding the user's edit; `useBillSession` then marks it saved and never retries, so the UI shows items the server lacks. Reachable via a refund line (I8) or an AI-extracted comped total (I7) — real data loss to prevent a ledger error. The bill is the user's record; the LEDGER is what must not move. Persist it and let the server refuse. | **Refuse the footprint**; flag |

Every repair is reported back, because a silent *resolve* defeats
`usePeopleAdditionQueue`, which re-queues only on a **rejected** promise (the
lesson of round 2). Extend the existing contract:

```ts
Promise<{ peopleStripped: boolean; repaired: InvariantViolation[] }>
```

---

## 4. The (write path x field) matrix

Audit checklist. "stale?" = can the value be captured before an `await`, or
read from a render closure a snapshot has since superseded.

| Write path | `people` | `itemAssignments` | `billData` | `paidById` | `settledPersonIds` | `splitEvenly` |
| --- | --- | --- | --- | --- | --- | --- |
| fn **`createBillCore`** (`billFunctions.ts:218`) | yes | yes | yes + `validateBillAmounts` | normalized, **membership NOT checked** | `[]` | yes |
| `bill-wizard/hooks/useBillSession` autosave | create only | **only when `splitEvenly`** | yes | truthy-gated (cannot clear) | - | yes |
| `BillWizard.handleRemovePerson` | shrink, flagged | purged, same write | - | - | - | - |
| `BillWizard.persistPeopleAddition` | additive | - | - | - | - | - |
| `BillWizard` split-evenly self-heal | - | whole-value | - | - | - | - |
| `BillWizard.handleAnalyze` (`:673`) | stale -> stripped | **yes** | yes | **yes** | - | - |
| **`BillWizard.performImageRemoval`** (`:590`) | **unflagged** | `{}` | **`null`** | yes | - | - |
| `handleToggleSplitEvenly` (`BillWizard:387`) | - | yes | - | - | - | **yes** |
| `AirbnbWizard.*` | as BillWizard | as BillWizard | **no analyze/image path** | yes | - | yes |
| `SimpleTransactionWizard` autosave | guarded | derived, stale | derived, stale | stale | - | derived |
| `SimpleTransactionWizard.handleRemovePerson` | shrink, flagged | rebuilt together | rebuilt together | re-anchored | - | rebuilt |
| `SimpleTransactionWizard.handleEventChange` | replace, flagged, non-empty floor | - | - | - | - | - |
| `SimpleTransactionWizard.handleComplete` (`:628`) | yes | yes | yes | yes | - | yes |
| `CollaborativeSessionView.handleRemovePerson` | shrink, flagged, **400ms debounced** | per-item `arrayRemove`, **immediate** | - | - | - | - |
| `CollaborativeSessionView.handleClaimItem` | - | atomic | - | - | - | yes |
| `AIScanView` / `AirbnbView` event conversion | replace, flagged, **no non-empty floor** | `{}` | - | - | - | - |
| `useBills.saveSession` create path (`:146`) | yes | **second write** | yes | **silently dropped** | - | yes |
| `billService.setItemAssignment` (`:516`) | - | per-item replace | - | - | - | - |
| `billService.toggleItemAssignment` (`:486`) | - | atomic | - | - | - | - |
| `billService.joinBill` (`:426`) | `arrayUnion` | - | - | - | - | - |
| `billService.updatePersonDetails` (`:530`) | in-txn map | - | - | - | - | - |
| Review steps x3 + `GuestClaimView` x2 | - | - | - | - | `arrayUnion`/`arrayRemove` | - |
| fn `joinBillAsGuest` (`:395`) | `arrayUnion` | - | - | - | - | - |
| fn `leaveBillAsGuest` (`:559`) | in-txn replace | **in-txn whole-map replace** | - | - | - | - |
| fn `updateGuestName` (`:658`) | in-txn replace | - | - | - | - | - |
| fn **`claimShadowUser`** (`:713`) | batch replace, **dedupes by exact id** | batch replace | - | conditional | **bare uid — id-form bug** | - |
| fn **`reassignOwnedBills`** (`accountDeletion.ts:305`) | batch replace | - | - | **set to the DELETED uid** | - | - |
| fn recurring generator (`recurringBillProcessor.ts:77`) | from template | **derived** unless `template.billData` | **derived** | defaulted by `createBillCore` | `[]` | derived |
| fn settlement processors | - | - | - | - | yes | - |

**The rule this encodes:** a path may write a money field only if it (a) writes
every field it affects in the SAME payload, or (b) uses an atomic operator.
Mixing a whole-value replace into a debounced write is what clobbered
concurrent claims in round 4.

**Known violation of that rule, narrowed not closed:**
`CollaborativeSessionView.handleRemovePerson` sends `people` through the 400ms
debounce while purging assignments immediately. Ordering is favourable and each
purge failure is logged, but a mid-loop failure leaves a ghost. Relatedly,
`allowPeopleRemovalRef` (`src/hooks/useBillSession.ts:33,144`) latches **per
batch, not per field**.

---

## 5. Test strategy

Revision 1 claimed "the 1061 unit tests run serially and therefore cannot
reproduce a race." **That was wrong.** `vitest.config.ts` defines a jsdom
`react` project that **is** in `npm test`, and
`tests/react/usePeopleManager.race.test.tsx` and
`tests/react/useBillSession.peopleLoss.test.tsx` already reproduce both round-4
races **deterministically**, by hand-deferring a promise. That layer is cheaper
than the emulator and is in CI today.

Three layers:

1. **Unit — `checkBillInvariants`.** Pure, exhaustive: mixed id forms,
   duplicates in both `people` and assignee lists, empty, guest-prefixed ids,
   negative prices, zero basis, absent `billData`.
2. **Property (`fast-check`) — the invariants and the conservation theorem.**
   Oracle: the **component sum** on the itemized path; `billData.total` only on
   the `splitEvenly` discount path. Also generate the repair outputs and assert
   repair is **idempotent** and never introduces a new violation (the I2 -> I1
   trap).
   **Descoped from rev 1:** "random operation sequences through the real
   reducers" is not implementable — **there are no reducers.** State lives in
   `useState` closures and "remove person" has four divergent implementations
   (`BillWizard:511`, `CollaborativeSessionView:106`,
   `SimpleTransactionWizard:241`, `AirbnbWizard:454`). Extracting
   `applyBillOperation(bill, op) => bill` is a **prerequisite**, and is
   arguably worth more than the property test because it also collapses those
   four. Tracked as a follow-up, not attempted here.
3. **jsdom race harnesses — concurrency.** Extend the two existing ones: two
   clients with differently-normalized rosters (round-4 storm), and a removal
   racing a claim (round-4 clobber). Emulator reserved for cross-process
   trigger behaviour (`triggerLoop`'s `MAX_PASSES` already fails a
   non-quiescing pipeline, which is the storm's signature).

### Definition of done

- `checkBillInvariants` is pure, in `shared/`, covering I1-I8.
- Enforced in `ledgerProcessor` Stage 1 (authoritative) and in a now
  unconditionally-transactional `updateBill` (UX).
- Property tests run in `npm test`.
- Every repair path is mutation-tested: disabling it must kill a named test.
- **Deploy note:** touching `functions/` or `shared/` matches
  `deploy-backend.yml`'s path filter and **deploys to production Firebase**.
  The client half does not. Ship these separately, server first.

---

## 6. Known gaps this spec does NOT close

1. **`claimShadowUser` resurrects paid debt.** `functions/src/billFunctions.ts:741`
   pushes a **bare** `realUserId` into `settledPersonIds` while `:758` writes
   `people[].id = user-<realUserId>`; `shared/ledgerCalculations.ts:86` matches
   by bill-local id, so the match fails and — because `processedBalances` was
   cleared — the next pass recomputes `delta = +fullTotal`. **A guest settles,
   then signs up, and their debt comes back.** Core funnel.
2. **`claimShadowUser` can create a duplicate participant.** Its dedupe
   (`:763-770`) is by **exact** `p.id`. If the real user was already present in
   bare form — 59% of production bills carry at least one bare id — the claim
   leaves both forms in `people`, an Admin-authored I2 violation. Downstream,
   `shared/ledgerCalculations.ts:99` **assigns** rather than accumulates, so
   one share is silently dropped. It is also a `db.batch()` over a plain query,
   not a transaction.
3. **Anonymous share-code holders can mutate money fields.**
   `firestore.rules:342` plus `:178-181` let an **unauthenticated** holder of a
   6-char code whole-value replace `people` and `itemAssignments` and flip
   `splitEvenly`, bypassing `billService` entirely. Per section 1, flipping
   `splitEvenly` alone reassigns money.
4. **Rules let clients write the ledger's own bookkeeping.**
   `firestore.rules:344-356` gives full field access to the owner **and any
   event member and any squad member** — including `processedBalances`,
   `_ledgerVersion`, `processedBalancesAnchorId`. The comment claiming these
   are server-only is aspirational.
5. **`reassignOwnedBills` sets `paidById` to the deleted user's uid**
   (`accountDeletion.ts:305-318`) — an I3 violation by construction.
6. **The recurring generator creates money-bearing bills unattended with I3
   unenforced**, because the membership check lives in the `createBill`
   *callable*, not in `createBillCore`.
7. **`firestore.rules` has no tests** for any cross-field integrity.
8. **Integration tests are not wired into CI.**
9. **No invariant bounds a per-person share.** Items `[100, -90]`, tax 10,
   assigned to a/b gives a owes **$200.00**, b owes **-$180.00**. Conserved,
   but absurd.
