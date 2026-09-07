# In-app account deletion — Design

**Date:** 2026-09-05
**Status:** Implemented 2026-09-06
**Depends on:** `2026-09-05-sign-in-with-apple-design.md` (Apple token revocation)

## Why

App Store Review Guideline 5.1.1(v):

> If your app supports account creation, you must also offer account deletion
> within the app.

Apple's account deletion support page:

> Starting June 30, 2022, apps submitted to the App Store that support account
> creation must also let users initiate deletion of their account within the app.

> Offer to delete the entire account record, along with associated personal data.
> You may include additional options, but only offering to temporarily deactivate
> or disable an account is insufficient.

> Apps not operating in highly regulated industries should not require people to
> make a phone call, send an email, or go through other support flows.

> Apps that support Sign in with Apple should use the Sign in with Apple REST API
> to revoke user tokens.

Divit has no deletion flow anywhere in `src/` or `functions/src/`, and
`src/pages/PrivacyPolicy.tsx` currently directs users to **email** for deletion —
which is exactly the support flow the guideline prohibits.

## Deletion model: tombstone

Chosen over full purge and over gating on settled balances.

**Rejected — full purge with footprint reversal.** Reversing the deleted user's
ledger footprint and removing them from every bill retroactively rewrites *other
people's* financial records. A $120 dinner split three ways silently becomes a
two-way split on a counterparty's saved bill, and the arithmetic on their
history stops adding up.

**Rejected — block deletion until balances are zero.** Holds an account hostage
over a disputed $4, and reads to a reviewer as the support-flow gate that
5.1.1(v) forbids.

**Chosen — tombstone.** The Firebase Auth account is deleted, the Apple token is
revoked, every piece of the user's personal data is stripped, and a minimal
non-authenticatable record remains so counterparties' bills and balances stay
correct. This is what Splitwise and Venmo do. It satisfies Apple's actual test:
the account is gone and the person can never sign in again.

The residue is genuinely joint data. Apple's own wording allows retaining what
cannot be erased, and a shared bill is as much the counterparty's record as the
deleted user's. This must be stated plainly in the privacy policy (§6).

## 1. Client sequence

`SettingsView` → Profile tab → a "Danger zone" card at the bottom.

1. **Confirm dialog.** States what survives: bills remain on friends' accounts,
   outstanding balances are not cleared, sign-in is permanently removed, this
   cannot be undone.
2. **Balance warning, not a gate.** If any non-zero balance exists, name it:
   *"You owe Alex $23.00. Deleting your account won't settle this."* The user may
   still proceed. No balance gate — see the rejected option above.
3. **Two-step confirm.**
4. **Reauthenticate** with the user's existing provider, capturing the Apple
   authorization code if they use Apple. Enforced server-side too — see
   "Re-authentication is enforced server-side" below.
5. **Revoke the Apple token** server-side against Apple's REST API.
6. **Call the `deleteAccount` callable.**
7. **Sign out**, navigate to the landing page, confirmation toast.

### Revocation goes through our own Cloud Function, not Firebase

The original plan was `FirebaseAuthentication.revokeAccessToken({ token })`,
which requires the **OAuth code flow configuration** to be filled in the
Firebase console. That turns out to be unavailable to us: Firebase blocks saving
those fields unless a **Services ID** is also set, and a Services ID is a
web-sign-in object this iOS-only app deliberately does not have. See
`2026-09-05-sign-in-with-apple-design.md` §5 for the full reasoning and the
decision.

So the client sends the Apple authorization code to our own callable, which
exchanges and revokes it against Apple directly:

1. Client reauthenticates with Apple, capturing
   `credential.authorizationCode` — documented by the plugin as *"Only available
   for Apple Sign-in on iOS."*
2. Client passes it to `deleteAccount`.
3. The function builds a client secret: an **ES256 JWT** signed with the `.p8`,
   with `iss` = Team ID `3LAJCPKLNV`, `kid` = Key ID `2PJ6RGN66M`, `aud` =
   `https://appleid.apple.com`, `sub` = `com.singhkapoortech.divit`.
   For a native app the `client_id` is the **bundle identifier**, not a
   Services ID — which is precisely why no Services ID is needed.
4. `POST https://appleid.apple.com/auth/token` to exchange the authorization
   code for a refresh token, then `POST https://appleid.apple.com/auth/revoke`
   to revoke it.

The `.p8` is stored as a Firebase secret
(`firebase functions:secrets:set APPLE_SIGNIN_PRIVATE_KEY`) and never committed.

Firebase does **not** store Apple tokens, which is why revocation must happen at
deletion time off a fresh reauthentication rather than from a token saved at
sign-up. That is the better design regardless: no long-lived Apple token in the
database.

