import { describe, it, expect } from 'vitest';
import { buildProConfetti, PRO_CONFETTI_COLORS } from '@/utils/proConfetti';

/** Deterministic PRNG so layouts are reproducible. */
function seeded(seed: number) {
  let t = seed;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}

describe('buildProConfetti', () => {
  it('produces NO pieces for Reduce Motion users', () => {
    expect(buildProConfetti({ reducedMotion: true }, seeded(1))).toEqual([]);
  });

  it('produces the requested burst and rain counts otherwise', () => {
    const pieces = buildProConfetti({ reducedMotion: false, burst: 10, rain: 15 }, seeded(2));
    expect(pieces.filter((p) => p.kind === 'burst')).toHaveLength(10);
    expect(pieces.filter((p) => p.kind === 'rain')).toHaveLength(15);
    expect(new Set(pieces.map((p) => p.id)).size).toBe(25);
  });

  it('keeps a modest default count for low-end phones', () => {
    expect(buildProConfetti({ reducedMotion: false }, seeded(3)).length).toBeLessThanOrEqual(80);
  });

  it('uses only the Divit gold palette, even at the random extremes', () => {
    for (const r of [() => 0, () => 0.999999, seeded(4)]) {
      for (const p of buildProConfetti({ reducedMotion: false }, r)) {
        expect(PRO_CONFETTI_COLORS).toContain(p.color);
      }
    }
  });

  it('starts rain across the full width and fans the burst all the way round', () => {
    const pieces = buildProConfetti({ reducedMotion: false }, seeded(5));
    const rain = pieces.filter((p) => p.kind === 'rain');
    expect(rain.every((p) => p.x >= 0 && p.x <= 100)).toBe(true);
    const burst = pieces.filter((p) => p.kind === 'burst');
    // Pieces in all four quadrants — a bug collapsing the angle would fail this.
    expect(burst.some((p) => p.x > 0 && p.y > 0)).toBe(true);
    expect(burst.some((p) => p.x < 0 && p.y > 0)).toBe(true);
    expect(burst.some((p) => p.x < 0 && p.y < 0)).toBe(true);
    expect(burst.some((p) => p.x > 0 && p.y < 0)).toBe(true);
  });
});
