import { describe, it, expect } from 'vitest';
import { describePasswordAuthError } from '@/utils/authProviders';

// Sign-in copy is vague on purpose. Firebase's email-enumeration protection is
// left enabled, which is what collapses wrong-password and user-not-found into
// a single `invalid-credential`. Copy that distinguished them would turn the
// login form back into an oracle for "does this person have a Divit account?"
describe('describePasswordAuthError', () => {
  it('stays vague about whether the account exists', () => {
    const message = describePasswordAuthError({ code: 'auth/invalid-credential' }, 'signin');
    expect(message).toMatch(/email or password/i);
    expect(message).not.toMatch(/no account|not found|does not exist/i);
  });

  it('uses identical copy for wrong-password and user-not-found', () => {
    const wrong = describePasswordAuthError({ code: 'auth/wrong-password' }, 'signin');
    const missing = describePasswordAuthError({ code: 'auth/user-not-found' }, 'signin');
    expect(wrong).toBe(missing);
  });

  // The one case where being helpful beats being vague: the person is telling
  // us their own address, and the account they cannot reach is quite possibly
  // an Apple one — exactly the problem this feature exists to solve.
  it('points a colliding signup at the account they already have', () => {
    const message = describePasswordAuthError({ code: 'auth/email-already-in-use' }, 'signup');
    expect(message).toMatch(/already has a Divit account/i);
    expect(message).toMatch(/Google or Apple/i);
  });

  it('explains a weak password concretely rather than just rejecting it', () => {
    expect(describePasswordAuthError({ code: 'auth/weak-password' }, 'signup')).toMatch(
      /at least 6 characters/i
    );
  });

  it('offers a way forward when the provider is switched off', () => {
    // Fires until Email/Password is enabled in the Firebase console.
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

  it('names the other account only in the linking context', () => {
    expect(
      describePasswordAuthError({ code: 'auth/credential-already-in-use' }, 'link')
    ).toMatch(/linked to another/i);
    expect(
      describePasswordAuthError({ code: 'auth/credential-already-in-use' }, 'signin')
    ).not.toMatch(/linked/i);
  });

  it('falls back to something actionable for an unknown code', () => {
    expect(describePasswordAuthError({ code: 'auth/whatever' }, 'signin')).toMatch(/try again/i);
  });

  it('survives a null error without throwing', () => {
    expect(describePasswordAuthError(null, 'signin')).toMatch(/try again/i);
  });
});