**Not verified.** The revoke round-trip needs a real Apple authorization code,
which only a physical device produces. It is not to be claimed as working until
observed succeeding. Apple returns HTTP 200 with an empty body on success, so
the test must assert on the status code, not on a payload.

## 2. Server cascade — `deleteAccount` callable

Admin SDK. Idempotent. Paginated queries, batches capped at 400 writes.

**The Firebase Auth user is deleted last.** A failure partway through leaves a
working account the user can retry with, rather than an orphaned ledger with no
owner.

**Events are processed before bills.** Deleting an event cascade-deletes its
bills via `eventDeleteProcessor`, so transferring a bill to an heir and then
deleting its event would destroy the bill moments after handing it over.

| Collection | Action | Why |
| --- | --- | --- |
| `users/{uid}` | Tombstone (§3) | Counterparty friend rows hydrate from this doc |
| `events` owned, other members | Transfer ownership to a live member | Deleting would destroy other members' event |
| `events` owned, sole member | Delete | Existing `eventDeleteProcessor` handles the cascade |
| `events` member of, not owner | Remove uid from `memberIds` | |
| `bills` owned, any live person can reach it | Transfer `ownerId` to a live heir | Rules give the owner full access; an ownerless bill is uneditable |
| `bills` owned, genuinely private | Delete | Nobody else can see it |
| `bills` owned, event being deleted | **Skip** | `eventDeleteProcessor` cascades it |
| `bills` participated in | **Untouched** except `people[].venmoId` | Counterparty's record — but a live payment handle must not survive |
| `balances` | **Untouched** | Shared doc the counterparty reads |
| `event_balances` | **Untouched** | Same |
| `settlements` | **Untouched** | Immutable by design; holds uid + amount, no PII |
| `settlement_requests` | Delete pending ones involving the user | Actionable items pointing at a dead account |
| `eventInvitations` | Delete those addressed to or created by the user | Contains the user's email |
| `squads` | Remove the user; delete only if last member | Squads have no owner — deleting every squad in `squadIds` would destroy groups others still use |
| `recurring_bills` owned | **Delete** | Otherwise they keep generating bills for a deleted account |
| Storage `receipts/{uid}/**` | Delete all objects | Receipt images are personal data |
| `feedback` | Strip uid, retain text | |
| Firebase Auth user | Delete **last**, then set `authDeleted` | See idempotency below |

### Choosing an heir is not just `participantIds`

Reading `participantIds` alone deletes records other people still use, in two
real production shapes:

- **Event bills.** `firestore.rules` grants access to any event member through
  `hasEventIdAndMember`, entirely independently of `participantIds`. An event
  bill split among unlinked guest names has `participantIds: [leaver]`.
- **Legacy bills.** Bills predate `participantIds` — the rules still guard for
  its absence — and the pipeline derives uids from `people[]` in that case, so
  such a bill really does carry a footprint against a live counterparty.

Heir candidates are the union of `participantIds`, `people[]` ids,
`members[].userId`, and for event bills the event's `memberIds`.

### Transferring ownership must not move the debt

The ledger anchors on `paidById || ownerId`, and `ownerId` is in the pipeline's
`RELEVANT_FIELDS`. Reassigning ownership of a bill with no explicit `paidById`
therefore makes the pipeline reverse the leaver's footprint and re-apply it
against the heir — "Bob owes Sarah $30" silently becomes "Bob owes Carol $30".
When transferring such a bill, `paidById` is pinned to the leaver's uid.

Transferred bills also get `receiptImageUrl` / `receiptFileName` cleared, since
the underlying Storage objects are deleted in the same pass.

### Idempotency keys on `authDeleted`, not `isDeleted`

An earlier version short-circuited on `isDeleted`. Because the tombstone is
written just before the auth account is destroyed, a failure in that last step
produced a **zombie**: a tombstoned profile whose owner could still sign in, and
whose PII `syncUserProfile` then wrote straight back. Every retry short-circuited
before reaching the step that had failed.

Now `isDeleted && authDeleted` means done; `isDeleted` alone means resume at the
auth deletion only, and `auth/user-not-found` counts as success. Separately,
`buildProfileUpdates` refuses to write to any document carrying `isDeleted`, so
a surviving session can never restore the stripped fields.

### Re-authentication is enforced server-side

The client re-authenticates first, but the Admin SDK does not enforce login
recency the way the client SDK does, so that alone is advisory — an old ID token
would suffice. The callable rejects any request whose `auth_time` is more than
10 minutes old.

