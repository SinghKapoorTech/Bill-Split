/**
 * seed-demo-data.mjs — populates the BETA Firebase project with realistic demo
 * data so App Store captures show populated screens instead of empty states.
 *
 * Seeds bills only. `balances` / `event_balances` are left for the deployed
 * ledger pipeline to compute, so every figure on screen is real output of the
 * app's own Stage 2/3 code rather than a hand-written fixture.
 *
 * Usage:
 *   node scripts/seed-demo-data.mjs --me <MY_UID>              # dry run
 *   node scripts/seed-demo-data.mjs --me <MY_UID> --commit      # write to beta
 *   node scripts/seed-demo-data.mjs --me <MY_UID> --commit --teardown
 *
 * <MY_UID> is the Firebase UID of the account signed into the simulator build.
 *
 * Auth: reuses the firebase-tools CLI OAuth token. No gcloud ADC required.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT = 'divit-beta'; // NEVER prod
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const argv = process.argv.slice(2);
const COMMIT = argv.includes('--commit');
const TEARDOWN = argv.includes('--teardown');
const ME = argv[argv.indexOf('--me') + 1];

if (!argv.includes('--me') || !ME || ME.startsWith('--')) {
  console.error('Missing --me <MY_UID>. See the header of this file.');
  process.exit(1);
}
if (PROJECT !== 'divit-beta') {
  console.error(`Refusing to run against ${PROJECT}.`);
  process.exit(1);
}

// ── auth ────────────────────────────────────────────────────────────────────
const TOKEN_FILE = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
if (!fs.existsSync(TOKEN_FILE)) {
  console.error(`No firebase-tools token at ${TOKEN_FILE}. Run: firebase login`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
const tokens = cfg.tokens || {};

/**
 * Uses the access token the firebase CLI already cached. We deliberately do NOT
 * implement an OAuth refresh here: that would require hardcoding firebase-tools'
 * client id and secret, and inventing credentials is not acceptable. If the
 * cached token has expired the script fails with an actionable message.
 */
function accessToken() {
  const t = tokens.access_token;
  if (!t) {
    throw new Error(`No cached access_token in ${TOKEN_FILE}. Run: firebase login --reauth`);
  }
  const expiresAt = tokens.expires_at || 0;
  if (expiresAt && expiresAt < Date.now() + 60_000) {
    throw new Error(
      'Cached firebase CLI token is expired or expiring.\n' +
        'Refresh it with any CLI call, e.g.:  firebase projects:list\n' +
        'then re-run this script.',
    );
  }
  return t;
}

// ── Firestore REST value encoding ───────────────────────────────────────────
function toValue(v) {
  if (v === null) return { nullValue: null };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  switch (typeof v) {
    case 'string':
      return { stringValue: v };
    case 'boolean':
      return { booleanValue: v };
    case 'number':
      return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    case 'object':
      return { mapValue: { fields: toFields(v) } };
    default:
      throw new Error(`Unsupported value type: ${typeof v}`);
  }
}
const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]));

/**
 * Writes a document.
 *
 * IMPORTANT: a Firestore REST PATCH *without* updateMask replaces the whole
 * document — any field absent from the request is deleted. Pass `mergeFields`
 * to build an updateMask and get true merge semantics. This matters for
 * users/{ME}, which is a real profile we must not clobber.
 */
async function writeDoc(collection, id, data, mergeFields = null) {
  const label = `${collection}/${id}`;
  const mask = mergeFields
    ? '?' + mergeFields.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join('&')
    : '';
  if (!COMMIT) {
    console.log(
      `[dry-run] would write ${label}` +
        (mergeFields ? ` (merge: ${mergeFields.join(', ')})` : ' (full replace)'),
    );
    return;
  }
  const res = await fetch(`${BASE}/${collection}/${id}${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
  });
  if (!res.ok) throw new Error(`write ${label} failed: ${res.status} ${await res.text()}`);
  console.log(`wrote ${label}`);
}

async function deleteDoc(collection, id) {
  const label = `${collection}/${id}`;
  if (!COMMIT) {
    console.log(`[dry-run] would delete ${label}`);
    return;
  }
  const res = await fetch(`${BASE}/${collection}/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`delete ${label} failed: ${res.status} ${await res.text()}`);
  }
  console.log(`deleted ${label}`);
}

