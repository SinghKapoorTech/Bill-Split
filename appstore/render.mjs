/**
 * Composites real simulator captures into the branded marketing frame and
 * exports upload-ready App Store PNGs.
 *
 * Run: node appstore/render.mjs                # iPhone -> appstore/out
 *      node appstore/render.mjs --set ipad     # iPad   -> appstore/out-ipad
 *      node appstore/render.mjs --placeholder  # synthetic screens, no captures needed
 *
 * This script is the AUTHORITATIVE correctness gate for the exported images.
 * The unit test in tests/appstoreFrames.test.ts only bounds character counts,
 * which is a proxy; here we measure real rendered geometry and real PNG bytes.

 */
import { chromium } from '@playwright/test';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Two device tiers. Both required: the app is universal
 * (TARGETED_DEVICE_FAMILY = "1,2"), so Apple requires an iPad set as well as
 * iPhone. They share template.html — it is driven entirely by CSS variables, so
 * the canvas and type scale come from the config.
 */
const SETS = {
  iphone: { config: 'frames.config.mjs', screens: 'screens', out: 'out' },
  ipad: { config: 'ipad.config.mjs', screens: 'screens-ipad', out: 'out-ipad' },
};
const setIdx = process.argv.indexOf('--set');
const SET_NAME = setIdx >= 0 ? process.argv[setIdx + 1] : 'iphone';
const SET = SETS[SET_NAME];
if (!SET) {
  console.error(`Unknown --set "${SET_NAME}". Known: ${Object.keys(SETS).join(', ')}`);
  process.exit(1);
}

const { CANVAS, COLORS, TYPE, FRAMES } = await import(`./${SET.config}`);

const TEMPLATE = path.join(__dirname, 'template.html');
const SCREENS = path.join(__dirname, SET.screens);
const OUT = path.join(__dirname, SET.out);
const PLACEHOLDER = process.argv.includes('--placeholder');
console.log(`set=${SET_NAME}  ${CANVAS.width}x${CANVAS.height}  frames=${FRAMES.length}  out=appstore/${SET.out}\n`);

/** Reads width, height and colour type out of a PNG's IHDR header. */
function pngInfo(buf) {
  return {
    sigOk: buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20),
    colorType: buf[25], // 2 = RGB (no alpha), 6 = RGBA
  };
}

const cssVars = {
  '--canvas-w': `${CANVAS.width}px`,
  '--canvas-h': `${CANVAS.height}px`,
  '--c-canvas': COLORS.canvas,
  '--c-glow': COLORS.glow,
  '--c-headline': COLORS.headline,
  '--c-subhead': COLORS.subhead,
  '--c-device-body': COLORS.deviceBody,
  '--c-device-edge': COLORS.deviceEdge,
  '--margin-x': `${TYPE.marginX}px`,
  '--headline-top': `${TYPE.headlineTop}px`,
  '--headline-size': `${TYPE.headlineSize}px`,
  '--headline-leading': `${TYPE.headlineLeading}`,
  '--subhead-size': `${TYPE.subheadSize}px`,
  '--subhead-leading': `${TYPE.subheadLeading}`,
  '--subhead-gap': `${TYPE.subheadGap}px`,
  '--screen-width': `${TYPE.screenWidth}px`,
  '--screen-top': `${TYPE.screenTop}px`,
  '--bezel': `${TYPE.bezel}px`,
  '--corner-radius': `${TYPE.cornerRadius}px`,
};

/** Per-frame variables layered on top of the shared ones. */
function varsFor(frame) {
  const v = { ...cssVars };
  if (frame.accent) v['--c-accent'] = frame.accent;
  // Per-frame headline colour.
  if (frame.headlineColor) v['--c-headline'] = frame.headlineColor;
  if (Array.isArray(frame.tri)) {
    frame.tri.slice(0, 3).forEach((c, i) => {
      v[`--c-tri${i + 1}`] = c;
    });
  }
  return v;
}

/** A flat dark placeholder at exact screen aspect, for proving the pipeline. */
async function placeholderDataUri(page, label) {
  return page.evaluate(
    ({ w, h, label }) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.fillStyle = '#1B1613';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = '#D1A73D';
      g.lineWidth = 8;
      g.strokeRect(4, 4, w - 8, h - 8);
      g.fillStyle = '#D1A73D';
      g.font = 'bold 120px sans-serif';
      g.textAlign = 'center';
      g.fillText(label, w / 2, h / 2);
      return c.toDataURL('image/png');
    },
    { w: CANVAS.width, h: CANVAS.height, label },
  );
}