Other users' `friends` arrays retain the uid deliberately, so a counterparty
keeps visibility of money owed. The row renders with a "deleted account"
affordance and can be removed manually.

`receiptAnalysisCache` is content-keyed, not user-keyed — confirm during
implementation and leave alone if so.

## 3. Tombstone shape

```
users/{uid} = {
  uid,
  displayName: <first name only>,
  isDeleted: true,
  deletedAt: <serverTimestamp>,
  friends: [],
  squadIds: [],
}
```

Stripped: `email`, `username`, `photoURL`, `hasCustomPhoto`, `venmoId`,
`phoneNumber`, `hasSeenOnboarding`.

`username` is released so the handle becomes available again and
`searchUsersByUsername` can no longer surface the deleted user.

**First name is retained deliberately.** It is already denormalized onto every
bill's `people[]` array, so blanking it here buys effectively no privacy while
breaking every counterparty's friends list and balance row into an
unattributable "??? owes you $23".

### `isShadow` must NOT be set — security

`claimShadowUser` (`functions/src/billFunctions.ts:592`) gates only on
`isShadow === true`, takes `shadowUserId` directly from client input, and
accepts any authenticated caller. Setting `isShadow: true` on a tombstone would
let any Divit user who knows a deleted person's uid claim their entire ledger —
bills, balances, and ledger position.

Therefore:

- The tombstone uses a distinct `isDeleted` flag and leaves `isShadow` unset.
- `claimShadowUser` gains an explicit rejection when `isDeleted === true`.

A failing test proving the hole is written **before** the guard, per the
Production Readiness Gate in `CLAUDE.md`.

**Pre-existing, out of scope, flagged:** even for genuine shadow users,
`claimShadowUser` lets any authenticated caller claim any shadow uid with no
proof of association. That weakness predates this work and is not addressed
here.

## 4. Firestore rules

A tombstoned `users` doc must remain readable by the people who list the deleted
user as a friend, or their friends lists break. Verify current rules already
permit this; if read access is owner-only, friend hydration is already broken
today and the deletion flow will surface it.

## 5. UI copy

The dialog must not overstate erasure. Draft:

> **Delete your account?**
>
> This permanently removes your Divit account and your personal information.
> You will not be able to sign in again.
>
> Bills you shared with friends stay on their accounts, and any balances between
> you are not cleared by deleting.
>
> This cannot be undone.

## 6. Privacy policy

`src/pages/PrivacyPolicy.tsx:237-238` and `:263-264` promise email-based
deletion within 30 days. That contradicts the shipped binary and is itself a
rejection risk — reviewers compare the listing, the policy, and the app.

Rewrite to describe the in-app flow and state what survives deletion:

- bills and balances shared with other users, as those users' records;
- immutable settlement records containing amounts and account identifiers.

## 7. Testing

Security properties get a **failing test first**, per `CLAUDE.md`.

| # | Test | Kind |
| --- | --- | --- |
| 1 | `claimShadowUser` succeeds against an `isDeleted` tombstone → **must fail before the guard exists**, pass after | Integration |
| 2 | A counterparty's `balances` doc is unchanged before vs. after a deletion | Integration |
| 3 | Deleting an event owner who has other members transfers ownership instead of cascading | Integration |
| 4 | Deleting an event owner with no other members cascades via `eventDeleteProcessor` | Integration |
| 5 | Deleting a bill owner with other participants transfers `ownerId` | Integration |
| 6 | Owned `recurring_bills` stop generating after deletion | Integration |
| 7 | Tombstoned `users` doc still readable by a friend | Rules |
| 8 | Cascade runs against a bill written before this change, with no `participantIds` | Integration, backward compat |
| 9 | `deleteAccount` called twice is a no-op the second time | Integration, idempotency |
| 10 | Apple token revocation succeeds | Manual, physical device |

Full gate before handoff: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build`, `npm --prefix functions run build`, `npm run test:integration`,
`npm run test:rules`, plus an adversarial subagent review per `CLAUDE.md` step 3.

## 8. Deployment note

`functions/` and `firestore.rules` are both inside the `deploy-backend.yml` path
filter. Pushing this to `main` **auto-deploys to production** and also builds and
uploads a draft AAB to Play. No new required fields are introduced on existing
documents, so no migration is needed — the tombstone only ever writes to a
document at deletion time.

## 9. Open risks

- **Revocation token type unverified** (§1).
- **Scale.** A user with thousands of bills exercises the pagination path. The
  callable has a 60s default timeout; raise it and confirm the batching holds.
- **Tombstone is not GDPR erasure in the strictest reading.** Defensible because
  the residue is joint data, but it is a judgment call, and the privacy policy
  must be honest about it rather than claiming full erasure.