// ── demo cast (fictional; colored-initials avatars, no fabricated photos) ───
const FRIENDS = [
  { uid: 'demoPriya7f2a', name: 'Priya M.', venmoId: 'priya-m' },
  { uid: 'demoDev4c91', name: 'Dev S.', venmoId: 'dev-s' },
  { uid: 'demoAisha2b58', name: 'Aisha K.', venmoId: 'aisha-k' },
  { uid: 'demoMarcus9e33', name: 'Marcus T.', venmoId: 'marcus-t' },
];
const [PRIYA, DEV, AISHA, MARCUS] = FRIENDS.map((f) => f.uid);
const EVENT_ID = 'demoEventTahoe';
// Squads are a separate `squads` collection keyed from users/{uid}.squadIds
// (src/services/squadService.ts:105-118), with members hydrated from `users`.
const SQUADS = [
  {
    id: 'demoSquadRoommates',
    name: 'Roommates',
    description: 'Rent, utilities, groceries',
    members: ['demoPriya7f2a', 'demoDev4c91'],
  },
  {
    id: 'demoSquadSkiCrew',
    name: 'Ski Crew',
    description: 'Tahoe regulars',
    members: ['demoPriya7f2a', 'demoDev4c91', 'demoMarcus9e33'],
  },
  {
    id: 'demoSquadBrunch',
    name: 'Brunch Club',
    description: 'Sunday standing order',
    members: ['demoAisha2b58', 'demoPriya7f2a'],
  },
];
const pid = (uid) => `user-${uid}`;
const nameFor = (uid) => (uid === ME ? 'You' : FRIENDS.find((f) => f.uid === uid).name);
const d = (iso) => new Date(iso);

/** Mirrors tests/integration/helpers/builders.ts conventions. */
function bill({
  id,
  paidById,
  people,
  items,
  tax = 0,
  tip = 0,
  itemAssignments = {},
  splitEvenly = false,
  eventId,
  restaurantName,
  title,
  settledPersonIds = [],
  date,
}) {
  const subtotal = items.reduce((s, it) => s + it.price, 0);
  const built = items.map((it, i) => ({ id: `item-${i + 1}`, name: it.name, price: it.price }));
  return {
    id,
    data: {
      billType: eventId ? 'event' : 'private',
      ownerId: ME,
      paidById,
      ...(eventId && { eventId }),
      ...(title && { title }),
      billData: {
        items: built,
        subtotal,
        tax,
        tip,
        total: subtotal + tax + tip,
        ...(restaurantName && { restaurantName }),
      },
      people: people.map((uid) => ({ id: pid(uid), name: nameFor(uid) })),
      itemAssignments,
      splitEvenly,
      settledPersonIds,
      participantIds: people,
      _seedDemo: true, // marker for teardown
      createdAt: date,
      updatedAt: date,
      lastActivity: date,
    },
  };
}

