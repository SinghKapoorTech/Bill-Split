# Email + Password Authentication — Design

**Date:** 2026-09-07
**Status:** Approved for implementation
**Related:** `docs/superpowers/specs/2026-09-05-sign-in-with-apple-design.md`

## Problem

A user who signs up in the iOS app with Sign in with Apple cannot sign in to
`divit-bill.com` in Chrome. Apple sign-in ships on iOS only (`shouldOfferApple`
returns true for `ios` alone — no Apple Services ID or return URL is configured
for the web), so today the web build renders a notice telling them the account
lives in the iOS app and nothing more.

Adding a plain email/password signup does **not** fix this. If that user creates
an email/password account in Chrome, Firebase mints a **second uid**. The ledger
is keyed on uid, so they get a second set of bills, `balances`, `event_balances`,
friends and squads, and their real balances stay stranded on the Apple identity.
`src/utils/authProviders.ts:86` already documents this hazard for the
Google/Apple pair. Shipping standalone signup alone would make it worse, not
better: the current notice at least tells the truth.

Two separate capabilities are therefore in scope.

## Scope

**A. Email/password as a first-class sign-up and sign-in method.** New users, any
platform. Includes password reset.

**B. "Add a password to my existing account."** An Apple or Google user, while
signed in, sets an email and password that are *linked to the same uid* via
`linkWithCredential`. They then sign in anywhere with that pair and land in the
same account, same ledger. This is the half that actually solves the stated
problem.

**C. Email verification as a security control.** Not optional — see below.

Out of scope: phone auth, magic links, social providers beyond Google/Apple,
merging two uids that already exist (no user is in that state yet, and a merge
would have to reconcile two ledgers; if it ever happens it is a support task).

## C. Email verification is load-bearing

Two existing code paths trust `user.email` as a verified identity claim, because
until now every email in the system came from Google or Apple, who verify it.

1. **Event invitation auto-accept.** `AuthContext.checkAndAcceptInvitations`
   (`src/contexts/AuthContext.tsx:46`) runs on every sign-in, queries
   `events where pendingInvites array-contains user.email`, and adds the user to
   `memberIds`. Event membership grants read access to every bill in the event,
   its receipt images, and its balances.

2. **Identity resolution by email.** `syncUserProfile` writes `email` into
   `users/{uid}`; `userService.getUserByContact` (`src/services/userService.ts:134`)
   queries `users where email == contact` to resolve a person a friend is adding.
   A profile carrying someone else's email routes that person's debts to the
   wrong uid.

With unverified email/password signup, both become trivially exploitable by
anyone who knows a target's email address. This is a real privilege escalation,
not a theoretical one.

### The control

A single predicate, `hasTrustedEmail(user)`, true when the user has an email AND
either `emailVerified` is true or the email came from an OAuth provider
(`google.com` / `apple.com` in `providerData`). Both call sites above are gated
on it:

- `checkAndAcceptInvitations` returns early when the predicate is false.
- The profile-sync helpers omit `email` from the written document when the
  predicate is false, and fill it in on a later sign-in once verification lands.

The predicate is a pure function in `src/utils/authProviders.ts`, unit-tested
alongside the existing helpers there.

### Test obligation

Per CLAUDE.md rule 2, the tests that prove this hole is real are written
**first** and must FAIL against current `main`:

- A test that an unverified password user with `victim@example.com` is auto-added
  to an event that invited that address (fails now → passes after the gate).
- A test that an unverified password user's email is written to `users/{uid}` and
  is therefore resolvable by `getUserByContact` (fails now → passes after).

Only then is the gate implemented.

### UX

Signup sends a verification email immediately (`sendEmailVerification`). The app
stays usable — bills, splitting, and Venmo all work unverified. A persistent,
dismissible-per-session banner explains what is limited and offers "Resend".
Verification state refreshes via `user.reload()` when the banner is interacted
with and on app focus, because Firebase does not push `emailVerified` changes to
an existing session.

## A. Email/password sign-up and sign-in

### Auth surface

`AuthContext` gains three methods alongside the existing `signIn(provider)`:

```ts
signUpWithPassword(name: string, email: string, password: string): Promise<void>
signInWithPassword(email: string, password: string): Promise<void>
sendPasswordReset(email: string): Promise<void>
```

`SignInProvider` stays `'google' | 'apple'` — it models the OAuth button pair and
its cancellation semantics, which do not apply to a form. Password errors route
through the same `describeSignInError` copy layer, extended with the password
codes.

### Display name

`createUserWithEmailAndPassword` produces a user with `displayName: null`, and
`onAuthStateChanged` fires immediately — so the default profile-sync path would
create the Firestore profile with no name and a fallback username seed, exactly
the failure mode the Apple path was careful to avoid.

Signup therefore runs `createUserWithEmailAndPassword` → `updateProfile({ displayName })`
→ an explicit `syncUserProfile(auth.currentUser)` with the name present. The
existing merge helper never overwrites a stored value with null, so the ordering
is safe; a test covers that the profile ends up with the typed name.

### UI

`ProviderSignInButtons` keeps its current job (OAuth only). A new
`EmailPasswordForm` component renders below it, separated by an "or" divider, on
both `Auth.tsx` (desktop) and `MobileAuth.tsx`. It toggles between Sign in and
Create account in place, and exposes "Forgot password?". Both screens already
funnel through the same claim-and-redirect effect, which is provider-agnostic and
needs no change.