async function screenDataUri(page, frame) {
  if (PLACEHOLDER) return placeholderDataUri(page, frame.id);
  const file = path.join(SCREENS, frame.screen);
  let buf;
  try {
    buf = await fs.readFile(file);
  } catch {
    throw new Error(
      `Missing capture: ${file}\nRun the simulator capture step, or pass --placeholder.`,
    );
  }
  const info = pngInfo(buf);
  if (info.width !== CANVAS.width || info.height !== CANVAS.height) {
    throw new Error(
      `${frame.screen} is ${info.width}x${info.height}, expected ${CANVAS.width}x${CANVAS.height}`,
    );
  }
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * Measures real rendered geometry. Character counts cannot prove text fits;
 * this can. Returns per-line widths via Range rects, which reveals BOTH
 * horizontal overflow and unintended wrapping (pre-line text wraps rather than
 * overflowing, so a too-long line silently becomes an extra line).
 */
async function measureGeometry(page) {
  return page.evaluate(() => {
    const lineWidths = (el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return [...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.width));
    };
    const headline = document.getElementById('headline');
    const subhead = document.getElementById('subhead');
    const copy = document.getElementById('copy');
    const device = document.getElementById('device');
    return {
      usableWidth: headline.clientWidth,
      headlineLines: lineWidths(headline),
      subheadLines: lineWidths(subhead),
      headlineText: headline.textContent,
      subheadText: subhead.textContent,
      copyBottom: Math.round(copy.getBoundingClientRect().bottom),
      deviceTop: Math.round(device.getBoundingClientRect().top),
      deviceBottom: Math.round(device.getBoundingClientRect().bottom),
      canvasHeight: document.documentElement.clientHeight,
      // Proves the real Outfit face loaded rather than a silent fallback,
      // which would change every measurement above.
      outfitLoaded:
        document.fonts.check('700 92px Outfit') && document.fonts.check('400 44px Outfit'),
    };
  });
}

function checkGeometry(frame, g) {
  const problems = [];
  if (!g.outfitLoaded) {
    problems.push('Outfit font did not load (measurements unreliable, text will look wrong)');
  }
  const expectHeadline = frame.headline.split('\n').length;
  const expectSubhead = frame.subhead.split('\n').length;
  if (g.headlineLines.length !== expectHeadline) {
    problems.push(
      `headline wrapped to ${g.headlineLines.length} lines, expected ${expectHeadline} (a line is too long)`,
    );
  }
  if (g.subheadLines.length !== expectSubhead) {
    problems.push(
      `subhead wrapped to ${g.subheadLines.length} lines, expected ${expectSubhead} (a line is too long)`,
    );
  }
  for (const w of g.headlineLines) {
    if (w > g.usableWidth) problems.push(`headline line ${w}px exceeds usable ${g.usableWidth}px`);
  }
  for (const w of g.subheadLines) {
    if (w > g.usableWidth) problems.push(`subhead line ${w}px exceeds usable ${g.usableWidth}px`);
  }
  if (g.copyBottom >= g.deviceTop) {
    problems.push(
      `copy block (bottom ${g.copyBottom}px) collides with device (top ${g.deviceTop}px)`,
    );
  }
  if (g.deviceBottom > g.canvasHeight) {
    problems.push(`device bottom ${g.deviceBottom}px exceeds canvas ${g.canvasHeight}px`);
  }
  return problems;
}

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: CANVAS.width, height: CANVAS.height },
  deviceScaleFactor: 1,
});

const failures = [];

for (const frame of FRAMES) {
  await page.goto(`file://${TEMPLATE}`);
  const uri = await screenDataUri(page, frame);

  await page.evaluate(
    async ({ frame, vars, uri }) => {
      for (const [k, v] of Object.entries(vars)) {
        document.documentElement.style.setProperty(k, v);
      }
      document.getElementById('headline').textContent = frame.headline;
      document.getElementById('subhead').textContent = frame.subhead;
      const img = document.getElementById('screen');
      img.src = uri;
      await img.decode();
    },
    { frame, vars: varsFor(frame), uri },
  );

  // Outfit is fetched from Google Fonts; without this the headline can render
  // in a fallback face non-deterministically, changing all measurements.
  await page.evaluate(() => document.fonts.ready);

  const geometry = await measureGeometry(page);
  const problems = checkGeometry(frame, geometry);

  const outFile = path.join(OUT, `${frame.id}.png`);
  await page.screenshot({ path: outFile });

  const info = pngInfo(await fs.readFile(outFile));
  if (!info.sigOk) problems.push('not a valid PNG');
  if (info.width !== CANVAS.width || info.height !== CANVAS.height) {
    problems.push(`${info.width}x${info.height} != ${CANVAS.width}x${CANVAS.height}`);
  }
  if (info.colorType !== 2) {
    problems.push(`colorType ${info.colorType} (Apple rejects alpha; expected 2 = RGB)`);
  }

  if (problems.length) failures.push({ id: frame.id, problems });
  console.log(
    `${problems.length ? 'FAIL' : 'ok  '}  ${frame.id}.png  ${info.width}x${info.height}  ` +
      `colorType=${info.colorType}  headline=[${geometry.headlineLines.join(', ')}]px ` +
      `subhead=[${geometry.subheadLines.join(', ')}]px  usable=${geometry.usableWidth}px`,
  );
}

await browser.close();

if (failures.length) {
  console.error('\nVerification FAILED:');
  for (const f of failures) {
    console.error(`  ${f.id}.png`);
    for (const p of f.problems) console.error(`    - ${p}`);
  }
  process.exit(1);
}
console.log(`\nAll ${FRAMES.length} frames verified in ${OUT}`);
