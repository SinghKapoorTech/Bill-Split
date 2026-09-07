import { signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, functions } from '@/config/firebase';
import { reauthenticate } from '@/services/reauthService';

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
  async deleteAccount(password?: string): Promise<DeleteAccountResult> {
    let appleAuthorizationCode: string | undefined;

    try {
      ({ appleAuthorizationCode } = await reauthenticate(password));
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
