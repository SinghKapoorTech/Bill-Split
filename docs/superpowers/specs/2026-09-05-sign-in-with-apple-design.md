# Sign in with Apple (iOS) — Design

**Date:** 2026-09-05
**Status:** Implemented 2026-09-06 — not yet run on a physical device
**Companion spec:** `2026-09-05-account-deletion-design.md` (implemented second)

## Why

App Store Review Guideline 4.8 (Login Services), verbatim:

> Apps that use a third-party or social login service (such as Facebook Login,
> Google Sign-In, Log in with X, Sign In with LinkedIn, Login with Amazon, or
> WeChat Login) to set up or authenticate the user's primary account with the app
> must also offer as an equivalent option another login service with the
> following features:
>
> - the login service limits data collection to the user's name and email address;
> - the login service allows users to keep their email address private as part of
>   setting up their account; and
> - the login service does not collect interactions with your app for advertising
>   purposes without consent.

Divit authenticates primary accounts with Google Sign-In only. None of the
guideline's exceptions apply (not first-party-only auth, not a marketplace, not
enterprise/education, not a government ID system, not a client for a specific
third-party service). Sign in with Apple satisfies all three bullets.

Secondary benefit: Google routinely blocks sign-in from unfamiliar locations,
which gets builds rejected as "reviewer unable to sign in". Apple gives the
reviewer a native path.

## Scope

**In:** Sign in with Apple on **iOS only**. Auth context refactor, auth UI, the
`syncUserProfile` name-preservation fix, native configuration.

**Out:** Web and Android Apple sign-in. Account linking between providers.
Account deletion (companion spec).

### Accepted consequence of iOS-only

A user who creates their account with Apple on iPhone has no credential that
works on the Vercel web app. Mitigated, not solved, by a web message (§4). If
this becomes a support burden, adding web/Android is a Services ID plus a return
URL — the Firebase provider config from §5 is already in place.

## 1. Auth flow

`AuthContext` currently exposes `signInWithGoogle`. Replace with a single
`signIn(provider: 'google' | 'apple')`.

Rationale: `signInWithGoogle` (`src/contexts/AuthContext.tsx:145-192`) already
contains the cancellation branch that suppresses the error toast for
`auth/cancelled-popup-request` / `auth/popup-closed-by-user`. Apple's sheet
dismissal needs identical treatment. Duplicating that branch is how it drifts.

Apple native path, mirroring the existing Google native path:

```ts
const result = await FirebaseAuthentication.signInWithApple();
const { idToken, nonce } = result.credential ?? {};
if (!idToken) throw new Error('No ID token received from Sign in with Apple');
const credential = new OAuthProvider('apple.com').credential({
  idToken,
  rawNonce: nonce,
});
await signInWithCredential(auth, credential);
```

`rawNonce` is required. Firebase rejects the Apple ID token without it.

Cancellation on iOS surfaces as native error code `1001`
(`ASAuthorizationError.canceled`) in addition to the existing web codes. Both
must return silently.

`capacitor.config.ts` — `providers: ["google.com", "apple.com"]`.

## 2. Provider collision policy

Decision: **block with a clear message, no linking.**

An existing Google user who taps Apple and chooses *Share My Email* triggers
`auth/account-exists-with-different-credential`. Catch it and show:

> This email already has a Divit account created with Google. Sign in with
> Google instead.

Leave them on the auth screen with the Google button available.

Allowing two accounts for one person is not an option: the ledger is keyed on
uid, so a duplicate account splits a person's balances across two identities.

### Hide My Email is not covered by this

If the user chooses *Hide My Email*, Apple returns
`<opaque>@privaterelay.appleid.com`. There is no collision, no error, and
Firebase creates a genuinely new account. To that user their bills have
vanished. Nothing in the collision policy prevents this; the last-used-provider
hint in §4 is the only mitigation, and only on the same device.

## 3. `syncUserProfile` name preservation

`src/services/userService.ts:103` writes, on **every** login:

```ts
displayName: user.displayName || 'User',
email: user.email || '',
```

Apple returns the user's name only on the **first** authorization, ever. Any
later login with a null `displayName` overwrites the stored name with `"User"`.
Because `friends` is `string[]` and friend rows hydrate from `users/{friendUid}`
(`getHydratedFriends`, `userService.ts:188`), this renames the person in every
other user's app, not just their own.

Fix — never downgrade:

```ts
displayName: user.displayName || existingData.displayName || 'User',
email: user.email || existingData.email || '',
```

This is a pre-existing bug that also affects Google users; Apple only makes it
certain rather than occasional.

## 4. UI

