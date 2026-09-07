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
 * Whether to tell a visitor how to reach an Apple-created account from here.
 *
 * Shown unconditionally off iOS. An earlier design gated this on a stored
 * "last provider used" flag, which cannot work: that flag is only ever written
 * inside the iOS WKWebView, whose localStorage origin (https://localhost) is a
 * separate store from the browser's on the deployed domain. The condition could
 * never be true in the one place the notice is needed, so the notice would
 * never render.
 *
 * The advice this drives changed when password linking shipped. It used to be a
 * dead end — "that account only works in the iOS app" — and is now an
 * instruction, because adding a password in the iOS app makes the same account,
 * and the same ledger, reachable here.
 */
export function shouldShowAppleWebHelpNotice(platform: Platform): boolean {
  return platform !== 'ios';
}

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
 * credential can be linked to an OAuth account under a different address (the
 * forthcoming account-linking UI does exactly this), which leaves `providerData`
 * still holding a `google.com` entry for the ORIGINAL address while `user.email`
 * points at the new, unverified one. Requiring the provider's own email to equal
 * the account email stops that stale entry from vouching for an address its
 * provider never saw.
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

/** Which form the user was filling in. Signup earns more helpful copy. */
export type PasswordAuthIntent = 'signin' | 'signup' | 'link' | 'reset';

/**
 * Human-readable copy for an email/password failure.
 *
 * Deliberately vague on sign-in. Firebase's email-enumeration protection is
 * enabled, which collapses `wrong-password` and `user-not-found` into
 * `invalid-credential` precisely so an attacker cannot use the login form to
 * discover which addresses have accounts. Copy that says "no account found"
 * hands that back, so both codes map to one indistinguishable sentence.
 *
 * Signup is the exception, and deliberately so. `email-already-in-use` tells
 * someone something they are entitled to know about their own address, and it
 * is the single most likely error for the case this feature exists to serve: an
 * Apple user who cannot get in on the web and does not realise they already
 * have an account.
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
      return intent === 'link'
        ? 'That email is already linked to another Divit account.'
        : 'That email is already in use.';
    default:
      return message || 'Something went wrong. Please try again.';
  }
}
