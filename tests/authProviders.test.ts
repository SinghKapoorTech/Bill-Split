import { describe, it, expect } from 'vitest';
import {
  isSilentAuthCancellation,
  describeSignInError,
  shouldOfferApple,
  shouldShowAppleWebHelpNotice,
  hasTrustedEmail,
} from '@/utils/authProviders';

// Sign in with Apple is required by App Store Review Guideline 4.8. These are
// the pure decisions around it: what counts as a user cancellation (which must
// never surface an error toast), what a provider collision should say, and
// where the Apple button belongs.

describe('isSilentAuthCancellation', () => {
  it('treats the web popup cancellation codes as silent', () => {
    expect(isSilentAuthCancellation({ code: 'auth/cancelled-popup-request' })).toBe(true);
    expect(isSilentAuthCancellation({ code: 'auth/popup-closed-by-user' })).toBe(true);
    expect(isSilentAuthCancellation({ code: 'auth/user-cancelled' })).toBe(true);
  });

  it('treats spelling variants of "cancel" as silent', () => {
    expect(isSilentAuthCancellation({ message: 'The user canceled the sign-in.' })).toBe(true);
    expect(isSilentAuthCancellation({ message: 'The user cancelled the sign-in.' })).toBe(true);
    expect(isSilentAuthCancellation({ message: 'CANCELED' })).toBe(true);
  });

  // The plugin's iOS helper (FirebaseAuthenticationHelper.createErrorCode) maps
  // ONLY Firebase AuthErrorCode raw values (17xxx). ASAuthorizationError.canceled
  // is 1001 in a different domain, so it maps to nil and the rejection carries
  // no code at all — just the NSError's localizedDescription. Detection has to
  // work off that string.
  describe('the native Apple sheet dismissal (ASAuthorizationError 1001)', () => {
    it('is silent when it arrives as the English NSError description', () => {
      expect(
        isSilentAuthCancellation({
          message:
            "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1001.)",
        })
      ).toBe(true);
    });

    it('is silent on a non-English device, where only the domain and number survive', () => {
      // NSError localizes the sentence but never the domain, and the order of
      // domain and code flips in several locales.
      expect(
        isSilentAuthCancellation({
          message:
            "L'opération n'a pas pu s'achever. (Erreur com.apple.AuthenticationServices.AuthorizationError 1001.)",
        })
      ).toBe(true);
      expect(
        isSilentAuthCancellation({
          message:
            '操作を完了できませんでした。(com.apple.AuthenticationServices.AuthorizationError エラー 1001。)',
        })
      ).toBe(true);
    });

    it('is still silent if the plugin ever does surface a numeric code', () => {
      expect(isSilentAuthCancellation({ code: '1001' })).toBe(true);
      expect(isSilentAuthCancellation({ code: 1001 })).toBe(true);
    });

    it('does not swallow a different AuthorizationError, which is a real failure', () => {
      // 1000 is ASAuthorizationError.unknown — the user did not cancel.
      expect(
        isSilentAuthCancellation({
          message:
            "The operation couldn't be completed. (com.apple.AuthenticationServices.AuthorizationError error 1000.)",
        })
      ).toBe(false);
    });
  });

  it('does not swallow real failures', () => {
    expect(isSilentAuthCancellation({ code: 'auth/network-request-failed' })).toBe(false);
    expect(isSilentAuthCancellation({ code: 'auth/invalid-credential' })).toBe(false);
    expect(isSilentAuthCancellation({ message: 'Something went wrong' })).toBe(false);
    expect(isSilentAuthCancellation(undefined)).toBe(false);
    expect(isSilentAuthCancellation(null)).toBe(false);
  });

  it('does not treat an unrelated error containing 1001 as a cancellation', () => {
    expect(isSilentAuthCancellation({ message: 'Request id 1001 failed' })).toBe(false);
  });
});

describe('describeSignInError', () => {
  // The collision message must name the provider that OWNS the account, which
  // is the one the user did not just try. Hardcoding "Google" sends an
  // Apple-created user back to the button that just failed — an infinite loop
  // with no way to reach their account.
  it('points an Apple attempt at the Google account that owns the email', () => {
    const message = describeSignInError(
      { code: 'auth/account-exists-with-different-credential' },
      'apple'
    );

    expect(message).toContain('Google');
    expect(message).not.toContain('Apple');
  });

  it('points a Google attempt at the Apple account that owns the email', () => {
    const message = describeSignInError(
      { code: 'auth/account-exists-with-different-credential' },
      'google'
    );

    expect(message).toContain('Apple');
    expect(message).not.toContain('Google');
  });

  it('does not offer to link the two, which Divit deliberately does not support', () => {
    const message = describeSignInError(
      { code: 'auth/account-exists-with-different-credential' },
      'apple'
    );

    expect(message.toLowerCase()).not.toContain('link');
  });

  it('explains an unconfigured provider rather than leaking the raw Firebase string', () => {
    expect(describeSignInError({ code: 'auth/operation-not-allowed' }, 'apple')).toMatch(
      /not available|unavailable/i
    );
  });

  it('gives a readable message for a network failure', () => {
    expect(describeSignInError({ code: 'auth/network-request-failed' }, 'google')).toMatch(
      /connection|network/i
    );
  });

  it('falls back to the raw message when the code is unknown', () => {
    expect(describeSignInError({ code: 'auth/weird', message: 'Boom' }, 'google')).toBe('Boom');
  });

  it('never returns an empty string', () => {
    expect(describeSignInError({}, 'google').length).toBeGreaterThan(0);
    expect(describeSignInError(undefined, 'apple').length).toBeGreaterThan(0);
  });
});

describe('shouldOfferApple', () => {
  // Scope decision: iOS only. Guideline 4.8 binds the iOS binary; web and
  // Android would each need a Services ID and return URL that are not set up.
  it('offers Apple on iOS', () => {
    expect(shouldOfferApple('ios')).toBe(true);
  });

  it('does not offer Apple on web or Android', () => {
    expect(shouldOfferApple('web')).toBe(false);
    expect(shouldOfferApple('android')).toBe(false);
  });
});

describe('shouldShowAppleWebHelpNotice', () => {
  // An account created with Apple on iPhone has no credential that works
  // anywhere else. The notice cannot be conditioned on a stored "last provider"
  // flag: that flag is written inside the iOS WKWebView, whose localStorage
  // origin (https://localhost) is a different store from the browser's, so the
  // condition could never be true where it matters. It has to show
  // unconditionally off iOS.
  it('shows on web, where an Apple account cannot sign in at all', () => {
    expect(shouldShowAppleWebHelpNotice('web')).toBe(true);
  });

  it('shows on Android for the same reason', () => {
    expect(shouldShowAppleWebHelpNotice('android')).toBe(true);
  });

  it('never shows on iOS, where the Apple button is right there', () => {
    expect(shouldShowAppleWebHelpNotice('ios')).toBe(false);
  });
});

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
    // The fallback exists so trust does not hinge on a single field: the
    // provider vouched for the address at authorization time, so a session that
    // reaches us without the flag set is still trustworthy. Whether Apple
    // sessions actually arrive that way has NOT been observed on a real device
    // — treat this as belt-and-braces, not as a documented Apple behaviour.
    expect(
      hasTrustedEmail({
        email: 'user@privaterelay.appleid.com',
        providerData: [{ providerId: 'apple.com', email: 'user@privaterelay.appleid.com' }],
      })
    ).toBe(true);
  });

  // The hazard from the later linking task: a password credential linked to a
  // Google account can move the account email to an address Google never verified.
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
