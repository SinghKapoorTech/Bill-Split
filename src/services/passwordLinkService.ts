import {
  EmailAuthProvider,
  linkWithCredential,
  sendEmailVerification,
} from 'firebase/auth';
import { auth } from '@/config/firebase';
import { reauthenticate } from '@/services/reauthService';

/** Apple's relay domain for users who chose "Hide My Email". */
const APPLE_RELAY_DOMAIN = '@privaterelay.appleid.com';

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
 * Whether this address is an Apple private relay address.
 *
 * Worth singling out because the user has almost certainly never seen it and
 * cannot receive mail at it through any client they control — prefilling it
 * into a form would be actively unhelpful.
 */
export function isAppleRelayAddress(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(APPLE_RELAY_DOMAIN);
}

/** Human-readable labels for the provider ids we actually issue. */
export function describeProvider(providerId: string): string {
  switch (providerId) {
    case 'apple.com':
      return 'Apple';
    case 'google.com':
      return 'Google';
    case 'password':
      return 'Email & password';
    default:
      return providerId;
  }
}

/**
 * Attaches an email and password to the account that is already signed in.
 *
 * This is the entire point of the feature: it keeps ONE uid. Creating a
 * separate email/password account instead would split the person's bills,
 * `balances` and `event_balances` across two identities, because the whole
 * ledger is keyed on uid — see the note in `describeSignInError` about why
 * Divit has never linked Google and Apple to each other.
 *
 * The chosen address may differ from `user.email`: an Apple user who picked
 * Hide My Email has an opaque relay address they do not know and would never
 * type. Measured against the Auth emulator, Firebase accepts such a link,
 * keeps the uid, and moves `user.email` to the new address with
 * `emailVerified: false` — while LEAVING the original OAuth entry in
 * `providerData` still carrying the old relay address.
 *
 * That leftover entry is why `hasTrustedEmail` compares each provider's own
 * email against the account email instead of trusting an `apple.com` entry on
 * sight: immediately after this call the account has a verifying-provider entry
 * and an unverified address, and conflating the two would grant trust the user
 * has not yet earned.
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
    // Firebase considers linking security-sensitive on an older session. Prove
    // it is still the same person, then retry once.
    await reauthenticate(currentPassword);
    await linkWithCredential(user, credential);
  }

  // The linked address is a claim until confirmed. `hasTrustedEmail` and
  // firestore.rules both gate event invitations and email-based discovery on
  // exactly this, so sending it is part of the operation, not a follow-up.
  await sendEmailVerification(user).catch((err) =>
    console.error('[LinkPassword] verification email failed:', err)
  );
}
