/**
 * backfill-shadow-creators.mjs — one-off migration. RUN BEFORE DEPLOYING RULES.
 *
 * Shadow users created before the security fix have no `createdById`. The new
 * rule in firestore.rules only lets a shadow's CREATOR edit it, so without this
 * backfill every legacy shadow becomes uneditable: renaming a shadow friend or
 * saving their Venmo handle fails with permission-denied, and
 * `resolveShadowUserByName` (which filters on createdById) stops finding them,
 * so the same person gets duplicated under a fresh uid — detaching them from
 * their existing ledger balances.
 *
 * Ownership is inferred, in priority order:
 *   1. a user whose `friends` array contains the shadow  (strongest signal)
 *   2. the owner of a bill the shadow appears in
 *   3. a squad member, if exactly one squad contains the shadow
 * Ambiguous or unresolvable shadows are reported and left alone.
 *
 *   node scripts/backfill-shadow-creators.mjs            # dry run, writes nothing
 *   node scripts/backfill-shadow-creators.mjs --apply    # performs the writes
 *
 * Credentials: set GOOGLE_APPLICATION_CREDENTIALS to a service-account key, and
 * FIREBASE_PROJECT to the target project (defaults to the emulator project when
 * FIRESTORE_EMULATOR_HOST is set).
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

// firebase-admin lives only in functions/node_modules (the single copy in this
// repo), so resolve it from there — this script runs from the repo root.
const require_ = createRequire(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../functions/package.json'),
);
const { initializeApp, applicationDefault } = require_('firebase-admin/app');
const { getFirestore, FieldValue } = require_('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');
const projectId =
  process.env.FIREBASE_PROJECT ||
  (process.env.FIRESTORE_EMULATOR_HOST ? 'demo-bill-split-test' : undefined);

if (!projectId) {
  console.error('Set FIREBASE_PROJECT (e.g. divit-6d217) or FIRESTORE_EMULATOR_HOST.');
  process.exit(1);
}

initializeApp(
  process.env.FIRESTORE_EMULATOR_HOST
    ? { projectId }
    : { credential: applicationDefault(), projectId },
);
const db = getFirestore();

async function main() {
  console.log(`project: ${projectId}   mode: ${APPLY ? 'APPLY' : 'dry run'}\n`);

  const shadows = await db.collection('users').where('isShadow', '==', true).get();
  const legacy = shadows.docs.filter((d) => d.data().createdById === undefined);
  console.log(`shadow users: ${shadows.size}   missing createdById: ${legacy.length}`);
  if (legacy.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  const legacyIds = new Set(legacy.map((d) => d.id));

  // 1. friends arrays — a shadow is created as somebody's friend
  const owners = new Map(); // shadowId -> Set of candidate owner uids
  const note = (shadowId, uid) => {
    if (!legacyIds.has(shadowId) || !uid) return;
    if (!owners.has(shadowId)) owners.set(shadowId, new Set());
    owners.get(shadowId).add(uid);
  };

  const allUsers = await db.collection('users').get();
  for (const u of allUsers.docs) {
    if (u.data().isShadow === true) continue;
    for (const friendId of u.data().friends ?? []) note(friendId, u.id);
  }
  const afterFriends = [...owners.keys()].length;

  // 2. bills — the bill owner created the stand-in
  const bills = await db.collection('bills').get();
  for (const b of bills.docs) {
    const data = b.data();
    const ownerId = data.ownerId;
    if (!ownerId) continue;
    for (const p of data.people ?? []) note(p?.id, ownerId);
    for (const id of data.participantIds ?? []) note(id, ownerId);
  }

  // 3. squads — only useful when exactly one real member is present
  const squads = await db.collection('squads').get();
  for (const sq of squads.docs) {
    const memberIds = sq.data().memberIds ?? [];
    const real = memberIds.filter((id) => !legacyIds.has(id) && !String(id).startsWith('guest_'));
    if (real.length !== 1) continue;
    for (const id of memberIds) note(id, real[0]);
  }

  const resolved = [];
  const ambiguous = [];
  const orphaned = [];
  for (const d of legacy) {
    const candidates = owners.get(d.id);
    if (!candidates || candidates.size === 0) orphaned.push(d);
    else if (candidates.size > 1) ambiguous.push([d, [...candidates]]);
    else resolved.push([d, [...candidates][0]]);
  }

  console.log(`  resolved via friends pass: ${afterFriends}`);
  console.log(`  resolved total: ${resolved.length}`);
  console.log(`  ambiguous (multiple candidates): ${ambiguous.length}`);
  console.log(`  orphaned (no candidate): ${orphaned.length}\n`);

  for (const [d, uids] of ambiguous) {
    console.log(`  AMBIGUOUS ${d.id} (${d.data().displayName ?? '?'}) -> ${uids.join(', ')}`);
  }
  for (const d of orphaned) {
    console.log(`  ORPHANED  ${d.id} (${d.data().displayName ?? '?'})`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --apply to commit.');
    return;
  }

  let written = 0;
  for (let i = 0; i < resolved.length; i += 400) {
    const batch = db.batch();
    for (const [d, uid] of resolved.slice(i, i + 400)) {
      batch.update(d.ref, { createdById: uid, _backfilledCreatorAt: FieldValue.serverTimestamp() });
      written++;
    }
    await batch.commit();
  }
  console.log(`\nBackfilled ${written} shadow users.`);
  if (ambiguous.length || orphaned.length) {
    console.log(
      `${ambiguous.length + orphaned.length} left untouched — they stay uneditable until assigned by hand.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
