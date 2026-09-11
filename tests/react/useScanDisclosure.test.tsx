/**
 * `useScanDisclosure` — the composition Phase 3 should consume.
 *
 * It exists because the OBVIOUS composition is wrong. `scanDisclosure()` needs
 * a `loading` covering entitlement as well as quota, but the only `loading`
 * sitting next to `remaining` is `useScanQuota`'s, which knows nothing about
 * `entitlements/{uid}`. Two listeners on two documents settle in arbitrary
 * order, and the state that makes it bite is ordinary for a NEW SUBSCRIBER:
 * buying Pro does not reset `scansThisPeriod`, so `usage/{uid}` still reads
 * 2-of-2 while the entitlement snapshot is in flight.
 *
 * These tests are about ORDER, which is exactly what a pure test of
 * `scanDisclosure` cannot express.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  entitlement: { unlimited: false, loading: false },
  quota: { remaining: 2, limit: 2, resetsAtMs: Date.UTC(2026, 9, 1), loading: false },
  config: { paywallEnabled: true, loading: false },
}));

vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => h.entitlement }));
vi.mock('@/hooks/useScanQuota', () => ({ useScanQuota: () => h.quota }));
vi.mock('@/hooks/useMonetizationConfig', () => ({ useMonetizationConfig: () => h.config }));

import { useScanDisclosure } from '@/hooks/useScanDisclosure';

function Probe() {
  const { level, text, loading } = useScanDisclosure();
  return (
    <div>
      <span data-testid="level">{level}</span>
      <span data-testid="text">{text}</span>
      <span data-testid="loading">{String(loading)}</span>
    </div>
  );
}

const read = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  h.entitlement = { unlimited: false, loading: false };
  h.quota = { remaining: 2, limit: 2, resetsAtMs: Date.UTC(2026, 9, 1), loading: false };
  h.config = { paywallEnabled: true, loading: false };
});

describe('useScanDisclosure — the wall must never reach a subscriber', () => {
  it('stays hidden while the ENTITLEMENT is still resolving, even at zero remaining', () => {
    // THE motivating case. Quota settles first and says 0 of 2 used; entitlement
    // has not arrived, so `unlimited` is still the default false. Composed with
    // the nearest `loading` (the quota's, already false) this renders a wall in
    // front of someone who just paid — for a network round trip, not a frame.
    h.quota = { ...h.quota, remaining: 0, loading: false };
    h.entitlement = { unlimited: false, loading: true };

    render(<Probe />);

    expect(read('level')).toBe('hidden');
    expect(read('text')).toBe('');
    expect(read('loading')).toBe('true');
  });

  it('stays hidden while the QUOTA is still resolving', () => {
    h.quota = { ...h.quota, remaining: 0, loading: true };
    render(<Probe />);
    expect(read('level')).toBe('hidden');
  });

  it('stays hidden while the CONFIG is still resolving', () => {
    h.quota = { ...h.quota, remaining: 0 };
    h.config = { paywallEnabled: true, loading: true };
    render(<Probe />);
    expect(read('level')).toBe('hidden');
  });

  it('shows nothing to a subscriber once everything has settled', () => {
    h.quota = { ...h.quota, remaining: 0 };
    h.entitlement = { unlimited: true, loading: false };
    render(<Probe />);
    expect(read('level')).toBe('hidden');
    expect(read('loading')).toBe('false');
  });
});

describe('useScanDisclosure — a settled free user still gets the truth', () => {
  it('walls a free user at zero once all three have settled', () => {
    h.quota = { ...h.quota, remaining: 0 };
    render(<Probe />);
    expect(read('level')).toBe('wall');
    expect(read('text')).toBe("You've used your 2 free scans this month · resets Oct 1");
    expect(read('loading')).toBe('false');
  });

  it('warns on the last scan', () => {
    h.quota = { ...h.quota, remaining: 1 };
    render(<Probe />);
    expect(read('level')).toBe('last');
  });

  it('is ambient with a full allowance', () => {
    render(<Probe />);
    expect(read('level')).toBe('ambient');
  });

  it('is hidden while enforcement is dark', () => {
    h.quota = { ...h.quota, remaining: 0 };
    h.config = { paywallEnabled: false, loading: false };
    render(<Probe />);
    expect(read('level')).toBe('hidden');
  });
});
