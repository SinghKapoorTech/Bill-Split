/**
 * Seed helpers for creating test users via Firebase Emulator REST APIs.
 * These bypass the UI to set up preconditions (e.g. a second user who
 * can be added as a friend or event member).
 */

const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const FIRESTORE_EMULATOR = 'http://127.0.0.1:8081';
const PROJECT_ID = 'divit-6d217';

/**
 * Clears ALL data from the Firebase emulators (Auth + Firestore).
 * Call this at the start of a test to ensure a clean slate.
 */
export async function clearEmulatorData() {
  await Promise.all([
    fetch(
      `${FIRESTORE_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
      { method: 'DELETE' }
    ),
    fetch(
      `${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/accounts`,
      { method: 'DELETE' }
    ),
  ]);
}

export interface TestUser {
  uid: string;
  email: string;
  displayName: string;
  username: string;
}

/**
 * Creates a Firebase Auth user in the emulator and writes their
 * Firestore profile so the app can find them by email or username.
 *
 * If the auth user already exists (EMAIL_EXISTS), looks up the
 * existing UID and re-writes the Firestore profile.
 */
export async function createTestUser(
  email: string,
  displayName: string
): Promise<TestUser> {
  const username = displayName.toLowerCase().replace(/\s+/g, '_');
  let uid: string;

  // 1. Create user in Auth emulator (or look up existing)
  const authRes = await fetch(
    `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'testPassword123',
        displayName,
        returnSecureToken: true,
      }),
    }
  );

  if (authRes.ok) {
    const authData = await authRes.json();
    uid = authData.localId;
  } else {
    // User might already exist (from a previous run / retry)
    const errBody = await authRes.json();
    if (errBody?.error?.message === 'EMAIL_EXISTS') {
      // Look up the existing user via signInWithPassword
      const signInRes = await fetch(
        `${AUTH_EMULATOR}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: 'testPassword123', returnSecureToken: true }),
        }
      );
      if (!signInRes.ok) {
        throw new Error(`Failed to sign in existing user: ${await signInRes.text()}`);
      }
      const signInData = await signInRes.json();
      uid = signInData.localId;
    } else {
      throw new Error(`Auth emulator signUp failed: ${JSON.stringify(errBody)}`);
    }
  }

  // 2. Write Firestore user profile (use "Bearer owner" to bypass security rules)
  const fsUrl = `${FIRESTORE_EMULATOR}/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`;

  const fsRes = await fetch(fsUrl, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer owner',
    },
    body: JSON.stringify({
      fields: {
        uid: { stringValue: uid },
        displayName: { stringValue: displayName },
        email: { stringValue: email },
        username: { stringValue: username },
        friends: { arrayValue: { values: [] } },
      },
    }),
  });

  if (!fsRes.ok) {
    throw new Error(`Firestore profile write failed: ${await fsRes.text()}`);
  }

  return { uid, email, displayName, username };
}
