import {
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, functions, googleProvider } from '@/config/firebase';

export interface DeleteAccountResult {
  deleted: boolean;
  billsTransferred: number;
  billsDeleted: number;
  eventsTransferred: number;
  eventsDeleted: number;
  squadsLeft: number;
  squadsDeleted: number;
  recurringBillsDeleted: number;
  appleTokenRevoked: boolean;
}

/**
 * Re-authenticates the signed-in user and, for Apple accounts, returns the
 * fresh authorization code the server needs to revoke their Apple tokens.
 *
 * Two separate reasons this step is mandatory:
 *
 *  1. Firebase treats account deletion as security-sensitive and rejects it
 *     with `auth/requires-recent-login` unless the user signed in moments ago.
 *  2. Firebase does not persist Apple tokens, so the ONLY moment an Apple
 *     authorization code exists is immediately after an authorization. Apple
 *     requires apps offering Sign in with Apple to revoke tokens on deletion,
 *     and this is the one chance to capture what that needs.
 */
async function reauthenticate(): Promise<{ appleAuthorizationCode?: string }> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in.');

  // Scan for Apple rather than trusting position 0. Indexing the array happens
  // to work only because the app never links providers; if that ever changes,
  // an Apple user would be shown a Google sheet, fail with auth/user-mismatch,
  // and — because skipNativeAuth is false — be left signed into the native SDK
  // as somebody else.
  const usesApple = user.providerData.some((p) => p?.providerId === 'apple.com');

  if (usesApple) {
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

export const accountService = {
  /**
   * Permanently deletes the signed-in user's account.
   *
   * Required by App Store Review Guideline 5.1.1(v). The heavy lifting is
   * server-side (`deleteAccount` in functions/src/accountDeletion.ts) because
   * the cascade touches documents the security rules forbid a client to write,
   * and because the auth account must be destroyed only after the data work
   * succeeds.
   */
  async deleteAccount(): Promise<DeleteAccountResult> {
    let appleAuthorizationCode: string | undefined;

    try {
      ({ appleAuthorizationCode } = await reauthenticate());
    } catch (error) {
      // Tag it so the caller can tell "user backed out of the sign-in sheet"
      // from "the deletion itself failed". Without this distinction a cancelled
      // reauth and a half-completed server cascade look identical.
      (error as { reauthFailed?: boolean }).reauthFailed = true;
      throw error;
    }

    const callable = httpsCallable<
      { appleAuthorizationCode?: string },
      DeleteAccountResult
    >(functions, 'deleteAccount');

    const { data } = await callable(
      appleAuthorizationCode ? { appleAuthorizationCode } : {}
    );

    // `deleted: false` means the server found nothing to do. Reporting that as
    // success would hide a genuinely stuck account behind a cheerful toast.
    if (!data?.deleted) {
      throw new Error(
        'Your account could not be fully deleted. Please try again, or contact support if this persists.'
      );
    }

    // The auth user is gone server-side. Clear both SDK sessions — the native
    // one holds its own copy, and a lingering token would let the next profile
    // sync write to the tombstone.
    if (Capacitor.isNativePlatform()) {
      await FirebaseAuthentication.signOut().catch(() => undefined);
    }
    await signOut(auth).catch(() => undefined);

    return data;
  },
};
