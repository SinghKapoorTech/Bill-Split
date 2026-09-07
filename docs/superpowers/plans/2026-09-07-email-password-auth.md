# Email + Password Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let people sign up and sign in with an email and password, and let an existing Apple or Google user attach a password to their *same* account so they can sign in on the web.

**Architecture:** Three layers, deliberately ordered. First a pure trust predicate (`hasTrustedEmail`) plus gates on the two code paths that currently treat `user.email` as a verified identity claim — these land *before* the feature that makes them exploitable. Then the sign-up/sign-in surface. Then password linking in Settings, which reuses an extracted reauthentication helper.

**Tech Stack:** React 18 + TypeScript, Firebase Auth v10 (modular JS SDK), Firestore, Vitest, shadcn/ui, Capacitor (iOS/Android).

**Spec:** `docs/superpowers/specs/2026-09-07-email-password-auth-design.md`

---

## Why this order

Tasks 1–4 are security work. They must be committed before Task 5 introduces
`createUserWithEmailAndPassword`, because that function is what turns an
unverified email into an exploitable identity claim. Do not reorder.

## File Structure

**Create:**

| Path | Responsibility |
| --- | --- |
| `src/services/invitationService.ts` | Accepting pending event invitations, gated on email trust. Extracted from `AuthContext`. |
| `src/services/reauthService.ts` | Re-authenticating the current user across Apple / Google / password. Extracted from `accountService`. |
| `src/services/passwordLinkService.ts` | Linking an email+password credential to the signed-in account. |
| `src/components/auth/EmailPasswordForm.tsx` | The sign-in / create-account / forgot-password form. |
| `src/components/auth/VerifyEmailBanner.tsx` | Persistent "verify your email" banner with resend. |
| `src/components/settings/SignInMethodsCard.tsx` | Settings card listing providers and offering "Add email & password". |
| `tests/invitationGate.test.ts` | The invitation auto-accept security gate. |
| `tests/passwordAuthErrors.test.ts` | Error-copy mapping for the password codes. |

**Modify:**

| Path | Change |
| --- | --- |
| `src/utils/authProviders.ts` | Add `hasTrustedEmail`; extend `describeSignInError`; replace `shouldShowAppleOnlyNotice`. |
| `src/utils/profileSync.ts` | Withhold `email` from profile writes when the email is untrusted. |
| `src/services/userService.ts:78` | Pass the trust signal through to the profile helpers. |
| `src/contexts/AuthContext.tsx` | Add password methods; delegate invitations to `invitationService`. |
| `src/services/accountService.ts:38` | Delegate to `reauthService`. |
| `src/pages/Auth.tsx`, `src/pages/MobileAuth.tsx` | Render `EmailPasswordForm`. |
| `src/pages/SettingsView.tsx:50` | Render `SignInMethodsCard`. |
| `src/components/auth/ProviderSignInButtons.tsx` | Updated Apple notice copy. |
| `tests/authProviders.test.ts`, `tests/profileSync.test.ts` | Cover the new behaviour. |

---

## Task 1: The `hasTrustedEmail` predicate

An email is trustworthy when Firebase says it is verified, **or** when it came
from an OAuth provider that verified it — but only if that provider's own email
still matches the account email. That last condition matters: after Task 9 a user
can link a password with a *different* address to a Google account, and without
the match check the stale `google.com` entry in `providerData` would keep
vouching for an address Google never saw.

**Files:**
- Modify: `src/utils/authProviders.ts` (append)
- Test: `tests/authProviders.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/authProviders.test.ts`:

```ts
describe('hasTrustedEmail', () => {
  it('rejects a user with no email at all', () => {
    expect(hasTrustedEmail({ email: null })).toBe(false);
    expect(hasTrustedEmail(null)).toBe(false);
    expect(hasTrustedEmail(undefined)).toBe(false);
  });

  it('rejects an unverified password account', () => {
    expect(
      hasTrustedEmail({
        email: 'victim@example.com',
        emailVerified: false,
        providerData: [{ providerId: 'password', email: 'victim@example.com' }],
      })
    ).toBe(false);
  });

  it('accepts an explicitly verified email', () => {
    expect(
      hasTrustedEmail({
        email: 'real@example.com',
        emailVerified: true,
        providerData: [{ providerId: 'password', email: 'real@example.com' }],
      })
    ).toBe(true);
  });

  it('accepts an OAuth email even when emailVerified is absent', () => {
    // Some Apple sessions arrive without the flag set; the provider vouched
    // for the address at authorization time.
    expect(
      hasTrustedEmail({
        email: 'user@privaterelay.appleid.com',
        providerData: [{ providerId: 'apple.com', email: 'user@privaterelay.appleid.com' }],
      })
    ).toBe(true);
  });

  // The Task 9 hazard: a password credential linked to a Google account can
  // move the account email to an address Google never verified.
  it('does not let a stale OAuth entry vouch for a different account email', () => {
    expect(
      hasTrustedEmail({
        email: 'attacker-chosen@example.com',
        emailVerified: false,
        providerData: [
          { providerId: 'google.com', email: 'original@gmail.com' },
          { providerId: 'password', email: 'attacker-chosen@example.com' },
        ],
      })
    ).toBe(false);
  });

  it('compares provider emails case-insensitively', () => {
    expect(
      hasTrustedEmail({
        email: 'Person@Example.com',
        providerData: [{ providerId: 'google.com', email: 'person@example.com' }],
      })
    ).toBe(true);
  });

  it('ignores null entries in providerData', () => {
    expect(
      hasTrustedEmail({ email: 'a@b.com', providerData: [null, undefined] })
    ).toBe(false);
  });
});
```

Add `hasTrustedEmail` to the import list at the top of the file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/authProviders.test.ts`
Expected: FAIL — `hasTrustedEmail is not a function` / TypeScript cannot resolve the import.

- [ ] **Step 3: Implement the predicate**

Append to `src/utils/authProviders.ts`:

```ts
/** The shape of a Firebase `User` that email-trust decisions actually read. */
export interface TrustedEmailSubject {
  email: string | null;
  emailVerified?: boolean;
  providerData?: ReadonlyArray<{ providerId?: string; email?: string | null } | null | undefined>;
}

/** Providers that verify an address before handing it to us. */
const EMAIL_VERIFYING_PROVIDERS = new Set(['google.com', 'apple.com']);

