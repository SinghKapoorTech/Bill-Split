/**
 * Pure decisions around multi-provider sign-in.
 *
 * Sign in with Apple exists here to satisfy App Store Review Guideline 4.8,
 * which requires any app authenticating primary accounts through a third-party
 * login service to also offer one that limits collection to name and email and
 * lets the user hide their email address.
 *
 * Kept free of Firebase and Capacitor imports so it can be unit tested — see
 * `tests/authProviders.test.ts`.
 */

export type SignInProvider = 'google' | 'apple';

/** Platform string as reported by `Capacitor.getPlatform()`. */
export type Platform = 'ios' | 'android' | 'web';

interface AuthErrorLike {
  code?: string | number;
  message?: string;
}

/** `ASAuthorizationError.canceled` — the user dismissed the native Apple sheet. */
const APPLE_CANCELED_CODE = 1001;

const SILENT_CANCELLATION_CODES = new Set([
  'auth/cancelled-popup-request',
  'auth/popup-closed-by-user',
  'auth/user-cancelled',
  String(APPLE_CANCELED_CODE),
]);

const PROVIDER_LABEL: Record<SignInProvider, string> = {
  google: 'Google',
  apple: 'Apple',
};

/**
 * True when the user simply backed out of the sign-in sheet.
 *
 * Cancellation must never raise an error toast — on iOS, dismissing the Apple
 * sheet is a completely normal gesture, and Apple's reviewers do it.
 *
 * The awkward string matching is forced on us by the plugin. Its iOS helper
 * (`FirebaseAuthenticationHelper.createErrorCode`) maps only Firebase
 * `AuthErrorCode` raw values, which are all 17xxx. `ASAuthorizationError` lives
 * in a different domain, so a cancelled Apple sheet maps to nil and reaches JS
 * with no code at all — only the NSError's localizedDescription. That sentence
 * is translated on non-English devices, but the error domain never is, so we
 * match on the domain plus the code number rather than on English prose.
 */
export function isSilentAuthCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const { code, message } = error as AuthErrorLike;

  if (code !== undefined && SILENT_CANCELLATION_CODES.has(String(code))) {
    return true;
  }

  if (typeof message === 'string') {
    // Deliberately broad, matching the behaviour the Google path already relied
    // on. Covers "canceled" and "cancelled", any casing.
    if (/cancel/i.test(message)) return true;

    // Locale-independent: the domain is never localized, and 1001 specifically
    // means the user cancelled. Other codes in the same domain are real errors.
    if (/AuthorizationError/.test(message) && new RegExp(`\\b${APPLE_CANCELED_CODE}\\b`).test(message)) {
      return true;
    }
  }

  return false;
}

/**
 * Human-readable copy for a failed sign-in.
 *
 * `attempted` is required for the collision case. Divit does not link Google
 * and Apple credentials — the ledger is keyed on uid, so a duplicate account
 * would split a person's balances across two identities — which means the
 * message has to name the OTHER provider, the one that actually owns the
 * account. Hardcoding one of them sends half of the affected users back to the
 * button that just failed.
 */
export function describeSignInError(error: unknown, attempted: SignInProvider): string {
  const { code, message } = (error ?? {}) as AuthErrorLike;
  const other = PROVIDER_LABEL[attempted === 'apple' ? 'google' : 'apple'];

  switch (code) {
    case 'auth/account-exists-with-different-credential':
      return `This email already has a Divit account created with ${other}. Sign in with ${other} instead.`;
    case 'auth/operation-not-allowed':
      return `Sign in with ${PROVIDER_LABEL[attempted]} is not available right now. Please try another way to sign in.`;
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    case 'auth/invalid-credential':
      return 'That sign-in could not be verified. Please try again.';
    default:
      return message || 'Could not sign you in. Please try again.';
  }
}

/**
 * Apple sign-in ships on iOS only.
 *
 * Guideline 4.8 binds the iOS binary. Web and Android would each need an Apple
 * Services ID and return URL, which are deliberately not configured.
 */
export function shouldOfferApple(platform: Platform): boolean {
  return platform === 'ios';
}

/**
 * Whether to tell a visitor that an Apple-created account lives in the iOS app.
 *
 * Shown unconditionally off iOS. An earlier design gated this on a stored
 * "last provider used" flag, which cannot work: that flag is only ever written
 * inside the iOS WKWebView, whose localStorage origin (https://localhost) is a
 * separate store from the browser's on the deployed domain. The condition could
 * never be true in the one place the notice is needed, so the notice would
 * never render.
 */
export function shouldShowAppleOnlyNotice(platform: Platform): boolean {
  return platform !== 'ios';
}
