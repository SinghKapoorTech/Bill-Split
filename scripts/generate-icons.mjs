/**
 * Generates all app icon sizes from assets/divit-icon.svg and assets/divit-icon-fg.svg
 * using Playwright (already installed for e2e tests).
 *
 * Run: node scripts/generate-icons.mjs
 */

import { chromium } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FULL_SVG = path.join(ROOT, 'assets', 'divit-icon.svg');
const FG_SVG = path.join(ROOT, 'assets', 'divit-icon-fg.svg');

// All icon targets
const TARGETS = [
  // ── Android legacy square icons ──────────────────────────────────────────
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher.png',       size: 48 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher.png',       size: 72 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher.png',      size: 96 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png',     size: 144 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png',    size: 192 },

  // ── Android round icons ───────────────────────────────────────────────────
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png',    size: 48 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png',    size: 72 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png',   size: 96 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png',  size: 144 },
  { svg: FULL_SVG, out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png', size: 192 },

  // ── Android adaptive foreground (transparent bg, larger canvas for safe-zone) ──
  { svg: FG_SVG, transparent: true, out: 'android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png',    size: 108 },
  { svg: FG_SVG, transparent: true, out: 'android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png',    size: 162 },
  { svg: FG_SVG, transparent: true, out: 'android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png',   size: 216 },
  { svg: FG_SVG, transparent: true, out: 'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png',  size: 324 },
  { svg: FG_SVG, transparent: true, out: 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png', size: 432 },

  // ── iOS ──────────────────────────────────────────────────────────────────
  { svg: FULL_SVG, out: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', size: 1024 },

  // ── Web / PWA ─────────────────────────────────────────────────────────────
  { svg: FULL_SVG, out: 'public/divit-icon.png', size: 512 },
  { svg: FULL_SVG, out: 'public/favicon.png',    size: 32 },

  // ── Master source ─────────────────────────────────────────────────────────
  { svg: FULL_SVG, out: 'assets/divit-icon-master.png', size: 1024 },
];

async function renderIcon(page, svgPath, size, outputPath, transparent = false) {
  const svgRaw = await fs.readFile(svgPath, 'utf-8');

  // Swap the width/height attributes to the target size; keep viewBox intact
  const svgResized = svgRaw
    .replace(/width="[^"]*"/, `width="${size}"`)
    .replace(/height="[^"]*"/, `height="${size}"`);

  const bgStyle = transparent ? 'background: transparent;' : 'background: #0D0D0D;';
  const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; overflow: hidden; ${bgStyle} }
</style>
</head>
<body>${svgResized}</body>
</html>`;

  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html, { waitUntil: 'networkidle' });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await page.screenshot({
    path: outputPath,
    clip: { x: 0, y: 0, width: size, height: size },
    omitBackground: transparent,
  });

  const rel = path.relative(ROOT, outputPath).replace(/\\/g, '/');
  console.log(`  ✓  ${rel.padEnd(80)} ${size}×${size}`);
}

async function main() {
  console.log('\nDivit icon generation\n');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  let count = 0;
  for (const t of TARGETS) {
    const outPath = path.join(ROOT, t.out);
    await renderIcon(page, t.svg, t.size, outPath, t.transparent ?? false);
    count++;
  }

  await browser.close();
  console.log(`\nDone — ${count} files generated.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
