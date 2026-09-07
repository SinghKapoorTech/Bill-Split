#!/usr/bin/env node
/**
 * Publishes Remote Config from the repo to BOTH namespaces of one project.
 *
 * WHY THIS SCRIPT EXISTS
 * ----------------------
 * Firebase keeps two separate Remote Config templates and gives you no hint
 * that the second one exists:
 *
 *   firebase         (client)  read by the app's JS SDK  → minimum_supported_version
 *   firebase-server  (server)  read by getServerTemplate() in Cloud Functions
 *                              → paywall_enabled, free_active_groups,
 *                                free_scans_per_month
 *
 * The Firebase console shows the CLIENT template by default. The
 * `firebase remoteconfig:*` CLI commands and the Admin SDK's publishTemplate()
 * also write the CLIENT template. So the obvious way to "turn on the paywall"
 * writes a template no server code ever reads, the functions log one
 * NOT_FOUND warning per instance, fall back to defaults (paywall_enabled =
 * false), and every cap computes "would block" and then permits the action.
 *
 * That failure is safe but silent, and it was measured on beta on 2026-09-07 —
 * the identical unarchive request flipped from 200 to 429 purely by publishing
 * the same values to the server namespace.
 *
 * One file, both namespaces, no drift.
 *
 * USAGE
 *   npm run rc:publish -- beta        # publishes both namespaces
 *   npm run rc:publish -- prod
 *   npm run rc:publish -- beta --dry-run
 *
 * AUTH
 *   Uses `gcloud auth print-access-token`. If that fails, run
 *   `gcloud auth login`. The Firebase CLI's own credentials cannot be used
 *   here because it exposes no namespace option.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Environment → project id. Mirrors .firebaserc; kept explicit so a typo cannot silently hit prod. */
const PROJECTS = {
  beta: 'divit-beta',
  prod: 'divit-6d217',
};

const NAMESPACES = ['firebase', 'firebase-server'];

/**
 * The effective value of a parameter, considering conditional values too.
 *
 * Reading only `defaultValue` made the prod safety guard below bypassable: move
 * `paywall_enabled` into `conditionalValues` and the guard sees `undefined`,
 * prints "(dark)", and lets the publish through. The guard is the entire reason
 * this script exists, so it must not have a blind spot.
 */
function readParamValue(tpl, key) {
  const p = tpl.parameters?.[key];
  if (!p) return undefined;
  const conditional = Object.values(p.conditionalValues ?? {}).map((v) => v?.value);
  // If ANY conditional turns it on, treat the parameter as on.
  if (conditional.includes('true')) return 'true';
  return p.defaultValue?.value;
}

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const env = args.find((a) => !a.startsWith('--'));

if (!env || !PROJECTS[env]) {
  die(`Usage: npm run rc:publish -- <${Object.keys(PROJECTS).join('|')}> [--dry-run]`);
}

const projectId = PROJECTS[env];
const configPath = path.join(ROOT, 'config', 'remote-config', `${env}.json`);

let template;
try {
  template = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (e) {
  die(`Could not read ${configPath}: ${e.message}`);
}

// `_comment` is documentation for humans; the API rejects unknown top-level keys.
delete template._comment;

// NOTE: the token is fetched AFTER the dry-run branch below. `--dry-run` is
// documented as "show what would happen" and must work for someone who is not
// logged into gcloud.
const paywall = readParamValue(template, 'paywall_enabled');
console.log(`\nRemote Config → ${env}  (${projectId})`);
console.log(`  source:           ${path.relative(ROOT, configPath)}`);
console.log(
  `  paywall_enabled:  ${paywall}${paywall === 'true' ? '  ⚠️  ENFORCEMENT ON' : '  (dark)'}`,
);
console.log(`  namespaces:       ${NAMESPACES.join(', ')}`);

// PROD ENFORCEMENT IS A REAL EVENT: it starts refusing actions for real users,
// so it must never happen as a side effect of a routine publish.
if (env === 'prod' && paywall === 'true' && !process.env.I_MEAN_IT) {
  die(
    'Refusing to switch the paywall ON in prod without confirmation.\n' +
      '  This begins blocking real users at the cap.\n' +
      '  Re-run with: I_MEAN_IT=1 npm run rc:publish -- prod',
  );
}

if (dryRun) {
  console.log('\n(dry run — nothing published)\n');
  process.exit(0);
}

let token;
try {
  token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
} catch {
  die('No gcloud access token. Run: gcloud auth login');
}
if (!token) die('Empty gcloud access token. Run: gcloud auth login');

const results = [];
for (const ns of NAMESPACES) {
  const url = `https://firebaseremoteconfig.googleapis.com/v1/projects/${projectId}/namespaces/${ns}/remoteConfig`;
  let res;
  try {
    res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; UTF-8',
        // Required when authenticating with user credentials rather than a
        // service account, or the API returns 403 "requires a quota project".
        'x-goog-user-project': projectId,
        // Fresh publish; we are the source of truth, so no ETag round-trip.
        'If-Match': '*',
      },
      body: JSON.stringify(template),
    });
  } catch (e) {
    // An UNWRAPPED throw here was a real hole: a DNS/connection failure on the
    // SECOND namespace escaped as an unhandled rejection, so the first namespace
    // was already published, the second was not, and the "templates may now
    // DISAGREE" warning below never printed. Silent drift is exactly what this
    // script exists to prevent.
    console.error(`  ✖ ${ns}: request failed — ${e instanceof Error ? e.message : String(e)}`);
    results.push(false);
    continue;
  }

  const body = await res.text();
  if (!res.ok) {
    console.error(`  ✖ ${ns}: HTTP ${res.status}\n${body.slice(0, 400)}`);
    results.push(false);
  } else {
    const v = (() => {
      try {
        return JSON.parse(body).version?.versionNumber ?? '?';
      } catch {
        return '?';
      }
    })();
    console.log(`  ✔ ${ns}: published (version ${v})`);
    results.push(true);
  }
}

if (results.some((ok) => !ok)) {
  die('At least one namespace failed. The two templates may now DISAGREE — re-run.');
}

console.log('\n✔ Both namespaces published and in sync.\n');
