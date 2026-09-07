#!/usr/bin/env node
/**
 * Launch a Chromium-family browser with the CDP debug port open, cross-platform.
 *
 * Exists because the launch step is the ONLY part of this skill that differs by OS:
 * once `http://127.0.0.1:9222/json/version` answers, browser-drive.mjs behaves
 * identically everywhere. Hardcoding a macOS .app path made the skill useless on
 * Windows, so the paths live here as data instead of in prose.
 *
 * Usage:
 *   node scripts/browser-launch.mjs                # find a browser, launch, wait for CDP
 *   node scripts/browser-launch.mjs --dry-run      # print what it would do, launch nothing
 *   node scripts/browser-launch.mjs --browser chrome
 *   BROWSER_PATH="/path/to/binary" node scripts/browser-launch.mjs
 *
 * Env: CDP_PORT (default 9222), BROWSER_PATH, BROWSER_PROFILE_DIR.
 *
 * CDP is startup-only: you cannot attach to an already-running browser. If the port
 * is already answering, this exits successfully and changes nothing.
 */
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';

const PORT = process.env.CDP_PORT || '9222';
const ENDPOINT = `http://127.0.0.1:${PORT}`;
const PROFILE =
  process.env.BROWSER_PROFILE_DIR || join(homedir(), '.claude-browser-profile');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
// Guard the -1 case: `args[args.indexOf(x) + 1]` silently reads args[0] when the flag
// is absent, which made a bare `--dry-run` parse as `--browser --dry-run`.
const browserIdx = args.indexOf('--browser');
const wantedRaw = browserIdx === -1 ? undefined : args[browserIdx + 1];
if (browserIdx !== -1 && (!wantedRaw || wantedRaw.startsWith('--'))) {
  console.error('browser-launch: --browser needs a value (e.g. --browser chrome)');
  process.exit(1);
}
const wanted = wantedRaw;

/**
 * Candidates in preference order. Opera first because that is what the author uses;
 * Chrome and Edge follow because their install paths are the most stable.
 *
 * Windows paths are the standard install locations — note Opera installs per-user
 * under LOCALAPPDATA by default, NOT into Program Files, which is the usual reason
 * a hand-written Windows command fails.
 */
const CANDIDATES = {
  darwin: [
    ['opera', '/Applications/Opera.app/Contents/MacOS/Opera'],
    ['chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    ['edge', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
    ['brave', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'],
    ['chromium', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  ],
  win32: [
    ['opera', join(process.env.LOCALAPPDATA || '', 'Programs', 'Opera', 'opera.exe')],
    ['opera', join(process.env.PROGRAMFILES || '', 'Opera', 'opera.exe')],
    ['chrome', join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['chrome', join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['chrome', join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')],
    ['edge', join(process.env['PROGRAMFILES(X86)'] || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    ['edge', join(process.env.PROGRAMFILES || '', 'Microsoft', 'Edge', 'Application', 'msedge.exe')],
    ['brave', join(process.env.PROGRAMFILES || '', 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')],
  ],
  linux: [
    ['opera', '/usr/bin/opera'],
    ['chrome', '/usr/bin/google-chrome'],
    ['chrome', '/opt/google/chrome/chrome'],
    ['chromium', '/usr/bin/chromium'],
    ['chromium', '/usr/bin/chromium-browser'],
    ['edge', '/usr/bin/microsoft-edge'],
    ['brave', '/usr/bin/brave-browser'],
  ],
};

async function cdpUp() {
  try {
    const res = await fetch(`${ENDPOINT}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function findBrowser() {
  if (process.env.BROWSER_PATH) {
    if (!existsSync(process.env.BROWSER_PATH))
      fail(`BROWSER_PATH does not exist: ${process.env.BROWSER_PATH}`);
    return ['custom', process.env.BROWSER_PATH];
  }
  const list = CANDIDATES[platform()];
  if (!list) fail(`unsupported platform: ${platform()}`);
  const pool = wanted ? list.filter(([name]) => name === wanted) : list;
  if (wanted && pool.length === 0)
    fail(`no known path for --browser ${wanted} on ${platform()}`);
  const hit = pool.find(([, p]) => p && existsSync(p));
  if (!hit) {
    fail(
      `no supported browser found on ${platform()}. Looked in:\n` +
        pool.map(([n, p]) => `  ${n}: ${p}`).join('\n') +
        `\n\nInstall one, or set BROWSER_PATH to the binary. ` +
        `If you find a working path this list is missing, add it to CANDIDATES.`
    );
  }
  return hit;
}

function fail(msg) {
  console.error(`browser-launch: ${msg}`);
  process.exit(1);
}

const running = await cdpUp();
if (running) {
  console.log(`CDP already up on ${ENDPOINT} — ${running.Browser}`);
  console.log('Nothing to do. (CDP is startup-only; this did not restart anything.)');
  process.exit(0);
}

const [name, bin] = findBrowser();
// A dedicated profile dir is REQUIRED, not a nicety: Chromium 136+ ignores the debug
// port when pointed at the default profile, and Opera/Brave/Vivaldi inherit that.
// It also limits blast radius — only the logins being automated live in here.
const flags = [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  '--no-first-run',
  '--no-default-browser-check',
];

if (dryRun) {
  console.log(`platform : ${platform()}`);
  console.log(`browser  : ${name}`);
  console.log(`binary   : ${bin}`);
  console.log(`profile  : ${PROFILE}`);
  console.log(`endpoint : ${ENDPOINT}`);
  console.log(`\nwould run:\n  "${bin}" ${flags.join(' ')}`);
  process.exit(0);
}

console.log(`Launching ${name} (${bin})`);
const child = spawn(bin, flags, { detached: true, stdio: 'ignore' });
child.unref();

for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  const v = await cdpUp();
  if (v) {
    console.log(`\nCDP up on ${ENDPOINT} — ${v.Browser}`);
    console.log(`Profile: ${PROFILE}`);
    console.log('\nLog in by hand now, then tell Claude you are past the login screen.');
    console.log('Do NOT let anything snapshot the page while credentials are on screen.');
    process.exit(0);
  }
}

fail(
  `browser launched but ${ENDPOINT} never answered after 30s.\n` +
    `Most likely the profile dir is in use by an already-running instance of this ` +
    `browser — quit it fully and retry, or set BROWSER_PROFILE_DIR to a fresh path.`
);