**Auth screens** — `src/pages/MobileAuth.tsx`, `src/pages/Auth.tsx`.

- Apple button renders when `Capacitor.getPlatform() === 'ios'`.
- Positioned **above** Google, at identical width and height. Guideline 4.8 says
  "equivalent option"; equal visual weight is the safe reading.
- Apple HIG button rules: black fill, white Apple glyph, title "Sign in with
  Apple", system font, minimum 44pt tall, corner radius matched to the existing
  Google button.
- On successful sign-in, write `localStorage.divit_last_provider`.

**Web fallback.** On non-iOS, if `localStorage.divit_last_provider === 'apple'`,
show:

> You signed up with Apple. Open the Divit iOS app to sign in.

**Friend discovery.** The add-friend UI gains a line noting that friends using
Hide My Email cannot be found by email address, and to search by username
instead. `searchUsersByUsername` (`userService.ts:159`) already exists.

## 5. Manual Apple Developer configuration

Cannot be automated. Must be done before the feature works on device.

1. Apple Developer → Identifiers → App ID `com.singhkapoortech.divit` → enable
   **Sign in with Apple**.
2. Xcode → target App → Signing & Capabilities → **+ Capability** → Sign in with
   Apple. This creates `ios/App/App/App.entitlements`, which **does not exist in
   the repo today**. Commit it.
3. Apple Developer → Keys → new key with Sign in with Apple enabled. Download
   the `.p8` (one-time download). Record **Key ID** and **Team ID**.
4. Firebase Console → Authentication → Sign-in method → Apple → Enable. Leave
   **Services ID empty** — the field is literally labelled "not required for
   Apple", and it is only needed for web and Android.

**Status: done.** Apple shows Enabled on `divit-6d217` as of 2026-09-06.

### The OAuth code flow section cannot be filled, and why that matters

An earlier draft of this spec said to fill the **OAuth code flow configuration**
(Team ID, Key ID, `.p8`) while leaving Services ID blank, so that Firebase's
`revokeAccessToken` would work for the companion deletion spec.

**Firebase refuses that combination.** Filling any OAuth code flow field with an
empty Services ID raises a blocking validation error:

> A services ID is required when OAuth code flow is set

So the choice is:

- **(a) Register a Services ID** purely to unlock the field — an Apple portal
  object representing *web* sign-in, which this app deliberately does not offer,
  configured against `divit-6d217.firebaseapp.com`. Extra manual setup, and it
  advertises a capability we don't ship.
- **(b) Revoke Apple tokens ourselves** from a Cloud Function, calling Apple's
  REST endpoint directly with the `.p8`. For a native app the `client_id` is the
  **bundle identifier** (`com.singhkapoortech.divit`), not a Services ID, so no
  Services ID is needed anywhere.

**Decision: (b).** It keeps the iOS-only scope honest, needs no further Apple
portal work, and puts revocation under our own control and test coverage. The
cost is writing the JWT client-secret signing ourselves — roughly 30 lines.

The credentials for (b), recorded here because they are not secret:

- **Team ID** `3LAJCPKLNV`
- **Key ID** `2PJ6RGN66M`
- **Bundle ID / client_id** `com.singhkapoortech.divit`

The `.p8` itself must be stored as a Firebase secret
(`firebase functions:secrets:set APPLE_SIGNIN_PRIVATE_KEY`) and **must never be
committed**.

Apple's private email relay registration
(`noreply@<project>.firebaseapp.com`) is **not** needed: Divit sends no
Firebase Auth emails (no email/password, no email link).

## 6. Testing

| What | How |
| --- | --- |
| `syncUserProfile` preserves an existing name when `displayName` is null | Vitest unit, `tests/` |
| `syncUserProfile` preserves an existing email when `email` is null | Vitest unit, `tests/` |
| New-profile creation still works when Apple supplies a name once | Vitest unit, `tests/` |
| Apple sign-in end to end | Manual, physical iOS device — the simulator's Apple ID flow is unreliable |
| Cancellation shows no error toast | Manual, device |
| Google collision shows the block message | Manual, device, using an Apple ID whose email matches an existing Google account |

Gate before handoff: `npm test`, `npm run typecheck`, `npm run lint`,
`npm run build`, and confirmation that the iOS build still produces a correct
artifact.

## 7. Open risks

- **Device testing is mandatory and cannot be faked.** Sign in with Apple does
  not work in a way worth trusting on the simulator. Nothing here is claimed as
  verified until it has run on hardware.
- **`App.entitlements` is generated by Xcode**, not by this repo. If it is not
  committed, CI-built IPAs silently lack the capability and Apple sign-in fails
  at runtime with an opaque error.
