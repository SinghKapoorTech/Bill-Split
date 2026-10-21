/**
 * Confetti layout for the "Welcome to Divit Pro" celebration.
 *
 * Pure (randomness is injected) so the shape of the effect can be unit-tested
 * without a browser, and so a Reduce Motion user gets NO pieces at all rather
 * than a slower version of the same motion.
 */

/** Divit gold family plus cream/white highlights — matches --primary (42 65% 40%). */
export const PRO_CONFETTI_COLORS = [
  '#D4A73A',
  '#F2C94C',
  '#E8B04B',
  '#C9822B',
  '#FFF3C4',
  '#FFFFFF',
] as const;

export type ConfettiShape = 'square' | 'strip' | 'circle';

export interface ConfettiPiece {
  id: string;
  /** 'burst' fans out from the badge; 'rain' drifts down from the top edge. */
  kind: 'burst' | 'rain';
  color: string;
  shape: ConfettiShape;
  /** burst: travel in px from the badge centre. rain: start position in vw (0–100). */
  x: number;
  /** burst: travel in px from the badge centre. rain: unused (0). */
  y: number;
  /** Total spin in degrees over the flight. */
  rotate: number;
  /** Seconds before this piece starts. */
  delay: number;
  /** Seconds of flight. */
  duration: number;
  /** rain only: sideways sway in px. */
  sway: number;
}

const SHAPES: ConfettiShape[] = ['square', 'strip', 'circle'];

export function buildProConfetti(
  {
    reducedMotion,
    burst = 28,
    rain = 44,
  }: { reducedMotion: boolean; burst?: number; rain?: number },
  random: () => number = Math.random,
): ConfettiPiece[] {
  if (reducedMotion) return [];

  const pick = <T>(items: readonly T[]): T =>
    items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const pieces: ConfettiPiece[] = [];

  for (let i = 0; i < burst; i++) {
    // Evenly spread around the circle, jittered so it doesn't look like a clock face.
    const angle = (i / burst) * Math.PI * 2 + (random() - 0.5) * 0.4;
    const distance = 120 + random() * 110;
    pieces.push({
      id: `burst-${i}`,
      kind: 'burst',
      color: pick(PRO_CONFETTI_COLORS),
      shape: pick(SHAPES),
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      rotate: (random() - 0.5) * 720,
      delay: 0.15 + random() * 0.1,
      duration: 0.9 + random() * 0.4,
      sway: 0,
    });
  }

  for (let i = 0; i < rain; i++) {
    pieces.push({
      id: `rain-${i}`,
      kind: 'rain',
      color: pick(PRO_CONFETTI_COLORS),
      shape: pick(SHAPES),
      x: random() * 100,
      y: 0,
      rotate: (random() - 0.5) * 1080,
      delay: 0.35 + random() * 1.4,
      duration: 2.4 + random() * 1.6,
      sway: (random() - 0.5) * 80,
    });
  }

  return pieces;
}
