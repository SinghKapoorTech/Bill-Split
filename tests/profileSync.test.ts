import { describe, it, expect } from 'vitest';
import {
  buildProfileUpdates,
  buildNewProfileFields,
  buildNewProfileUsernameSeed,
} from '@/utils/profileSync';
import type { UserProfile } from '@/types/person.types';

// Regression coverage for the name-clobbering bug that Sign in with Apple makes
// certain rather than occasional.
//
// Apple returns the user's full name ONLY on the very first authorization, ever.
// Every login after that hands Firebase a null displayName. The old code wrote
// `displayName: user.displayName || 'User'` on every login, so the second Apple
// login renamed the person to "User".
//
// This is not a cosmetic bug: `UserProfile.friends` is a `string[]` of UIDs and
// friend rows hydrate from `users/{friendUid}` (userService.getHydratedFriends),
// so the rename propagates into every OTHER user's friends list and balance rows.

const existing = (over: Partial<UserProfile> = {}): UserProfile =>
  ({
    uid: 'u1',
    email: 'sarah@example.com',
    displayName: 'Sarah Chen',
    username: 'sarah-chen',
    friends: [],
    squadIds: [],
    ...over,
  }) as UserProfile;

describe('buildProfileUpdates', () => {
  it('preserves the stored name when the provider returns no displayName', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: 'sarah@example.com', displayName: null, photoURL: null },
      existing()
    );

    expect(updates.displayName).toBe('Sarah Chen');
  });

  it('preserves the stored email when the provider returns no email', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: null, displayName: null, photoURL: null },
      existing()
    );

    expect(updates.email).toBe('sarah@example.com');
  });

  it('accepts a fresh name from the provider when one is supplied', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: 'sarah@example.com', displayName: 'Sarah C', photoURL: null },
      existing()
    );

    expect(updates.displayName).toBe('Sarah C');
  });

  it('keeps an Apple private relay address rather than blanking it', () => {
    const relay = 'abc123@privaterelay.appleid.com';
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: relay, displayName: null, photoURL: null },
      existing({ email: relay })
    );

    expect(updates.email).toBe(relay);
  });

  it('still falls back to "User" when there is no stored name and none supplied', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: null, displayName: null, photoURL: null },
      existing({ displayName: '' })
    );

    expect(updates.displayName).toBe('User');
  });

  it('does not overwrite a custom photo with the provider photo', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: null, displayName: null, photoURL: 'https://oauth/pic.jpg' },
      existing({ hasCustomPhoto: true, photoURL: 'https://divit/custom.jpg' })
    );

    expect(updates.photoURL).toBeUndefined();
  });

  it('adopts the provider photo when the user has not uploaded a custom one', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: null, displayName: null, photoURL: 'https://oauth/pic.jpg' },
      existing()
    );

    expect(updates.photoURL).toBe('https://oauth/pic.jpg');
  });

  it('never emits an undefined value, which Firestore rejects', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: null, displayName: null, photoURL: null, phoneNumber: null },
      existing()
    );

    for (const [key, value] of Object.entries(updates)) {
      expect(value, `${key} must not be undefined`).not.toBeUndefined();
    }
  });

  it('reports that a username needs generating only when one is missing', () => {
    expect(
      buildProfileUpdates(
        { uid: 'u1', email: null, displayName: null, photoURL: null },
        existing({ username: undefined })
      ).needsUsername
    ).toBe(true);

    expect(
      buildProfileUpdates(
        { uid: 'u1', email: null, displayName: null, photoURL: null },
        existing()
      ).needsUsername
    ).toBe(false);
  });
});

