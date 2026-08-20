/**
 * Backward-compatibility probe: production already contains shadow users that
 * were created WITHOUT `createdById` (three client call sites omitted it).
 * If the new rule locks their creator out, this is a data migration, not just
 * a rules change.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');
const OWNER = 'uid_owner';
let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules-legacy',
    firestore: { rules: readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'), host: '127.0.0.1', port: 8081 },
  });
});
afterAll(async () => { await testEnv?.cleanup(); });

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    // A LEGACY shadow user: isShadow true, but no createdById field at all.
    await setDoc(doc(ctx.firestore(), 'users', 'legacy_shadow'), {
      uid: 'legacy_shadow', displayName: 'Legacy Guest', isShadow: true,
      friends: [], squadIds: [],
    });
  });
});

describe('legacy shadow users (no createdById)', () => {
  it('are denied until backfilled — this is why the migration must run first', async () => {
    // scripts/backfill-shadow-creators.mjs sets createdById on these documents.
    // Until it runs, the rightful creator cannot edit them. Deploying the rules
    // without running the migration first is a self-inflicted data incident.
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertFails(updateDoc(doc(db, 'users', 'legacy_shadow'), { displayName: 'Renamed' }));
  });

  it('are editable by their creator once backfilled', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'migrated_shadow'), {
        uid: 'migrated_shadow', displayName: 'Guest', isShadow: true,
        createdById: OWNER, friends: [], squadIds: [],
      });
    });
    const db = testEnv.authenticatedContext(OWNER).firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', 'migrated_shadow'), { displayName: 'Renamed' }));
  });

  it('are not editable by anyone else either', async () => {
    const db = testEnv.authenticatedContext('uid_attacker').firestore();
    await assertFails(updateDoc(doc(db, 'users', 'legacy_shadow'), { displayName: 'pwned' }));
  });
});
