# claimShadowUser: settled debt comes back, and participants get duplicated

**Status:** COMPLETE (uncommitted, awaiting user review)
**Workspace:** /Users/simran/Documents/GitHub/Bill-Split
**Updated:** 2026-10-09

## Goal

When a guest (shadow user) **has already settled** and then signs up, their debt
must stay settled, and the claim must never leave the same human in `people`
twice. This is the core sign-up funnel and runs via the Admin SDK, so the
client-side checks and the ledger backstop (I4 is log-only) do not protect it.

## Done (previous task, for context only)

Bill money invariants I1-I8 shipped and verified on prod by the user:
`210d50a`, `51fc072`, `69864b4`, `4933f2b`. Spec: `docs/plans/bill-money-invariants.md`
(this bug is §6 items 1 and 2). Tree clean at `4933f2b`.

## The bugs (verified by reading code, NOT yet reproduced by a test)

All in `functions/src/billFunctions.ts`, `claimShadowUserCore` (`:675`):

1. **Settled debt resurrected.** `:738-742` moves the shadow id in
   `settledPersonIds` to the **bare** `realUserId`, but `:754-760` rewrites
   `people[].id` to **`user-${realUserId}`**. The ledger matches settledness by
   EXACT bill-local id (`shared/ledgerCalculations.ts:~86`:
   `settledPersonIds.includes(total.personId)`), so the person no longer counts
   as settled and the next pass charges the full amount again.
   - Also: the shadow may be stored in `settledPersonIds` as `user-<shadow>`
     (bill-local form). `:739` only checks the bare form, so that entry is left
     pointing at an id that no longer exists in `people`.
2. **Duplicate participant.** Dedupe at `:762-769` is by EXACT `p.id`. If the
   real user is already on the bill as bare `<realUid>` (59% of prod bills carry
   a bare id), the result has both `<realUid>` and `user-<realUid>`. Downstream,
   `shared/ledgerCalculations.ts:~99` **assigns** rather than accumulates per
   uid, so one share is silently dropped. Same exact-match issue for
   `itemAssignments` (`:782-794` checks both forms for the shadow but only
   prevents duplicates, it doesn't merge the real user's two forms) and
   `settledPersonIds`.
3. It's a `db.batch()` over a plain query, not a transaction. Note it; fix only
   if cheap.

## Convention to match (verified)

`settledPersonIds` holds the **bill-local `people[].id`, exactly as stored**:
- `settlementReversal.ts:92` matches `settledPersonIds.includes(p.id)` and
  removes with `arrayRemove(person.id)` (`:110`)
- `eventSettlementProcessor.ts:170` checks `includes(debtorPersonId)`

So the fix belongs in the claim (write the same id it writes to `people`), not
in loosening the ledger's comparison — changing the ledger would also change
settlement/reversal semantics. If you think otherwise, propose it; don't just do it.

## Not yet done (in order)

1. Read `tests/integration/claimShadowUser.int.test.ts` (5 existing tests) and
   the helpers it uses.
2. **Write failing integration tests first** (CLAUDE.md rule 2/2a), asserting a
   SPECIFIC surviving value, not absence:
   - seed a bill, shadow owes $X, settle, confirm pair balance 0 → claim →
     pipeline quiesces → balance **still 0** (today: back to $X).
   - same with shadow stored as `user-<shadow>` in `settledPersonIds`.
   - real user already present as bare `<realUid>` + shadow on the bill → claim →
     `people` has exactly one entry for realUid; itemAssignments have no
     duplicate of that human; balance equals the expected merged share.
   Confirm each FAILS on current code before fixing.