// The first-sign-in branch. For Sign in with Apple this is the one and only
// moment a real name is available — Apple returns the full name on the initial
// authorization and never again.
describe('buildNewProfileFields', () => {
  it('captures the name Apple supplies on the very first authorization', () => {
    const fields = buildNewProfileFields(
      {
        uid: 'u2',
        email: 'sarah@icloud.com',
        displayName: 'Sarah Chen',
        photoURL: null,
      },
      'sarah-chen'
    );

    expect(fields.displayName).toBe('Sarah Chen');
    expect(fields.email).toBe('sarah@icloud.com');
    expect(fields.username).toBe('sarah-chen');
  });

  it('starts a Hide My Email user with their relay address and no name', () => {
    const fields = buildNewProfileFields(
      {
        uid: 'u3',
        email: 'xyz789@privaterelay.appleid.com',
        displayName: null,
        photoURL: null,
      },
      'xyz789'
    );

    expect(fields.email).toBe('xyz789@privaterelay.appleid.com');
    expect(fields.displayName).toBe('User');
  });

  it('omits optional fields rather than writing undefined, which Firestore rejects', () => {
    const fields = buildNewProfileFields(
      { uid: 'u4', email: null, displayName: null, photoURL: null, phoneNumber: null },
      'user'
    );

    expect('photoURL' in fields).toBe(false);
    expect('phoneNumber' in fields).toBe(false);
    for (const [key, value] of Object.entries(fields)) {
      expect(value, `${key} must not be undefined`).not.toBeUndefined();
    }
  });

  it('starts every profile with empty friends and squads', () => {
    const fields = buildNewProfileFields(
      { uid: 'u5', email: null, displayName: null, photoURL: null },
      'user'
    );

    expect(fields.friends).toEqual([]);
    expect(fields.squadIds).toEqual([]);
    expect(fields.hasSeenOnboarding).toBe(false);
  });
});

describe('buildNewProfileUsernameSeed', () => {
  it('prefers the name Apple supplied once', () => {
    expect(
      buildNewProfileUsernameSeed({
        uid: 'u6',
        email: 'sarah@icloud.com',
        displayName: 'Sarah Chen',
        photoURL: null,
      })
    ).toBe('Sarah Chen');
  });

  it('falls back to the email local part when no name is given', () => {
    expect(
      buildNewProfileUsernameSeed({
        uid: 'u7',
        email: 'xyz789@privaterelay.appleid.com',
        displayName: null,
        photoURL: null,
      })
    ).toBe('xyz789');
  });

  it('falls back to a generic seed when there is neither', () => {
    expect(
      buildNewProfileUsernameSeed({ uid: 'u8', email: null, displayName: null, photoURL: null })
    ).toBe('user');
  });
});

// A deleted account must stay deleted. If a tombstoned user's auth session ever
// survives — a failed auth deletion, a token still in flight — an ordinary
// profile sync would write displayName, email and photoURL straight back over
// the stripped tombstone, quietly undoing the erasure Apple requires.
describe('buildProfileUpdates refuses to resurrect a tombstone', () => {
  const tombstone = () =>
    ({
      uid: 'u1',
      displayName: 'Sarah',
      isDeleted: true,
      friends: [],
      squadIds: [],
    }) as unknown as UserProfile;

  it('returns no updates at all for a deleted account', () => {
    const { updates } = buildProfileUpdates(
      {
        uid: 'u1',
        email: 'sarah@example.com',
        displayName: 'Sarah Chen',
        photoURL: 'https://oauth/pic.jpg',
        phoneNumber: '+15550001111',
      },
      tombstone()
    );

    expect(Object.keys(updates)).toHaveLength(0);
  });

  it('does not try to mint a username for a deleted account', () => {
    const plan = buildProfileUpdates(
      { uid: 'u1', email: 'sarah@example.com', displayName: 'Sarah Chen', photoURL: null },
      tombstone()
    );

    expect(plan.needsUsername).toBe(false);
  });

  it('still syncs a normal account, so the guard is not over-broad', () => {
    const { updates } = buildProfileUpdates(
      { uid: 'u1', email: 'sarah@example.com', displayName: 'Sarah Chen', photoURL: null },
      existing()
    );

    expect(Object.keys(updates).length).toBeGreaterThan(0);
  });
});