const BILLS = [
  // Frames 01 + 02 are captured from this bill's wizard.
  bill({
    id: 'demoBillOsteria',
    paidById: ME,
    // `title` drives the wizard's header. Without it the header falls back to
    // the creation date ("Jul 24, 2026"), which reads far worse in a store
    // screenshot than the restaurant name.
    title: 'Osteria Nino',
    restaurantName: 'Osteria Nino',
    people: [ME, PRIYA, DEV, AISHA],
    items: [
      { name: 'Margherita Pizza', price: 18.0 },
      { name: 'Cacio e Pepe', price: 24.0 },
      { name: 'Burrata', price: 16.0 },
      { name: 'Branzino', price: 38.0 },
      { name: 'Tiramisu', price: 12.0 },
      { name: 'Bottle of Chianti', price: 42.0 },
    ],
    tax: 13.5,
    tip: 27.0,
    itemAssignments: {
      'item-1': [pid(ME), pid(PRIYA)],
      'item-2': [pid(DEV)],
      'item-3': [pid(ME), pid(PRIYA), pid(DEV)],
      'item-4': [pid(AISHA)],
      'item-5': [pid(ME), pid(AISHA)],
      'item-6': [pid(ME), pid(PRIYA), pid(DEV), pid(AISHA)],
    },
    date: d('2026-07-24T19:40:00Z'),
  }),
  bill({
    id: 'demoBillUber',
    paidById: ME,
    title: 'Uber to the airport',
    people: [ME, MARCUS, AISHA],
    items: [{ name: 'Uber to the airport', price: 64.8 }],
    splitEvenly: true,
    date: d('2026-07-21T05:15:00Z'),
  }),
  // Event bills — frame 05. Mixed payers produce both owed-to-you and you-owe rows.
  bill({
    id: 'demoBillCabin',
    paidById: PRIYA,
    eventId: EVENT_ID,
    title: 'Cabin — 2 nights',
    people: [ME, PRIYA, DEV, MARCUS],
    items: [{ name: 'Cabin — 2 nights', price: 480.0 }],
    splitEvenly: true,
    date: d('2026-07-18T16:00:00Z'),
  }),
  bill({
    id: 'demoBillGroceries',
    paidById: ME,
    eventId: EVENT_ID,
    title: 'Groceries + firewood',
    people: [ME, PRIYA, DEV, MARCUS],
    items: [{ name: 'Groceries + firewood', price: 128.4 }],
    splitEvenly: true,
    date: d('2026-07-18T21:30:00Z'),
  }),
  bill({
    id: 'demoBillLifts',
    paidById: DEV,
    eventId: EVENT_ID,
    title: 'Lift tickets',
    people: [ME, PRIYA, DEV, MARCUS],
    items: [{ name: 'Lift tickets', price: 396.0 }],
    splitEvenly: true,
    date: d('2026-07-19T08:00:00Z'),
  }),
  // Fully settled: proves settled state renders without polluting balances.
  bill({
    id: 'demoBillSushi',
    paidById: ME,
    restaurantName: 'Sushi Kaze',
    people: [ME, AISHA],
    items: [{ name: 'Omakase for two', price: 88.0 }],
    splitEvenly: true,
    settledPersonIds: [pid(AISHA)],
    date: d('2026-07-11T20:00:00Z'),
  }),
  // Deliberately EMPTY (no items) so the wizard opens on step 1 (Bill Entry)
  // with the AI Scan tab, which is where the receipt-scanning frame is captured.
  // A bill with items and a title opens straight on Review instead.
  bill({
    id: 'demoBillScan',
    paidById: ME,
    people: [ME],
    items: [],
    date: d('2026-07-28T12:00:00Z'),
  }),
];

// ── run ─────────────────────────────────────────────────────────────────────
console.log(`${TEARDOWN ? 'Tearing down' : 'Seeding'} demo data on ${PROJECT}`);
console.log(COMMIT ? 'MODE: COMMIT (writes)' : 'MODE: DRY RUN (no writes)');
console.log(`capture account: ${ME}\n`);