3. Fix in `claimShadowUserCore`: decide the surviving bill-local id per bill
   (prefer the real user's existing entry if present, else `user-<realUid>`);
   rewrite `people`, `itemAssignments`, `settledPersonIds`, `paidById` (check
   whether it's rewritten at all — look past `:795`), and dedupe all by
   `personIdToFirebaseUid`. Consider merging the two people's assignments.
4. Run the pure checker over the claimed bill in the test:
   `checkBillInvariants` (`shared/billInvariants.ts`) must return no I1/I2/I3/I4.
5. Mutation-test: revert each part of the fix, a named test must fail.
6. Gates (functions + shared touched): `npm test`, `npm run typecheck` (≤36),
   `npm run lint` (≤71 problems), `npm --prefix functions run build`,
   `npm run test:integration` (baseline 22 files / 280 tests).
7. Adversarial review subagent. Backward-compat: existing prod bills already
   claimed with the bad form — read-only audit count only (DB purge planned,
   no repair needed per user).

## Failed approaches — DO NOT REPEAT (lessons from the previous task)

| What was tried | Why it failed | Root cause |
| --- | --- | --- |
| Asserting "no balance doc exists" after a bad write | Green with the fix disabled | Many bad states also compute to zero; assert a prior value SURVIVED |
| Mocking `arrayUnion` as `(x) => x` in unit tests | Hid a prod regression (settling broke) | FieldValue sentinels are opaque in reality; mocks must stay opaque |
| Assuming people ids are stable | Guard would have bricked 13 prod bills | `ensureUserInPeople` rewrites the viewer's id bare→`user-` in place; always compare via `personIdToFirebaseUid` |
| Fixing one field (`people`) and leaving siblings | Same money symptom via `itemAssignments`/`paidById` | A person's id lives in 4-5 fields; rewrite them together |

## Code context

```ts
// functions/src/billFunctions.ts
export async function claimShadowUserCore(db: Firestore, realUserId: string, shadowUserId: unknown)
export const claimShadowUser = onCall(...)  // :834, calls the core with request.auth.uid

// shared/ledgerCalculations.ts
export function personIdToFirebaseUid(personId: string): string  // strips 'user-'

// shared/billInvariants.ts
export function checkBillInvariants(bill: BillInvariantSubject): InvariantViolation[]  // I1-I8, never throws
```

## Resume instructions

1. `git status --short && git log --oneline -1` → expect clean, `4933f2b` (or later if the user committed).
2. `sed -n 675,850p functions/src/billFunctions.ts` → the whole core.
3. `npm run test:integration -- claimShadowUser` → expect 5 passing (baseline).
4. Write the failing tests from step 2 above → expect them RED.

## Warnings

- **Touching `functions/` or `shared/` and pushing to `main` auto-deploys to PROD.**
  Never commit/push unless the user says so. Optional beta deploy:
  `firebase deploy --only functions --project beta`, then restore with `firebase use default`.
- Run gates with `.env` moved aside and restored in the SAME command.
- `useBills.ts` and some files are CRLF; edit with byte-preserving tools.
- Integration tests need Java and are not in CI; run them locally.

## Outcome (2026-10-09, resumed session)

Fixed in `mergeClaimedIdentity` (`functions/src/billFunctions.ts`): one survivor id per bill
(the real user's existing entry, else `user-<realUid>`) across people / itemAssignments /
settledPersonIds. The merged person is settled only if EVERY merged entry was settled; a mixed
state leaves the debt open and logs `logger.warn`. 5 new integration tests, RED before the fix;
8/8 mutants killed. Gates: unit 1121/1121, integration 285/285, typecheck 35 (≤36), lint 69 (≤71),
functions build OK. Adversarial review: no blockers.

Open (not fixed, existing before this change): simple-transaction bills with both the guest AND the
real user hit I5 after the merge (per-person items not rebuilt); `settlements` records keep
`fromUserId=<shadow>`, so a guest's pre-signup settlement can't be reversed after the claim;
no test coverage for event bills/`processedEventBalances`; a still-non-transactional batch.

**Open — security (deferred by user 2026-10-09):** the claim is unauthenticated. Identity comes from a
case-insensitive name match on the share link (`JoinSession.tsx:171`) stored in localStorage, and the
server checks only `isShadow`, so any signed-in user holding a shadow uid absorbs that guest's bills
from EVERY creator, irreversibly. Proposed fix: A (require verified email/phone match when the shadow has
contact info) + C (otherwise move only the bill whose share code was used); B (server-issued claim token)
is the full fix. Write the failing "stranger claims a guest" test first.
