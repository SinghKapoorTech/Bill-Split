/**
 * App Store screenshot set — one vivid hue per frame, with a light tint of that
 * same hue as the headline, over a low-poly faceted background.
 *
 * Backgrounds are vivid mid-tones; the headline is a LIGHT TINT of the same hue,
 * so the type reads as coloured rather than white while the background stays
 * bright. Each tint was computed as the most saturated/darkest tint that still
 * clears the contrast bar, so it is as colourful as legibility allows.
 *
 * Contrast bar: at 92px bold the headline is unambiguously "large text" under
 * WCAG, whose threshold is 3:1 (not the 4.5:1 normal-text bar). Every pair here
 * measures 3.2:1 or better, and the pairing is enforced by an assertion in
 * tests/appstoreFrames.test.ts so an unreadable pair fails the suite.
 *
 * All nine frames share one visual language on purpose: a listing whose frames
 * don't match reads as incoherent.
 */

/** iPhone 17 Pro Max native size; an accepted Apple 6.9" portrait upload size. */
export const CANVAS = { width: 1320, height: 2868 };

/**
 * Global tokens. `headline` here is only a fallback — each frame supplies its own
 * `headlineColor`. The subhead stays a neutral near-white so it reads on every
 * hue without needing nine more colour decisions.
 */
export const COLORS = {
  canvas: '#111111', // only visible if a frame ever omits its accent
  glow: 'rgba(255, 255, 255, 0.10)', // subtle lift behind the device
  headline: '#FFFFFF',
  subhead: 'rgba(255, 255, 255, 0.92)',
  deviceBody: '#17120F',
  deviceEdge: 'rgba(0, 0, 0, 0.45)', // dark hairline defines the phone against a bright background
};

export const TYPE = {
  marginX: 104,
  headlineTop: 176,
  headlineSize: 92,
  headlineLeading: 1.08,
  subheadSize: 44,
  subheadLeading: 1.36,
  subheadGap: 36,
  screenWidth: 980,
  screenTop: 700,
  bezel: 18,
  cornerRadius: 76,
};

/**
 * 9 frames. Order is the narrative: the three-verb spine (scan -> split ->
 * settle) first because frames 1-3 carry most of the conversion, then breadth.
 *
 * `accent`        = frame background (vivid mid-tone of the hue)
 * `headlineColor` = headline type (light tint of the SAME hue)
 * `tri`           = bottom triangle band, mid-tones borrowed from neighbouring
 *                   frames so the set reads as one family
 */
export const FRAMES = [
  {
    id: '01',
    screen: '01-assign.png',
    accent: '#C2410C',
    headlineColor: '#FBBFA7',
    tri: ['#0F766E', '#6D28D9', '#B45309'],
    headline: 'Split by what\nyou ordered',
    subhead: 'AI reads the receipt and itemizes it.\nNo math, no awkwardness.',
  },
  {
    id: '02',
    screen: '02-review.png',
    accent: '#0F766E',
    headlineColor: '#45F7E9',
    tri: ['#C2410C', '#15803D', '#1D4ED8'],
    headline: 'Fair tax & tip,\nautomatically',
    subhead: 'Everyone pays for what they had —\nproportionally, to the cent.',
  },
  {
    id: '03',
    screen: '03-settle.png',
    accent: '#6D28D9',
    headlineColor: '#C29DFB',
    tri: ['#A21CAF', '#1D4ED8', '#0F766E'],
    headline: 'Settle up on Venmo\nin one tap',
    subhead: 'The request goes out with an\nitemized note attached.',
  },
  {
    id: '04',
    screen: '04-balances.png',
    accent: '#334155',
    headlineColor: '#458EF7',
    tri: ['#0F766E', '#C2410C', '#6D28D9'],
    headline: 'Know who owes who',
    subhead: 'Every balance in one place,\nalways current.',
  },
  {
    id: '05',
    screen: '05-event.png',
    accent: '#15803D',
    headlineColor: '#45F788',
    tri: ['#0F766E', '#B45309', '#1D4ED8'],
    headline: 'Built for trips\nand groups',
    subhead: 'Bundle every receipt into one event,\nsettle with fewer payments.',
  },
  {
    id: '06',
    screen: '06-scan.png',
    accent: '#B91C1C',
    headlineColor: '#FB9D9D',
    tri: ['#C2410C', '#B45309', '#A21CAF'],
    // Deliberately NOT "Scan any receipt": the captured screen is the Bill Entry
    // step showing the extracted items, and its own body copy reads "Add items
    // manually or switch to AI Scan tab", which would contradict a scan-focused
    // headline. This angle matches what is actually on screen (Add Item, per-item
    // edit/delete, editable tax and tip) and sells control over the AI's output.
    headline: 'Full control after\nthe scan',
    subhead: 'Edit items, tax and tip before you\nsplit anything.',
  },
  {
    id: '07',
    screen: '07-bills.png',
    accent: '#1D4ED8',
    headlineColor: '#98B2FB',
    tri: ['#6D28D9', '#0F766E', '#334155'],
    headline: 'Every bill in one\nplace',
    subhead: "See what's settled and what's still\nopen, at a glance.",
  },
  {
    id: '08',
    screen: '08-create.png',
    accent: '#A21CAF',
    headlineColor: '#F298FB',
    tri: ['#6D28D9', '#C2410C', '#1D4ED8'],
    headline: 'Split more than\ndinner',
    subhead: 'Receipts, quick expenses, stays\nand recurring bills.',
  },
  {
    id: '09',
    screen: '09-squads.png',
    accent: '#B45309',
    headlineColor: '#FBC69D',
    tri: ['#C2410C', '#15803D', '#6D28D9'],
    headline: 'Save your crew\nonce',
    subhead: 'Reuse the same group instead of\nretyping names.',
  },
];
