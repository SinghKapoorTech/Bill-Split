/**
 * iPad screenshot set — 13" iPad, 2064 × 2752 portrait (Apple's required size
 * for the iPad tier; mandatory because the app is universal,
 * TARGETED_DEVICE_FAMILY = "1,2").
 *
 * Same visual language and copy as the iPhone set (frames.config.mjs), retuned
 * for a 3:4 canvas rather than 9:19.5.
 *
 * SIX frames, not nine. At 1032pt wide the app renders its DESKTOP layout, and
 * three of the iPhone frames don't survive the translation:
 *   - Settle Up and Create are centred modals that read as a tiny dialog
 *     stranded on a large canvas
 *   - Squads fills roughly a fifth of the screen
 * Apple requires only one screenshot for the tier, so padding the set with weak
 * frames buys nothing. The six kept here all fill the canvas.
 */

/** 13" iPad portrait — the size the iPad Pro 13" (M4) simulator captures natively. */
export const CANVAS = { width: 2064, height: 2752 };

export const COLORS = {
  canvas: '#111111',
  glow: 'rgba(255, 255, 255, 0.10)',
  headline: '#FFFFFF',
  subhead: 'rgba(255, 255, 255, 0.92)',
  deviceBody: '#17120F',
  deviceEdge: 'rgba(0, 0, 0, 0.45)',
};

/**
 * Retuned for the wider, shorter canvas. Usable text width is
 * 2064 - 2*160 = 1744px, so the same copy sits more comfortably than on iPhone.
 * The copy block ends at 635px (measured), so the device starts at 760px.
 * screenWidth 1420 at 3:4 gives a 1893px screen; with a 22px bezel the device
 * ends at 2697px, inside the 2752px canvas.
 */
export const TYPE = {
  marginX: 160,
  headlineTop: 190,
  headlineSize: 116,
  headlineLeading: 1.08,
  subheadSize: 56,
  subheadLeading: 1.36,
  subheadGap: 42,
  screenWidth: 1420,
  screenTop: 760,
  bezel: 22,
  cornerRadius: 90,
};

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
    screen: '04-balances.png',
    accent: '#334155',
    headlineColor: '#458EF7',
    tri: ['#0F766E', '#C2410C', '#6D28D9'],
    headline: 'Know who owes who',
    subhead: 'Every balance in one place,\nalways current.',
  },
  {
    id: '04',
    screen: '05-event.png',
    accent: '#15803D',
    headlineColor: '#45F788',
    tri: ['#0F766E', '#B45309', '#1D4ED8'],
    headline: 'Built for trips\nand groups',
    subhead: 'Bundle every receipt into one event,\nsettle with fewer payments.',
  },
  {
    id: '05',
    screen: '06-scan.png',
    accent: '#B91C1C',
    headlineColor: '#FB9D9D',
    tri: ['#C2410C', '#B45309', '#A21CAF'],
    headline: 'Full control after\nthe scan',
    subhead: 'Edit items, tax and tip before you\nsplit anything.',
  },
  {
    id: '06',
    screen: '07-bills.png',
    accent: '#1D4ED8',
    headlineColor: '#98B2FB',
    tri: ['#6D28D9', '#0F766E', '#334155'],
    headline: 'Every bill in one\nplace',
    subhead: "See what's settled and what's still\nopen, at a glance.",
  },
];