The Apple-only notice in `ProviderSignInButtons` becomes misleading once B ships
— it tells people the account is unreachable when it now is reachable. It is
replaced with copy pointing at "add a password in the iOS app", and
`shouldShowAppleOnlyNotice` is renamed to match its new meaning.

## B. Linking a password to an existing account

### Entry point

A new "Sign-in methods" card in Settings lists the providers on the account and
offers "Add email & password" when `providerData` has no `password` entry. This
is the flow an Apple user runs on iOS to gain web access.

### Mechanism

`linkWithCredential(user, EmailAuthProvider.credential(email, password))`.

### The Hide My Email complication

An Apple user who chose Hide My Email has an account email of
`<opaque>@privaterelay.appleid.com`, which they do not know and would never type.
The link must therefore accept an email the user chooses, which may differ from
`user.email`.

Firebase's behaviour when linking an email/password credential whose address
differs from the account's existing address is **version-dependent and not
reliably documented**. Implementation resolves this empirically against the Auth
emulator before choosing a path, rather than guessing:

- **If linking with a different address succeeds** and sets the account email:
  link directly, then send verification to the new address.
- **If it rejects the mismatch:** use `verifyBeforeUpdateEmail(user, newEmail)` to
  move the account to the user's chosen verified address first, and link the
  password credential to that address once the change applies. This costs a round
  trip through the user's inbox and the UI must say so.

**RESOLVED (2026-09-07, Auth emulator).** Linking with a different address
**succeeds**. Measured behaviour, starting from an OAuth account whose email was
`xyz789@privaterelay.appleid.com` and linking a password credential for
`me@example.com`:

- The uid is **unchanged** — the whole point of the feature. Signing in
  afterwards with `me@example.com` + password lands on the same account.
- `user.email` moves to `me@example.com`, with `emailVerified: false`.
- `providerData` **keeps the original OAuth entry carrying the OLD relay
  address**, alongside a new `password` entry for the chosen address.

So the direct-link path is taken; no `verifyBeforeUpdateEmail` dance is needed.

That third point is the important one, and it retroactively justifies the
provider-email match condition in `hasTrustedEmail`. After a link, an account
legitimately holds an `apple.com`/`google.com` provider entry whose email is NOT
the account email. A predicate that trusted any OAuth entry's mere presence
would treat the freshly-linked, unverified `me@example.com` as verified — which
is precisely the escalation this design exists to prevent. The measured shape
makes that a demonstrated hazard rather than a hypothetical one.

### Reauthentication

Linking is security-sensitive and throws `auth/requires-recent-login` on an older
session. The reauth helper currently lives privately inside
`src/services/accountService.ts:38` and handles Apple and Google only. It is
extracted into a shared module and extended with a `password` branch that prompts
for the current password.

This also fixes a bug we would otherwise ship: once password-only accounts exist,
**account deletion breaks for them**, because that helper falls through to a
Google popup, which fails with `auth/user-mismatch` on an account with no Google
provider. Deletion is an App Store 5.1.1(v) requirement, so this is not optional.

## Error copy

`describeSignInError` gains: `auth/email-already-in-use`, `auth/invalid-email`,
`auth/weak-password`, `auth/wrong-password`, `auth/user-not-found`, and
`auth/invalid-credential` — which modern Firebase returns instead of
`wrong-password`/`user-not-found` when email-enumeration protection is enabled,
and which must stay deliberately vague ("email or password is incorrect") rather
than confirming whether an account exists.

`auth/email-already-in-use` on **signup** is the one case that needs to be
actively helpful: it means the address already has a Divit account, quite
possibly via Apple. The copy names the situation and points at the right button
instead of just reporting failure.

## Native considerations

Email/password uses the JS SDK on all platforms. The app reads auth state from
the JS SDK (`onAuthStateChanged` on the JS `auth` instance), so no credential
replay is needed — unlike the OAuth paths, which exist only because the native
SDK presents those sheets. The native SDK session will not hold the password
account; the one place that matters is `accountService`, which signs out of both
SDKs and already tolerates the native call failing.

## Testing

| Layer | Coverage |
| --- | --- |
| Unit (`tests/`) | `hasTrustedEmail` truth table; extended `describeSignInError` codes; profile-sync name/email handling for password accounts |
| Rules (`npm run test:rules`) | No rules change is expected; the run confirms that |
| Integration / emulator | The two failing-first security tests above; the link-with-different-email spike |
| Manual | Signup → verify → sign in; Apple-on-iOS → add password → sign in in Chrome as the **same uid** (verify the ledger is shared, not duplicated) |

## Backward compatibility

No schema change. Existing documents are untouched. `users/{uid}.email` becomes
conditional on trust for *new* writes only; existing profiles keep the email they
already have, all of which came from a verified OAuth provider. No migration
required.

## Manual deploy step

**Email/Password must be enabled** in the Firebase console under
Authentication → Sign-in method, for **both** `divit-6d217` (prod) and
`divit-beta`. This is not in `firebase.json` and does not deploy from CI. The
feature fails with `auth/operation-not-allowed` until it is done.

Email-enumeration protection should be left **enabled** (its default), which is
why the error copy above stays vague.
