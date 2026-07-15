/**
 * Integration-test environment guard + firebase-admin bootstrap.
 *
 * SAFETY INVARIANT: these tests may ONLY run against the Firestore emulator.
 * The guard below throws before any Firebase initialization if the emulator
 * env var is missing, and the project ID is a `demo-*` ID, which the Firebase
 * CLI treats as offline-only (no cloud project can ever be reached).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT_ID = 'demo-bill-split-test';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST is not set — refusing to run integration tests ' +
    'against a real Firebase project. Run them via: npm run test:integration'
  );
}

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT_ID });
}

export const db = getFirestore();

/** Wipes all emulator data. Call in beforeEach of every suite. */
export async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`clearFirestore failed: ${res.status} ${await res.text()}`);
  }
}