if (TEARDOWN) {
  for (const b of BILLS) await deleteDoc('bills', b.id);
  await deleteDoc('events', EVENT_ID);
  for (const s of SQUADS) await deleteDoc('squads', s.id);
  for (const f of FRIENDS) await deleteDoc('users', f.uid);
  console.log('\nNote: balance docs are removed by the pipeline reacting to bill deletes.');
  console.log(`Note: users/${ME}.friends still references the deleted demo UIDs.`);
} else {
  // Shadow-user friends. resolveEligibleFriends unions users with
  // isShadow == true and createdById == owner.
  //
  // The shape here MUST mirror what the app itself writes for shadow users
  // (src/services/userService.ts:283). In particular `uid` is REQUIRED:
  // getActiveBalances (src/services/userService.ts:~424) dedupes with
  // `seenIds.has(profile.uid)`, reading the uid FIELD rather than the document
  // id. Omitting it makes every friend's uid `undefined`, so the first friend
  // is kept, `undefined` is added to seenIds, and every subsequent friend is
  // silently dropped — the Dashboard then shows exactly one balance row no
  // matter how many balances exist.
  for (const f of FRIENDS) {
    await writeDoc('users', f.uid, {
      uid: f.uid,
      displayName: f.name,
      username: f.venmoId,
      venmoId: f.venmoId,
      isShadow: true,
      createdById: ME,
      friends: [ME],
      squadIds: [],
      createdAt: d('2026-07-10T12:00:00Z'),
      lastLoginAt: d('2026-07-10T12:00:00Z'),
      _seedDemo: true,
    });
  }
  // MERGE ONLY — this is the real signed-in profile. Without mergeFields the
  // PATCH would delete displayName, photoURL, squads and hasSeenOnboarding.
  // `displayName` and `photoURL` are overridden for presentation. The capture
  // account's real Google identity leaks into screenshots: the Settle Up modal
  // renders the first name uppercased ("BOB") and the event header lists it
  // ("bob L."), while its Google photo renders as a near-black circle beside the
  // friends' clean initials avatars.
  //
  // photoURL must be DELETED, not set to ''. Listing it in the mask while
  // omitting it from the data is how a Firestore REST PATCH removes a field.
  // An empty string does NOT work: it is falsy in JS but the avatar component
  // still renders <img src="">, which resolves to the page URL and paints as a
  // black broken image instead of falling back to colored initials.
  //
  // Note the Settle Up modal reads `user.displayName` from Firebase AUTH, not
  // this document, so the Auth record must be updated too (accounts:update).
  await writeDoc(
    'users',
    ME,
    {
      friends: FRIENDS.map((f) => f.uid),
      venmoId: 'divit-demo',
      displayName: 'Sam R.',
      squadIds: SQUADS.map((s) => s.id),
    },
    ['friends', 'venmoId', 'displayName', 'photoURL', 'squadIds'],
  );
  for (const s of SQUADS) {
    await writeDoc('squads', s.id, {
      name: s.name,
      description: s.description,
      memberIds: [ME, ...s.members],
      createdAt: d('2026-07-05T12:00:00Z'),
      updatedAt: d('2026-07-05T12:00:00Z'),
      _seedDemo: true,
    });
  }
  await writeDoc('events', EVENT_ID, {
    name: 'Tahoe Weekend',
    description: 'Ski trip — 4 of us, 3 receipts',
    ownerId: ME,
    memberIds: [ME, PRIYA, DEV, MARCUS],
    _seedDemo: true,
    createdAt: d('2026-07-18T15:00:00Z'),
    updatedAt: d('2026-07-19T08:00:00Z'),
  });
  // Merge ONLY the fields we own. A maskless PATCH is a full replace, which
  // would wipe the pipeline-managed footprint fields (`processedBalances`,
  // `processedEventBalances`, `_ledgerVersion`). Losing those makes the ledger
  // forget what it already applied, so a re-seed re-applies each bill's
  // footprint on top of the existing balances and every amount DOUBLES.
  // Masking these writes is what makes re-seeding genuinely idempotent.
  for (const b of BILLS) await writeDoc('bills', b.id, b.data, Object.keys(b.data));
}

console.log(COMMIT ? '\nDone.' : '\nDry run complete. Re-run with --commit to apply.');
