/**
 * assert-native-build.mjs — guards the Capacitor asset-path contract.
 *
 * Native builds load index.html from the webview root, so every asset
 * reference must be RELATIVE ("./assets/...").  vite.config.ts only emits
 * relative paths when CAPACITOR_BUILD=1 is set; without it Vite emits
 * root-absolute paths ("/assets/...") which resolve to nothing inside the
 * webview and the app opens to a blank white screen.
 *
 * That regression has shipped before (see commit e61a3de) and is invisible
 * until someone installs the build, so CI asserts it here instead.
 *
 * Run after `vite build`, before `cap sync`:
 *   node scripts/assert-native-build.mjs
 */

import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = path.join(ROOT, 'dist', 'index.html');

if (!existsSync(INDEX)) {
  console.error(`ERROR: ${path.relative(ROOT, INDEX)} not found — did the build run?`);
  process.exit(1);
}

const html = readFileSync(INDEX, 'utf8');

// Root-absolute src=/href= references. Protocol-absolute URLs ("https://…")
// and relative ones ("./…") are both fine; only a leading bare "/" breaks.
const absolute = [...html.matchAll(/(?:src|href)="(\/[^"]*)"/g)].map((m) => m[1]);
const relative = [...html.matchAll(/(?:src|href)="(\.\/[^"]*)"/g)].map((m) => m[1]);

if (absolute.length > 0) {
  console.error('ERROR: native build has root-absolute asset paths.');
  console.error('The app would install and then open to a blank white screen.\n');
  for (const ref of absolute) console.error(`  ${ref}`);
  console.error('\nCause: the web build ran without CAPACITOR_BUILD=1.');
  console.error('Fix:   CAPACITOR_BUILD=1 npm run build   (see vite.config.ts)');
  process.exit(1);
}

if (relative.length === 0) {
  console.error('ERROR: no asset references found in dist/index.html.');
  console.error('The build produced an unexpected shape — check it before shipping.');
  process.exit(1);
}

console.log(`OK: ${relative.length} relative asset references, 0 absolute.`);
