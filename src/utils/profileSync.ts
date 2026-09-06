import type { UserProfile } from '@/types/person.types';

/**
 * The subset of a Firebase `User` that profile syncing actually reads.
 */
export interface AuthUserLike {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  phoneNumber?: string | null;
}

/**
 * Seed for the generated username of a brand-new profile.
 *
 * Split out so the Apple first-sign-in path is testable: Apple supplies the
 * user's name exactly once, on the very first authorization, so this is the
 * only moment a real name is available to derive a handle from. A user who
 * chose "Hide My Email" and has no name yields an opaque relay-derived handle,
 * which is worth knowing about — username is the documented way to find friends
 * whose email is hidden.
 */
export function buildNewProfileUsernameSeed(user: AuthUserLike): string {
  return user.displayName || (user.email ? user.email.split('@')[0] : 'user');
}

/** Fields written when creating a profile for a user signing in for the first time. */
export function buildNewProfileFields(
  user: AuthUserLike,
  username: string
): Record<string, unknown> {
  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || 'User',
    username,
    friends: [],
    squadIds: [],
    hasSeenOnboarding: false,
    ...(user.photoURL && { photoURL: user.photoURL }),
    ...(user.phoneNumber && { phoneNumber: user.phoneNumber }),
  };
}

export interface ProfileUpdatePlan {
  /** Firestore-ready field map. Never contains `undefined` — Firestore rejects it. */
  updates: Record<string, unknown>;
  /** True when the stored profile has no username and one must be generated. */
  needsUsername: boolean;
  /** Seed to derive a username from, when `needsUsername` is true. */
  usernameSeed: string;
}

/**
 * Builds the field map written to `users/{uid}` on an existing user's login.
 *
 * Extracted from `userService.syncUserProfile` so the merge rules can be unit
 * tested without Firebase (see `tests/profileSync.test.ts`).
 *
 * The rule that matters: a provider that returns nothing must never erase what
 * is already stored. Sign in with Apple returns the user's name only on the
 * very first authorization, so every subsequent login supplies a null
 * `displayName`. Because `UserProfile.friends` holds bare UIDs and friend rows
 * hydrate from `users/{friendUid}`, blanking a name here propagates into every
 * other user's friends list and balance rows.
 */
export function buildProfileUpdates(
  user: AuthUserLike,
  existing: UserProfile
): ProfileUpdatePlan {
  // A tombstone must never be written back to. If a deleted account's auth user
  // somehow survives — a failed auth deletion, a session token still in flight —
  // an ordinary profile sync would restore the display name, email and photo
  // that deletion just stripped, quietly undoing the erasure. Refuse instead.
  if ((existing as { isDeleted?: boolean }).isDeleted === true) {
    return { updates: {}, needsUsername: false, usernameSeed: '' };
  }

  const updates: Record<string, unknown> = {
    // Fall back through the provider, then the stored value, and only then to
    // the generic placeholder. Never downgrade a real value to a placeholder.
    displayName: user.displayName || existing.displayName || 'User',
    email: user.email || existing.email || '',
  };

  // Only adopt the OAuth photo if the user has not uploaded their own.
  if (user.photoURL && !existing.hasCustomPhoto) {
    updates.photoURL = user.photoURL;
  }

  if (user.phoneNumber) {
    updates.phoneNumber = user.phoneNumber;
  }

  return {
    updates,
    needsUsername: !existing.username,
    usernameSeed: user.displayName || existing.displayName || user.email?.split('@')[0] || 'user',
  };
}
