import { describe, it, expect } from 'vitest';
// @ts-expect-error - plain ESM config module, no type declarations
import * as iphone from '../appstore/frames.config.mjs';
// @ts-expect-error - plain ESM config module, no type declarations
import * as ipad from '../appstore/ipad.config.mjs';

/**
 * Both device tiers ship: the app is universal (TARGETED_DEVICE_FAMILY = "1,2"),
 * so Apple requires an iPad set as well as iPhone. These invariants stop copy
 * that overflows the canvas, and colour pairs that are unreadable, from reaching
 * the store.
 */
const TIERS = [
  // 1320x2868 is the iPhone 17 Pro Max native size and an accepted 6.9" upload size.
  { name: 'iphone', mod: iphone, canvas: { width: 1320, height: 2868 } },
  // 2064x2752 is Apple's 13" iPad portrait size, captured natively by the M4 sim.
  { name: 'ipad', mod: ipad, canvas: { width: 2064, height: 2752 } },
];

const HEX = /^#[0-9A-Fa-f]{6}$/;

describe.each(TIERS)('App Store frame config: $name', ({ mod, canvas }) => {
  const { CANVAS, TYPE, COLORS, FRAMES } = mod;

  it('targets the required Apple portrait size for its tier', () => {
    expect(CANVAS).toEqual(canvas);
  });

  it("uses sequential ids within Apple's cap of 10", () => {
    const ids = FRAMES.map((f: { id: string }) => f.id);
    expect(ids).toEqual(ids.map((_: string, i: number) => String(i + 1).padStart(2, '0')));
    expect(FRAMES.length).toBeGreaterThan(0);
    expect(FRAMES.length).toBeLessThanOrEqual(10);
  });

  it('gives every frame a headline, subhead and screen', () => {
    for (const f of FRAMES) {
      expect(f.headline, `frame ${f.id} headline`).toBeTruthy();
      expect(f.subhead, `frame ${f.id} subhead`).toBeTruthy();
      expect(f.screen, `frame ${f.id} screen`).toMatch(/^\d{2}-[a-z-]+\.png$/);
    }
  });

  it('uses unique screen files', () => {
    const screens = FRAMES.map((f: { screen: string }) => f.screen);
    expect(new Set(screens).size).toBe(screens.length);
  });

  // Overflow guardrails. Derived empirically by measuring rendered text in
  // Chromium with the real Outfit face, against the template's usable width:
  //   usable = CANVAS.width - 2 * TYPE.marginX = 1320 - 208 = 1112px
  //
  // Headline (Outfit 700, 92px, -0.02em): measured 25 chars of ordinary
  // sentence-case copy at 1169px — i.e. 26 was too loose and would pass text
  // that clips. 21 is the safe ceiling for typical mixed-case copy.
  // Subhead (Outfit 400, 44px): measured 48 chars at 996px, comfortably under
  // 1112px, so 46 is sound.
  //
  // These are a cheap pre-flight check only. The AUTHORITATIVE check is the
  // real geometry assertion in appstore/render.mjs, which measures actual
  // rendered width in the browser. Re-derive both numbers if TYPE changes.
  // The iPad tier has 1744px of usable width, so the same bounds are simply
  // conservative there rather than wrong.
  it('keeps headlines within 2 lines of 21 characters', () => {
    for (const f of FRAMES) {
      const lines = f.headline.split('\n');
      expect(lines.length, `frame ${f.id} headline lines`).toBeLessThanOrEqual(2);
      for (const line of lines) {
        expect(line.length, `frame ${f.id} headline line "${line}"`).toBeLessThanOrEqual(21);
      }
    }
  });

  it('keeps subheads within 2 lines of 46 characters', () => {
    for (const f of FRAMES) {
      const lines = f.subhead.split('\n');
      expect(lines.length, `frame ${f.id} subhead lines`).toBeLessThanOrEqual(2);
      for (const line of lines) {
        expect(line.length, `frame ${f.id} subhead line "${line}"`).toBeLessThanOrEqual(46);
      }
    }
  });

  it('declares a type scale the template can consume', () => {
    expect(TYPE.headlineSize).toBeGreaterThan(0);
    expect(TYPE.subheadSize).toBeGreaterThan(0);
    expect(TYPE.screenWidth).toBeLessThan(CANVAS.width);
  });

  it('declares the colour tokens the template reads', () => {
    for (const key of ['canvas', 'glow', 'headline', 'subhead', 'deviceBody', 'deviceEdge']) {
      expect(COLORS[key], `COLORS.${key}`).toBeTruthy();
    }
  });

  it('colours every frame', () => {
    for (const f of FRAMES) {
      // A missing accent would silently fall back to the near-black canvas,
      // producing one off-brand dark frame in an otherwise vivid set.
      expect(f.accent, `frame ${f.id} accent`).toMatch(HEX);
      expect(f.tri, `frame ${f.id} tri`).toHaveLength(3);
      for (const c of f.tri) expect(c, `frame ${f.id} tri colour`).toMatch(HEX);
    }
  });
});

describe.each(TIERS)('App Store colour pairing: $name', ({ mod }) => {
  it('gives every frame a distinct accent so the set reads as varied', () => {
    const accents = mod.FRAMES.map((f: { accent: string }) => f.accent);
    expect(new Set(accents).size).toBe(accents.length);
  });

  it('keeps every headline readable on its background (WCAG)', () => {
    // The headline is coloured rather than white, so contrast is not guaranteed
    // by construction and has to be asserted. Without this,
    // a plausible-looking hue pair ships as an unreadable frame.
    //
    // Threshold is 3:1, the WCAG bar for LARGE text — at 92px bold the headline
    // is far above the 18.66px-bold / 24px cutoff. Using the 4.5:1 normal-text
    // bar instead forced the tints to ~96% lightness, i.e. effectively white,
    // which defeats a coloured headline. 3:1 is the correct standard here; the
    // shipped pairs all measure 3.2:1 or better.
    const srgbToLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
    };
    const ratio = (a: string, b: string) => {
      const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (l1 + 0.05) / (l2 + 0.05);
    };

    for (const f of mod.FRAMES) {
      const r = ratio(f.headlineColor, f.accent);
      expect(
        r,
        `frame ${f.id}: headline ${f.headlineColor} on ${f.accent} is ${r.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every frame a headline colour', () => {
    for (const f of mod.FRAMES) {
      expect(f.headlineColor, `frame ${f.id} headlineColor`).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