/**
 * Whether this account's email may be treated as a proven identity claim.
 *
 * Two things in this app trust `user.email` as proof of who someone is:
 * event invitations are auto-accepted by matching it against `pendingInvites`,
 * and `userService.getUserByContact` resolves it to a uid when a friend adds
 * someone by email. Before email/password sign-in existed, every address in the
 * system came from Google or Apple, so that trust was free. It is not free
 * anymore — anyone can type a stranger's address into a signup form.
 *
 * The provider-match condition is not redundant with `emailVerified`. A password
 * credential can be linked to an OAuth account under a different address
 * (see SignInMethodsCard), which leaves `providerData` still holding a
 * `google.com` entry for the ORIGINAL address while `user.email` points at the
 * new, unverified one. Requiring the provider's own email to equal the account
 * email stops that stale entry from vouching for an address its provider never
 * saw.
 */
export function hasTrustedEmail(user: TrustedEmailSubject | null | undefined): boolean {
  const email = user?.email;
  if (!email) return false;
  if (user?.emailVerified) return true;

  const normalized = email.toLowerCase();
  return (user?.providerData ?? []).some(
    (entry) =>
      !!entry?.providerId &&
      EMAIL_VERIFYING_PROVIDERS.has(entry.providerId) &&
      entry.email?.toLowerCase() === normalized
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/authProviders.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add src/utils/authProviders.ts tests/authProviders.test.ts
git commit -m "feat(auth): add hasTrustedEmail predicate"
```

---

## Task 2: Extract invitation acceptance (pure refactor, no behaviour change)

`checkAndAcceptInvitations` is currently a closure inside `AuthProvider`, which
makes the security gate in Task 3 untestable. Move it out first, unchanged, so
that Task 3's failing test is a genuine test of the gate and not of the
extraction.

**Files:**
- Create: `src/services/invitationService.ts`
- Modify: `src/contexts/AuthContext.tsx:46-95` (remove), `:129-134` (call site)

- [ ] **Step 1: Create the service**

Create `src/services/invitationService.ts`:

```ts
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

export interface InvitationSubject {
  uid: string;
  email: string | null;
  emailVerified?: boolean;
  providerData?: ReadonlyArray<{ providerId?: string; email?: string | null } | null | undefined>;
}

/**
 * Adds the user to every event that invited their email address.
 *
 * Returns the number of events joined so callers can report it.
 */
export async function acceptPendingInvitations(user: InvitationSubject): Promise<number> {
  if (!user.email) return 0;

  const eventsRef = collection(db, 'events');
  const q = query(eventsRef, where('pendingInvites', 'array-contains', user.email));
  const querySnapshot = await getDocs(q);

  if (querySnapshot.empty) return 0;

  for (const eventDoc of querySnapshot.docs) {
    await updateDoc(doc(db, 'events', eventDoc.id), {
      memberIds: arrayUnion(user.uid),
      pendingInvites: arrayRemove(user.email),
    });

    const invitationsRef = collection(db, 'eventInvitations');
    const inviteSnapshot = await getDocs(
      query(
        invitationsRef,
        where('email', '==', user.email),
        where('eventId', '==', eventDoc.id),
        where('status', '==', 'pending')
      )
    );

    for (const inviteDoc of inviteSnapshot.docs) {
      await updateDoc(doc(db, 'eventInvitations', inviteDoc.id), { status: 'accepted' });
    }
  }

  return querySnapshot.docs.length;
}
```

- [ ] **Step 2: Rewire AuthContext**

In `src/contexts/AuthContext.tsx`, delete the whole `checkAndAcceptInvitations`
function (lines 46–95) and replace the call inside the `onAuthStateChanged`
handler with:

```tsx
          acceptPendingInvitations(currentUser)
            .then((joined) => {
              if (joined > 0) {
                toast({
                  title: 'Welcome to your events!',
                  description: `You've been added to ${joined} ${joined === 1 ? 'event' : 'events'}.`,
                });
              }
            })
            .catch((error) => console.error('Error accepting event invitations:', error));
```

Add the import:

```tsx
import { acceptPendingInvitations } from '@/services/invitationService';
```

Remove the now-unused Firestore imports from `AuthContext.tsx` line 4
(`collection`, `query`, `where`, `getDocs`, `updateDoc`, `doc`, `arrayUnion`,
`arrayRemove`) — the whole import line goes, since nothing else in the file uses
Firestore.

- [ ] **Step 3: Verify nothing broke**

Run: `npm run typecheck`
Expected: no new errors (the ratchet count must not increase).

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/services/invitationService.ts src/contexts/AuthContext.tsx
git commit -m "refactor(auth): extract acceptPendingInvitations from AuthContext"
```

---

## Task 3: Gate invitation acceptance on email trust (SECURITY)

This is the hole. Today anyone signing in is auto-added to every event that
invited their email; once Task 5 ships, "their email" is whatever they typed.
Event membership grants read access to that event's bills, receipt images and
balances.

**Files:**
- Create: `tests/invitationGate.test.ts`
- Modify: `src/services/invitationService.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/invitationGate.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firestore is mocked wholesale: this test is about the DECISION to touch the
// database at all, so the assertion is that the query never happens.
const getDocs = vi.fn();
const updateDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  arrayUnion: vi.fn((v) => v),
  arrayRemove: vi.fn((v) => v),
  getDocs: (...args: unknown[]) => getDocs(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

import { acceptPendingInvitations } from '@/services/invitationService';

describe('acceptPendingInvitations — email trust gate', () => {
  beforeEach(() => {
    getDocs.mockReset();
    updateDoc.mockReset();
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: 'event-1', data: () => ({}) }],
    });
  });

  // THE HOLE: without the gate, typing a stranger's address into the signup
  // form joins you to every event that invited them.
  it('refuses to join events for an UNVERIFIED password account', async () => {
    const joined = await acceptPendingInvitations({
      uid: 'attacker-uid',
      email: 'victim@example.com',
      emailVerified: false,
      providerData: [{ providerId: 'password', email: 'victim@example.com' }],
    });

    expect(joined).toBe(0);
    expect(getDocs).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('joins events once the password account verifies its email', async () => {
    const joined = await acceptPendingInvitations({
      uid: 'real-uid',
      email: 'real@example.com',
      emailVerified: true,
      providerData: [{ providerId: 'password', email: 'real@example.com' }],
    });

    expect(joined).toBe(1);
    expect(updateDoc).toHaveBeenCalled();
  });

  it('still joins events for an OAuth account, which is the existing behaviour', async () => {
    const joined = await acceptPendingInvitations({
      uid: 'google-uid',
      email: 'person@gmail.com',
      providerData: [{ providerId: 'google.com', email: 'person@gmail.com' }],
    });

    expect(joined).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify the hole is real**

Run: `npm test -- tests/invitationGate.test.ts`
Expected: **FAIL** on the first case — `expected 0, received 1` and `getDocs` was
called. That failure is the proof the vulnerability exists. Do not proceed until
you have seen it fail for that reason.

- [ ] **Step 3: Add the gate**

In `src/services/invitationService.ts`, add the import:

```ts
import { hasTrustedEmail } from '@/utils/authProviders';
```

and replace the opening guard of `acceptPendingInvitations`:

```ts
  // An unverified address is a claim, not an identity. Joining events on the
  // strength of one would hand a stranger's bills, receipts and balances to
  // anyone who knows their email address and can fill in a signup form.
  // Verification is re-checked on later sign-ins, so a genuine user who
  // verifies later still gets their invitations.
  if (!hasTrustedEmail(user)) return 0;
```

(replacing the existing `if (!user.email) return 0;` — `hasTrustedEmail` already
covers the missing-email case.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/invitationGate.test.ts`
Expected: PASS, all three cases.

- [ ] **Step 5: Commit**

```bash
git add src/services/invitationService.ts tests/invitationGate.test.ts
git commit -m "fix(auth): do not auto-join events on an unverified email"
```

---

## Task 4: Withhold untrusted emails from the user profile (SECURITY)

`syncUserProfile` writes `email` into `users/{uid}`, and
`userService.getUserByContact` (`src/services/userService.ts:134`) queries that
field to resolve who a friend means when they add someone by email. A profile
carrying an unverified stranger's address makes the attacker resolvable *as that
person*, routing real debts to the wrong uid.

**Files:**
- Modify: `src/utils/profileSync.ts`, `src/services/userService.ts:78-117`
- Test: `tests/profileSync.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `tests/profileSync.test.ts`:

```ts
describe('email is only published once it is trusted', () => {
  const untrusted = {
    uid: 'attacker-uid',
    email: 'victim@example.com',
    emailVerified: false,
    providerData: [{ providerId: 'password', email: 'victim@example.com' }],
    displayName: 'Someone',
    photoURL: null,
  };

  it('omits an unverified email from a brand-new profile', () => {
    const fields = buildNewProfileFields(untrusted, 'someone');
    expect(fields.email).toBe('');
  });

  it('omits an unverified email from an update', () => {
    const { updates } = buildProfileUpdates(untrusted, {
      uid: 'attacker-uid',
      email: '',
      displayName: 'Someone',
      username: 'someone',
      friends: [],
    } as never);
    expect(updates.email).toBe('');
  });

  it('publishes the email once verified', () => {
    const fields = buildNewProfileFields({ ...untrusted, emailVerified: true }, 'someone');
    expect(fields.email).toBe('victim@example.com');
  });

  it('still publishes an OAuth email, which is the existing behaviour', () => {
    const fields = buildNewProfileFields(
      {
        uid: 'g',
        email: 'person@gmail.com',
        providerData: [{ providerId: 'google.com', email: 'person@gmail.com' }],
        displayName: 'Person',
        photoURL: null,
      },
      'person'
    );
    expect(fields.email).toBe('person@gmail.com');
  });

  // A verified user must never be silently downgraded: if a stored email exists
  // and the live one is untrusted, keep what is stored rather than blanking it.
  it('never erases a stored email because the current session is untrusted', () => {
    const { updates } = buildProfileUpdates(untrusted, {
      uid: 'attacker-uid',
      email: 'previously@verified.com',
      displayName: 'Someone',
      username: 'someone',
      friends: [],
    } as never);
    expect(updates.email).toBe('previously@verified.com');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/profileSync.test.ts`
Expected: **FAIL** — the first two cases return `'victim@example.com'` instead of
`''`. That is the hole.

- [ ] **Step 3: Implement**

In `src/utils/profileSync.ts`, extend the interface and gate both writers:

```ts
import { hasTrustedEmail } from '@/utils/authProviders';

export interface AuthUserLike {
  uid: string;
  email: string | null;
  /** Firebase's own verification flag. Absent on some provider sessions. */
  emailVerified?: boolean;
  /** Provider entries, used to tell a provider-verified email from a typed one. */
  providerData?: ReadonlyArray<{ providerId?: string; email?: string | null } | null | undefined>;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber?: string | null;
}

/**
 * The email to publish into `users/{uid}`, or '' when it must be withheld.
 *
 * This field is queried by `userService.getUserByContact` to resolve a person a
 * friend is adding, so an unverified address here would let someone be found —
 * and billed — as somebody else.
 */
function publishableEmail(user: AuthUserLike): string {
  return hasTrustedEmail(user) ? user.email || '' : '';
}
```

In `buildNewProfileFields`, replace `email: user.email || '',` with:

```ts
    email: publishableEmail(user),
```

In `buildProfileUpdates`, replace `email: user.email || existing.email || '',` with:

```ts
    // Falls through to the stored value on purpose: an untrusted session must
    // withhold a new address, never erase one that was already verified.
    email: publishableEmail(user) || existing.email || '',
```

In `src/services/userService.ts:78`, widen the parameter type so the new fields
reach the helpers:

```ts
  async syncUserProfile(user: AuthUserLike): Promise<void> {
```

and add `import type { AuthUserLike } from '@/utils/profileSync';` to the
existing import from that module. A Firebase `User` structurally satisfies
`AuthUserLike`, so call sites need no change.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/profileSync.test.ts`
Expected: PASS.

Run: `npm test`
Expected: PASS — the whole suite, since `buildNewProfileUsernameSeed` still reads
`user.email` directly and username generation is deliberately unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/utils/profileSync.ts src/services/userService.ts tests/profileSync.test.ts
git commit -m "fix(auth): withhold unverified emails from user profiles"
```

---

## Task 4b: Enforce email verification in Firestore rules (SECURITY — the real fix)

**Discovered during Task 1, after the plan was written.** Tasks 3 and 4 gate the
*client*. The rules do not, so both gates are bypassable with a single direct SDK
call and are security theater on their own:

- `firestore.rules:57` grants event **read** to anyone whose `request.auth.token.email`
  appears in `pendingInvites`. `:67` grants **update** (i.e. joining) on the same
  basis. Neither checks verification. An attacker runs
  `createUserWithEmailAndPassword(auth, 'victim@example.com', ...)`, gets a real
  token carrying that email with `email_verified: false`, skips
  `acceptPendingInvitations` entirely, and calls `updateDoc` directly.
- `firestore.rules:338`/`:343` do the same for `eventInvitations`.
- `firestore.rules:40-46` lets a user write **any** field to their own
  `users/{uid}` document, so Task 4's withheld email is restored by
  `updateDoc(doc(db,'users',myUid), { email: 'victim@example.com' })` — after
  which `getUserByContact` routes the victim's debts to the attacker.

This task closes all three in the rules, where they are actually enforced.

**Files:**
- Modify: `firestore.rules`
- Create: `tests/rules/emailVerification.rules.test.ts`

- [ ] **Step 1: Write the failing rules tests**

Create `tests/rules/emailVerification.rules.test.ts`, following the structure of
`tests/rules/users.rules.test.ts` (read it first). `authenticatedContext` takes
token claims as its second argument, so an unverified password user is
`testEnv.authenticatedContext('attacker', { email: 'victim@example.com', email_verified: false })`.

Cover, with seeded fixtures written via `withSecurityRulesDisabled`:

1. An event with `pendingInvites: ['victim@example.com']`. An **unverified**
   token for that address must FAIL to `getDoc` it, and FAIL to `updateDoc`
   itself into `memberIds`. (Both currently SUCCEED — that is the hole.)
2. The same token with `email_verified: true` must SUCCEED at both — the
   legitimate flow must keep working.
3. An existing **member** (uid in `memberIds`) must still be able to update
   `memberIds`/`pendingInvites` regardless of verification — that path is
   authorized by uid, not by email, and must not regress.
4. The event **owner** must retain full update access.
5. An `eventInvitations` doc addressed to `victim@example.com`: unverified token
   FAILS to read and to update; verified token SUCCEEDS.
6. `users/{uid}`: the owner may update `displayName`/`venmoId` freely, but must
   FAIL to set `email` to an address that is not their verified token email, and
   SUCCEED when it matches their verified token email.
7. **Backward compatibility (CLAUDE.md rule 4):** a pre-existing profile whose
   stored `email` was written by Google/Apple must still be updatable by its
   owner — e.g. a `displayName`-only update that leaves `email` untouched must
   SUCCEED even though the rule now constrains `email`.
8. **Shadow users:** their creator writes `email` on their behalf
   (`userService.createShadowUser`), and that address is not the creator's token
   email. This must keep working — verify the shadow branch is unaffected.

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:rules`
Expected: **FAIL** on cases 1, 5 and 6 specifically — those are the three holes.
Cases 2, 3, 4, 7, 8 should already pass (they assert existing good behaviour).
Do not proceed until you have seen exactly that pattern. If case 7 or 8 fails,
stop and report — that means the fix would break existing data.

- [ ] **Step 3: Fix the rules**

In `firestore.rules`, add a helper near the other helpers:

```
    // An email claim is only an identity if the provider verified it. Password
    // accounts can put ANY address in this claim, so every rule that authorizes
    // on token email must require this. See tests/rules/emailVerification.rules.test.ts.
    function verifiedEmail() {
      return request.auth != null &&
             request.auth.token.email_verified == true &&
             request.auth.token.email != null;
    }
```

Replace the three `request.auth.token.email in resource.data.pendingInvites`
occurrences (lines 57 and 67) with
`(verifiedEmail() && request.auth.token.email in resource.data.pendingInvites)`,
and the two `request.auth.token.email == resource.data.email` occurrences in
`eventInvitations` (lines 338, 343) with
`(verifiedEmail() && request.auth.token.email == resource.data.email)`.

For `users/{userId}`, constrain `email` on the self-update branch so it can only
ever hold the caller's own verified address, while leaving it untouched when the
update does not write the field:

```
        request.auth.uid == userId &&
        (!request.resource.data.diff(resource.data).affectedKeys().hasAny(['email']) ||
         (verifiedEmail() && request.resource.data.email == request.auth.token.email))
```

Keep the existing shadow-user branch exactly as it is — shadow emails are
written by their creator, not self-claimed, and case 8 proves that still works.

- [ ] **Step 4: Run to verify they pass**

Run: `npm run test:rules`
Expected: PASS, all cases including the backward-compatibility ones.

- [ ] **Step 5: Do not commit** — report back instead.

---

## Task 5: Error copy for the password codes

**Files:**
- Modify: `src/utils/authProviders.ts:86-104`
- Test: `tests/passwordAuthErrors.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/passwordAuthErrors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describePasswordAuthError } from '@/utils/authProviders';

describe('describePasswordAuthError', () => {
  // Firebase's email-enumeration protection is left ON, so wrong-password and
  // no-such-user both arrive as auth/invalid-credential. The copy must not
  // reveal which — confirming an address exists is the leak the setting exists
  // to prevent.
  it('stays vague about whether the account exists', () => {
    const message = describePasswordAuthError({ code: 'auth/invalid-credential' }, 'signin');
    expect(message).toMatch(/email or password/i);
    expect(message).not.toMatch(/no account|not found|does not exist/i);
  });

  it('uses the same vague copy for wrong-password and user-not-found', () => {
    const wrong = describePasswordAuthError({ code: 'auth/wrong-password' }, 'signin');
    const missing = describePasswordAuthError({ code: 'auth/user-not-found' }, 'signin');
    expect(wrong).toBe(missing);
  });

  // Signup is the one case where being helpful beats being vague: the person
  // already proved they control the address by trying to register it, and the
  // account may well be an Apple one they cannot otherwise reach.
  it('points a colliding signup at the existing account', () => {
    const message = describePasswordAuthError({ code: 'auth/email-already-in-use' }, 'signup');
    expect(message).toMatch(/already has a Divit account/i);
    expect(message).toMatch(/Google or Apple/i);
  });

  it('explains a weak password concretely', () => {
    expect(describePasswordAuthError({ code: 'auth/weak-password' }, 'signup')).toMatch(
      /at least 6 characters/i
    );
  });

  it('names the console step for operation-not-allowed', () => {
    expect(describePasswordAuthError({ code: 'auth/operation-not-allowed' }, 'signin')).toMatch(
      /not available/i
    );
  });

  it('handles invalid-email and too-many-requests', () => {
    expect(describePasswordAuthError({ code: 'auth/invalid-email' }, 'signup')).toMatch(
      /valid email/i
    );
    expect(describePasswordAuthError({ code: 'auth/too-many-requests' }, 'signin')).toMatch(
      /too many/i
    );
  });

  it('falls back to something actionable for an unknown code', () => {
    expect(describePasswordAuthError({ code: 'auth/whatever' }, 'signin')).toMatch(/try again/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/passwordAuthErrors.test.ts`
Expected: FAIL — `describePasswordAuthError is not a function`.

- [ ] **Step 3: Implement**

Append to `src/utils/authProviders.ts`:

```ts
/** Which form the user was filling in. Signup gets more helpful copy. */
export type PasswordAuthIntent = 'signin' | 'signup' | 'link' | 'reset';

/**
 * Human-readable copy for an email/password failure.
 *
 * Deliberately vague on sign-in. Firebase's email-enumeration protection is
 * enabled, which collapses `wrong-password` and `user-not-found` into
 * `invalid-credential` precisely so an attacker cannot use the login form to
 * discover which addresses have accounts. Copy that says "no account found"
 * would hand that back.
 *
 * Signup is the exception. `email-already-in-use` tells someone something they
 * are entitled to know about their own address, and it is the single most
 * likely error for the case this feature exists to serve: an Apple user who
 * cannot get in on the web and does not realise they already have an account.
 */
export function describePasswordAuthError(
  error: unknown,
  intent: PasswordAuthIntent
): string {
  const { code, message } = (error ?? {}) as AuthErrorLike;

  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email already has a Divit account. Try signing in with Google or Apple, or reset your password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email or password is incorrect.';
    case 'auth/weak-password':
      return 'Please use a password of at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/missing-password':
      return 'Please enter your password.';
    case 'auth/user-disabled':
      return 'This account has been disabled. Please contact support.';
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not available right now. Please try Google or Apple.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/requires-recent-login':
      return 'For your security, please sign in again before making this change.';
    case 'auth/credential-already-in-use':
    case 'auth/provider-already-linked':
      return 'That email is already linked to another Divit account.';
    default:
      return message || 'Something went wrong. Please try again.';
  }
}
```

Note: `intent` is currently read only for the `email-already-in-use` wording,
which is identical across intents; it is part of the signature because Task 9's
link flow and the reset flow both call this and the copy is expected to diverge.
Keep the parameter.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- tests/passwordAuthErrors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/authProviders.ts tests/passwordAuthErrors.test.ts
git commit -m "feat(auth): add error copy for email/password failures"
```

---

## Task 6: Password methods on AuthContext

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Extend the context type**

Replace the `AuthContextType` interface:

```tsx
interface AuthContextType {
  user: User | null | undefined;
  loading: boolean;
  signIn: (provider: SignInProvider) => Promise<void>;
  signUpWithPassword: (name: string, email: string, password: string) => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

- [ ] **Step 2: Add the imports**

Extend the `firebase/auth` import on line 2 with:

```tsx
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
```

and add:

```tsx
import { describePasswordAuthError } from '@/utils/authProviders';
```

(extending the existing import from that module).

- [ ] **Step 3: Implement the three methods**

Add inside `AuthProvider`, after `signIn`:

```tsx
  /**
   * Creates an account from an email and password.
   *
   * The ordering here is not incidental. `createUserWithEmailAndPassword`
   * produces a user whose `displayName` is null and fires `onAuthStateChanged`
   * immediately, so the profile sync in that listener would create the Firestore
   * document with the placeholder name 'User' and an email-derived username.
   * Setting the name and re-syncing explicitly repairs that; `buildProfileUpdates`
   * never downgrades a stored value, so the second sync is safe.
   */
  const signUpWithPassword = async (name: string, email: string, password: string) => {
    try {
      const { user: created } = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(created, { displayName: name });

      // Verification gates event invitations and email-based discovery
      // (see hasTrustedEmail), so it is sent immediately rather than on demand.
      await sendEmailVerification(created).catch((error) =>
        console.error('[Auth] Could not send verification email:', error)
      );

      await userService
        .syncUserProfile({ ...created, displayName: name })
        .catch((error) => console.error('[Auth] Profile sync after signup failed:', error));

      toast({
        title: 'Account created',
        description: `Check ${email} to verify your address.`,
      });
    } catch (error: unknown) {
      console.error('[Auth] Sign-up error:', error);
      toast({
        title: 'Could not create your account',
        description: describePasswordAuthError(error, 'signup'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  const signInWithPassword = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      toast({ title: 'Welcome back!', description: 'Successfully signed in.' });
    } catch (error: unknown) {
      console.error('[Auth] Password sign-in error:', error);
      toast({
        title: 'Sign in failed',
        description: describePasswordAuthError(error, 'signin'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  /**
   * Always reports success. Firebase throws `auth/user-not-found` for an
   * unknown address, and surfacing that would turn this form into an account
   * existence oracle — the same leak the vague sign-in copy avoids.
   */
  const sendPasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: unknown) {
      console.error('[Auth] Password reset error:', error);
      const { code } = (error ?? {}) as { code?: string };
      if (code === 'auth/invalid-email' || code === 'auth/too-many-requests') {
        toast({
          title: 'Could not send the email',
          description: describePasswordAuthError(error, 'reset'),
          variant: 'destructive',
        });
        return;
      }
    }

    toast({
      title: 'Check your inbox',
      description: `If ${email} has a Divit account, a reset link is on its way.`,
    });
  };
```

Add all three to the `value` object.

- [ ] **Step 4: Verify**

Run: `npm run typecheck`
Expected: no new errors.

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat(auth): add email/password methods to AuthContext"
```

---

## Task 7: The sign-in / sign-up form

**Files:**
- Create: `src/components/auth/EmailPasswordForm.tsx`
- Modify: `src/pages/Auth.tsx`, `src/pages/MobileAuth.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/auth/EmailPasswordForm.tsx`:

```tsx
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

type Mode = 'signin' | 'signup';

interface EmailPasswordFormProps {
  /** Disables the form during an unrelated busy state, e.g. a guest claim. */
  disabled?: boolean;
}

/**
 * Email and password sign-in, sitting under the OAuth buttons.
 *
 * This is the only way into a Divit account from a desktop browser for someone
 * who signed up with Apple — Apple sign-in is iOS-only — provided they first
 * added a password from Settings in the iOS app.
 */
export const EmailPasswordForm = ({ disabled = false }: EmailPasswordFormProps) => {
  const { signInWithPassword, signUpWithPassword, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || disabled) return;

    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUpWithPassword(name.trim(), email.trim(), password);
      } else {
        await signInWithPassword(email.trim(), password);
      }
    } catch {
      // AuthContext has already surfaced a toast; keep the form mounted with
      // its values so the user can correct and retry.
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await sendPasswordReset(email.trim());
    } finally {
      setBusy(false);
    }
  };

  const locked = busy || disabled;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-muted-foreground">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === 'signup' && (
          <div className="space-y-1.5">
            <Label htmlFor="auth-name">Name</Label>
            <Input
              id="auth-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              required
              disabled={locked}
            />
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="auth-email">Email</Label>
          <Input
            id="auth-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={locked}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            id="auth-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            minLength={6}
            disabled={locked}
          />
        </div>

        <Button type="submit" className="w-full min-h-[44px]" disabled={locked}>
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Please wait...
            </>
          ) : mode === 'signup' ? (
            'Create account'
          ) : (
            'Sign in'
          )}
        </Button>
      </form>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          disabled={locked}
        >
          {mode === 'signin' ? 'Create an account' : 'I already have an account'}
        </button>

        {mode === 'signin' && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            onClick={handleReset}
            disabled={locked || !email.trim()}
          >
            Forgot password?
          </button>
        )}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Wire into the desktop screen**

In `src/pages/Auth.tsx`, add the import and render it after
`<ProviderSignInButtons ... />` inside the same `space-y-4` div:

```tsx
import { EmailPasswordForm } from '@/components/auth/EmailPasswordForm';
```

```tsx
          <EmailPasswordForm disabled={isClaiming} />
```

- [ ] **Step 3: Wire into the mobile screen**

In `src/pages/MobileAuth.tsx`, add the same import and place it inside the
existing `motion.div` that wraps `ProviderSignInButtons`, directly after that
component:

```tsx
          <EmailPasswordForm disabled={isClaiming} />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

Manually: `npm run dev`, open `/auth`, confirm the form renders under the Google
button and that toggling to "Create an account" reveals the Name field.

- [ ] **Step 5: Commit**

```bash
git add src/components/auth/EmailPasswordForm.tsx src/pages/Auth.tsx src/pages/MobileAuth.tsx
git commit -m "feat(auth): add email/password form to the sign-in screens"
```

---

## Task 8: The verify-email banner

**Files:**
- Create: `src/components/auth/VerifyEmailBanner.tsx`
- Modify: `src/pages/Dashboard.tsx` (render it at the top of the page body)

- [ ] **Step 1: Create the component**

Create `src/components/auth/VerifyEmailBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { MailWarning, Loader2 } from 'lucide-react';
import { sendEmailVerification } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { hasTrustedEmail } from '@/utils/authProviders';

/**
 * Tells a password user why parts of the app are inert until they verify.
 *
 * Unverified accounts are deliberately usable — bills, splitting and Venmo all
 * work. What does not work is anything keyed on email identity: event
 * invitations are not auto-accepted, and friends adding them by email cannot
 * resolve them. Saying so plainly beats letting those features fail silently.
 *
 * Firebase does not push `emailVerified` to a live session, so the flag is
 * refreshed by `user.reload()` when the tab regains focus — otherwise someone
 * who clicks the link in another tab sees this banner until they sign out.
 */
export const VerifyEmailBanner = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [refreshed, setRefreshed] = useState(0);

  useEffect(() => {
    const refresh = () => {
      auth.currentUser
        ?.reload()
        .then(() => setRefreshed((n) => n + 1))
        .catch(() => undefined);
    };

    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  // `refreshed` is read so the reload above re-evaluates this component.
  void refreshed;

  if (!user || hasTrustedEmail(auth.currentUser ?? user)) return null;

  const resend = async () => {
    if (!auth.currentUser) return;
    setSending(true);
    try {
      await sendEmailVerification(auth.currentUser);
      toast({
        title: 'Verification sent',
        description: `Check ${user.email} for the link.`,
      });
    } catch (error) {
      console.error('[VerifyEmail] resend failed:', error);
      toast({
        title: 'Could not send the email',
        description: 'Please wait a moment and try again.',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 mb-4">
      <div className="flex items-start gap-3">
        <MailWarning className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">Verify your email</p>
          <p className="text-sm text-muted-foreground mt-0.5">
            Until you confirm {user.email}, friends can't find you by email and event invitations
            won't be accepted automatically.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={resend}
            disabled={sending}
          >
            {sending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Sending...
              </>
            ) : (
              'Resend verification email'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Render it on the dashboard**

In `src/pages/Dashboard.tsx`, import the banner and render `<VerifyEmailBanner />`
as the first child of the main content container (inside whatever wrapper holds
the page heading, above it). Read the file first to find the exact wrapper — do
not guess the class names.

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add src/components/auth/VerifyEmailBanner.tsx src/pages/Dashboard.tsx
git commit -m "feat(auth): prompt unverified users to verify their email"
```

---

## Task 9: Extract and extend reauthentication

Once password-only accounts exist, **account deletion breaks for them**:
`accountService`'s private `reauthenticate` falls through to a Google popup,
which fails with `auth/user-mismatch` on an account that has no Google provider.
Deletion is an App Store 5.1.1(v) requirement, so this is not optional cleanup.

**Files:**
- Create: `src/services/reauthService.ts`
- Modify: `src/services/accountService.ts:1-76`

- [ ] **Step 1: Create the service**

Create `src/services/reauthService.ts` by moving the existing `reauthenticate`
function out of `accountService.ts` verbatim, then adding a password branch.
The full file:

```ts
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, googleProvider } from '@/config/firebase';

export interface ReauthResult {
  /** Present only for Apple, and only on iOS. Required to revoke Apple tokens. */
  appleAuthorizationCode?: string;
}

/** Thrown when a password account must reauthenticate but no password was supplied. */
export class PasswordRequiredError extends Error {
  constructor() {
    super('Please enter your current password to continue.');
    this.name = 'PasswordRequiredError';
  }
}

/**
 * Re-authenticates the signed-in user.
 *
 * Two separate reasons this step is mandatory:
 *
 *  1. Firebase treats deletion and credential linking as security-sensitive and
 *     rejects them with `auth/requires-recent-login` unless the user signed in
 *     moments ago.
 *  2. Firebase does not persist Apple tokens, so the ONLY moment an Apple
 *     authorization code exists is immediately after an authorization. Apple
 *     requires apps offering Sign in with Apple to revoke tokens on deletion,
 *     and this is the one chance to capture what that needs.
 *
 * Provider selection scans `providerData` rather than trusting position 0.
 * Indexing the array used to work only because the app never linked providers —
 * an assumption that stops holding the moment a password is linked to an Apple
 * account, which is exactly what SignInMethodsCard does.
 */
export async function reauthenticate(password?: string): Promise<ReauthResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');

  const providerIds = user.providerData.map((p) => p?.providerId);

  if (providerIds.includes('apple.com')) {
    const result = await FirebaseAuthentication.signInWithApple();
    const idToken = result.credential?.idToken;
    const rawNonce = result.credential?.nonce;

    if (!idToken || !rawNonce) {
      throw new Error('Apple did not return a usable credential. Please try again.');
    }

    const credential = new OAuthProvider('apple.com').credential({ idToken, rawNonce });
    await reauthenticateWithCredential(user, credential);

    // iOS-only field, per the plugin's own documentation.
    return { appleAuthorizationCode: result.credential?.authorizationCode };
  }

  if (providerIds.includes('google.com')) {
    if (Capacitor.isNativePlatform()) {
      const result = await FirebaseAuthentication.signInWithGoogle();
      const idToken = result.credential?.idToken;
      if (!idToken) throw new Error('Google did not return a usable credential. Please try again.');
      await reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken));
    } else {
      await reauthenticateWithPopup(user, googleProvider);
    }
    return {};
  }

  // Password-only account. Before this branch existed such a user fell through
  // to the Google popup and failed with auth/user-mismatch, which would have
  // made account deletion impossible for them.
  if (providerIds.includes('password')) {
    if (!password) throw new PasswordRequiredError();
    if (!user.email) throw new Error('This account has no email address.');
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password)
    );
    return {};
  }

  throw new Error('This account has no supported sign-in method.');
}

/** Whether reauthenticating this user requires collecting a password first. */
export function reauthNeedsPassword(
  providerIds: ReadonlyArray<string | undefined>
): boolean {
  return (
    !providerIds.includes('apple.com') &&
    !providerIds.includes('google.com') &&
    providerIds.includes('password')
  );
}
```

- [ ] **Step 2: Rewire accountService**

In `src/services/accountService.ts`, delete the private `reauthenticate`
function (lines 38–76) and its now-unused imports, then change the signature and
call:

```ts
import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, functions } from '@/config/firebase';
import { reauthenticate } from '@/services/reauthService';
```

```ts
  async deleteAccount(password?: string): Promise<DeleteAccountResult> {
    let appleAuthorizationCode: string | undefined;

    try {
      ({ appleAuthorizationCode } = await reauthenticate(password));
    } catch (error) {
```

(the rest of the body is unchanged).

- [ ] **Step 3: Collect the password in the deletion dialog**

In `src/components/settings/DeleteAccountCard.tsx`, import
`reauthNeedsPassword` and `auth`, add a password field to the **final**
confirmation dialog shown only when
`reauthNeedsPassword((auth.currentUser?.providerData ?? []).map((p) => p?.providerId))`
is true, hold it in state, and pass it to `accountService.deleteAccount(password)`.
Read the file first; keep the existing two-step dialog structure intact.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/reauthService.ts src/services/accountService.ts src/components/settings/DeleteAccountCard.tsx
git commit -m "fix(auth): support reauthentication for password-only accounts"
```

---

## Task 10: Determine Firebase's link-with-different-email behaviour

The spec flags this as genuinely uncertain. Resolve it empirically before
writing the UI — do not guess.

**Files:** none committed (throwaway script in the scratchpad).

- [ ] **Step 1: Start the auth emulator**

Run: `firebase emulators:start --only auth --project demo-bill-split-test`
Leave it running.

- [ ] **Step 2: Probe the behaviour**

Write a throwaway Node script in the scratchpad that, against the emulator:

1. Creates a user with `signInWithEmailAndPassword`-style bootstrapping, or more
   simply creates an anonymous user and uses the emulator's OAuth stub to make
   one with email `relay@privaterelay.appleid.com`.
2. Calls `linkWithCredential(user, EmailAuthProvider.credential('chosen@example.com', 'hunter2'))`.
3. Prints the resulting `user.email`, `user.emailVerified`, and
   `user.providerData`, or the thrown error code.

- [ ] **Step 3: Record the outcome**

Append a short "Resolved" note to the spec's *Hide My Email complication*
section stating which branch is taken:

- **Link succeeds with a different address** → Task 11 links directly, then
  sends verification to the new address.
- **Link is rejected** → Task 11 calls `verifyBeforeUpdateEmail(user, chosen)`
  first, tells the user to click the link in their inbox, and links the password
  on the next session once `user.email` has moved.

Commit the spec update:

```bash
git add docs/superpowers/specs/2026-09-07-email-password-auth-design.md
git commit -m "docs(auth): record Firebase link-with-different-email behaviour"
```

---

## Task 11: The "Add email & password" card

**Files:**
- Create: `src/services/passwordLinkService.ts`, `src/components/settings/SignInMethodsCard.tsx`
- Modify: `src/pages/SettingsView.tsx:50`

- [ ] **Step 1: Create the service**

Create `src/services/passwordLinkService.ts`. The body of `linkPassword` follows
the branch chosen in Task 10; the direct-link version is:

```ts
import {
  EmailAuthProvider,
  linkWithCredential,
  sendEmailVerification,
} from 'firebase/auth';
import { auth } from '@/config/firebase';
import { reauthenticate } from '@/services/reauthService';

/** The sign-in methods currently attached to the signed-in account. */
export function currentProviderIds(): string[] {
  return (auth.currentUser?.providerData ?? [])
    .map((p) => p?.providerId)
    .filter((id): id is string => !!id);
}

export function hasPasswordSignIn(): boolean {
  return currentProviderIds().includes('password');
}

/**
 * Attaches an email and password to the account that is already signed in.
 *
 * This is the whole point of the feature: it keeps ONE uid. Creating a separate
 * email/password account instead would split the person's bills, `balances` and
 * `event_balances` across two identities, because the ledger is keyed on uid.
 *
 * The chosen address may differ from `user.email` — an Apple user who picked
 * Hide My Email has an opaque `@privaterelay.appleid.com` address they do not
 * know and would never type.
 */
export async function linkPassword(
  email: string,
  password: string,
  currentPassword?: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');

  const credential = EmailAuthProvider.credential(email, password);

  try {
    await linkWithCredential(user, credential);
  } catch (error) {
    if ((error as { code?: string }).code !== 'auth/requires-recent-login') throw error;
    await reauthenticate(currentPassword);
    await linkWithCredential(user, credential);
  }

  // The linked address is not trusted until it is verified — hasTrustedEmail
  // gates event invitations and email discovery on exactly this.
  await sendEmailVerification(user).catch((err) =>
    console.error('[LinkPassword] verification email failed:', err)
  );
}
```

- [ ] **Step 2: Create the card**

Create `src/components/settings/SignInMethodsCard.tsx`: a `Card` that lists the
current providers in human terms ("Apple", "Google", "Email & password"), and —
when `hasPasswordSignIn()` is false — shows an email field, a password field, and
an "Add password" button calling `linkPassword`. On success, toast:

> "Password added. You can now sign in at divit-bill.com with that email."

On failure, toast `describePasswordAuthError(error, 'link')`.

Prefill the email field with `auth.currentUser?.email` **unless** it ends in
`@privaterelay.appleid.com`, in which case leave it blank and show the helper
text: "Apple hid your real email. Enter an address you can receive mail at."

Follow the layout and toast conventions in `DeleteAccountCard.tsx`.

- [ ] **Step 3: Render it in Settings**

In `src/pages/SettingsView.tsx`, import the card and render it between
`<ProfileSettingsCard />` and the `DeleteAccountCard` comment block:

```tsx
            <SignInMethodsCard />
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add src/services/passwordLinkService.ts src/components/settings/SignInMethodsCard.tsx src/pages/SettingsView.tsx
git commit -m "feat(auth): let users add a password to an existing account"
```

---

## Task 12: Correct the Apple-only notice

`shouldShowAppleOnlyNotice` renders "Sign in with Apple is only available in the
Divit iOS app" on every non-iOS platform. Once Task 11 ships that is misleading:
the account *is* reachable, via a password added in the iOS app.

**Files:**
- Modify: `src/utils/authProviders.ts:116-128`, `src/components/auth/ProviderSignInButtons.tsx:121-125`
- Test: `tests/authProviders.test.ts`

- [ ] **Step 1: Update the test**

In `tests/authProviders.test.ts`, rename the `shouldShowAppleOnlyNotice`
describe block to `shouldShowAppleWebHelpNotice` and keep both assertions
(`true` off iOS, `false` on iOS) — the platform logic is unchanged, only the name
and the copy it drives.

- [ ] **Step 2: Rename the helper**

In `src/utils/authProviders.ts`, rename the function and replace its doc comment:

```ts
/**
 * Whether to tell a visitor how to reach an Apple-created account from here.
 *
 * Shown unconditionally off iOS. An earlier design gated this on a stored
 * "last provider used" flag, which cannot work: that flag is only ever written
 * inside the iOS WKWebView, whose localStorage origin (https://localhost) is a
 * separate store from the browser's on the deployed domain.
 *
 * The advice changed when password linking shipped. It used to be a dead end
 * ("that account only works in the iOS app"); it is now an instruction, because
 * adding a password in the iOS app makes the same account reachable here.
 */
export function shouldShowAppleWebHelpNotice(platform: Platform): boolean {
  return platform !== 'ios';
}
```

- [ ] **Step 3: Update the notice**

In `src/components/auth/ProviderSignInButtons.tsx`, update the import and the
rendered copy:

```tsx
      {shouldShowAppleWebHelpNotice(platform) && (
        <p className="text-xs text-center text-muted-foreground">
          Signed up with Apple? Open the Divit iOS app and add a password under Settings → Sign-in
          methods, then sign in with it here.
        </p>
      )}
```

- [ ] **Step 4: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/authProviders.ts src/components/auth/ProviderSignInButtons.tsx tests/authProviders.test.ts
git commit -m "docs(auth): point Apple users at password linking instead of a dead end"
```

---

## Task 13: Full production-readiness gate

Per `CLAUDE.md`, nothing is handed back until this has actually been run and the
output read.

- [ ] **Step 1: Run every applicable gate**

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm run test:rules
```

Expected: tests pass; typecheck does not exceed the CI ratchet; lint does not
exceed baseline; build succeeds; rules tests pass unchanged (this change adds no
rules).

- [ ] **Step 2: Adversarial review**

Dispatch a subagent to **break** the change. It must specifically try to:

- Reach `acceptPendingInvitations` past the trust gate — e.g. an account with
  both `password` and `google.com` providers where the emails differ.
- Get an unverified email into `users/{uid}` by any path, including
  `updateShadowUser` and `createShadowUser` (`src/services/userService.ts:291,309`),
  which write `email` **without** going through `profileSync` and are therefore
  outside the Task 4 gate — confirm whether that is reachable by an attacker or
  only by a bill creator naming someone.
- Break account deletion for each provider combination: Apple-only,
  Google-only, password-only, Apple+password, Google+password.
- Find a flow where linking produces a second uid instead of extending the first.

Fix anything it finds, then re-run Step 1.

- [ ] **Step 3: Report**

State plainly what was verified, what was not, and what remains open. The known
manual step — enabling Email/Password in the Firebase console for **both**
`divit-6d217` and `divit-beta` — must be called out as **not done by this
change**, because the feature returns `auth/operation-not-allowed` until someone
does it in the console.

Note what pushing to `main` triggers. **This changed once Task 4b was added.**
The diff now touches `firestore.rules`, which DOES match the
`deploy-backend.yml` path filter, so pushing to `main` auto-deploys the rules to
**production** with no approval gate, and also builds and uploads a draft AAB to
Play. The rules change tightens access, so deploying it before the client change
reaches users is safe in that order — but confirm the backward-compatibility
cases (Task 4b, cases 7 and 8) passed before pushing, because a rules regression
locks real users out of their own profiles.

Consider deploying to beta first and exercising a real Apple sign-in against it:
`firebase deploy --only firestore --project beta`.

---

## Self-Review

**Spec coverage:** A → Tasks 5–8. B → Tasks 9–11. C → Tasks 1, 3, 4, 8. Error
copy → Task 5. Native considerations → no work needed (Task 6 note). Apple notice
→ Task 12. Manual console step → Task 13 Step 3. Testing table → Tasks 1, 3, 4,
5 and 13.

**Deviation from spec, deliberate:** the spec listed the two security tests as
"integration / emulator". They are written as unit tests with Firestore mocked
instead, because the property under test is *whether the database is touched at
all* — a mock asserting `getDocs` was never called proves that more directly than
an emulator round trip, and keeps the suite Java-free per the `tests/` convention.

**Known gap, deliberate:** `createShadowUser` and `updateShadowUser` write
`email` directly, bypassing `profileSync`. Those addresses come from a bill
creator naming someone who has not signed up, not from the named person's own
session, so they are not an unverified self-claim — but Task 13's adversarial
review is instructed to confirm that reasoning rather than assume it.
