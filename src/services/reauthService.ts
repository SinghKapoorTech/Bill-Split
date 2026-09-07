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
 *  1. Firebase treats account deletion and credential linking as
 *     security-sensitive and rejects them with `auth/requires-recent-login`
 *     unless the user signed in moments ago.
 *  2. Firebase does not persist Apple tokens, so the ONLY moment an Apple
 *     authorization code exists is immediately after an authorization. Apple
 *     requires apps offering Sign in with Apple to revoke tokens on deletion,
 *     and this is the one chance to capture what that needs.
 *
 * Provider selection scans `providerData` rather than trusting position 0.
 * That mattered even before linking existed, and it is load-bearing now: an
 * account can hold both `apple.com` and `password`, and showing that user a
 * Google sheet would fail with `auth/user-mismatch` while — because
 * skipNativeAuth is false — leaving them signed into the native SDK as someone
 * else.
 *
 * Apple is checked before Google, and both before password, so an OAuth user
 * who has merely added a password is still reauthenticated the way they
 * normally sign in rather than being asked to recall a password they rarely type.
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

    // iOS-only field, per the plugin's own documentation. Absent on other
    // platforms, which is fine — Apple sign-in only ships on iOS.
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
  // to the Google popup and failed with `auth/user-mismatch`, which would have
  // made in-app account deletion impossible for them — and that deletion is an
  // App Store 5.1.1(v) requirement, not a nicety.
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

/**
 * Whether reauthenticating this user means collecting a password first.
 *
 * Pure, so the deletion dialog can decide whether to render a password field
 * without touching Firebase. Mirrors the branch order in `reauthenticate`.
 */
export function reauthNeedsPassword(
  providerIds: ReadonlyArray<string | undefined>
): boolean {
  return (
    !providerIds.includes('apple.com') &&
    !providerIds.includes('google.com') &&
    providerIds.includes('password')
  );
}
