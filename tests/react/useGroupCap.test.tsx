/**
 * `useGroupCap` — the active owned-group count, against the Remote Config cap.
 *
 * THE TRAP THIS HOOK EXISTS TO AVOID is stated in `shared/eventArchive.ts`:
 * every event created before the archive feature shipped has NO `archived`
 * field, and `archived === false` does not match a document that is missing it.
 * Counting that way silently UNDER-counts and lets a user past the cap. Absence
 * means active; only a literal `true` archives.
 *
 * It also counts only events the user OWNS. Being a member of someone else's
 * group costs nothing — the cap is on groups you create.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const h = vi.hoisted(() => ({
  user: { uid: 'u1' } as { uid: string } | null | undefined,
  config: {
    paywallEnabled: true,
    freeScansPerMonth: 2,
    freeActiveGroups: 2,
    loading: false,
  },
  entitlement: { plan: 'free', unlimited: false, loading: false } as {
    plan: string;
    unlimited: boolean;
    loading: boolean;
  },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => h.entitlement }));
vi.mock('@/hooks/useMonetizationConfig', () => ({
  useMonetizationConfig: () => h.config,
}));

import { useGroupCap, type CappableEvent } from '@/hooks/useGroupCap';

function Probe({ events, loading }: { events: CappableEvent[]; loading?: boolean }) {
  const { activeCount, limit, atCap, text, unlimited, loading: l } = useGroupCap(events, loading);
  return (
    <div>
      <span data-testid="count">{activeCount}</span>
      <span data-testid="limit">{limit}</span>
      <span data-testid="atCap">{String(atCap)}</span>
      <span data-testid="unlimited">{String(unlimited)}</span>
      <span data-testid="text">{text}</span>
      <span data-testid="loading">{String(l)}</span>
    </div>
  );
}

const read = (id: string) => screen.getByTestId(id).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { uid: 'u1' };
  h.config = { paywallEnabled: true, freeScansPerMonth: 2, freeActiveGroups: 2, loading: false };
  h.entitlement = { plan: 'free', unlimited: false, loading: false };
});

describe('useGroupCap — counting', () => {
  it('counts a legacy event with NO archived field as ACTIVE', () => {
    // The exact case a `archived === false` filter would drop, letting the user
    // past the cap. Three owned events: one archived, one legacy, one explicit.
    render(
      <Probe
        events={[
          { ownerId: 'u1', archived: true },
          { ownerId: 'u1' },
          { ownerId: 'u1', archived: false },
        ]}
      />,
    );
    expect(read('count')).toBe('2');
    expect(read('atCap')).toBe('true');
  });

  it('ignores events owned by someone else', () => {
    render(
      <Probe
        events={[{ ownerId: 'u1' }, { ownerId: 'someone-else' }, { ownerId: 'someone-else' }]}
      />,
    );
    expect(read('count')).toBe('1');
    expect(read('atCap')).toBe('false');
  });

  it('treats a non-boolean truthy archived value as ACTIVE', () => {
    // Only a literal `true` archives — a bad write must not hide an event from
    // its owner, nor quietly free up a slot.
    render(
      <Probe
        events={[{ ownerId: 'u1', archived: 'yes' as unknown as boolean }, { ownerId: 'u1' }]}
      />,
    );
    expect(read('count')).toBe('2');
    expect(read('atCap')).toBe('true');
  });

  it('is not at the cap below the limit', () => {
    render(<Probe events={[{ ownerId: 'u1' }]} />);
    expect(read('count')).toBe('1');
    expect(read('atCap')).toBe('false');
  });

  it('stays at the cap ABOVE the limit', () => {
    // Owners can sit above a cap tightened under them.
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('count')).toBe('3');
    expect(read('atCap')).toBe('true');
  });

  it('recounts when the events array changes', () => {
    // useEventManager pushes a NEW array on every Firestore snapshot, so this is
    // the hook's only real usage. Dropping `events` from the memo deps survived
    // all 12 tests, because every one of them was a fresh render — a stale memo
    // would leave a user walled after archiving an event and nothing would say so.
    const { rerender } = render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('atCap')).toBe('true');

    rerender(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1', archived: true }]} />);
    expect(read('count')).toBe('1');
    expect(read('atCap')).toBe('false');
  });

  it('handles an empty list', () => {
    render(<Probe events={[]} />);
    expect(read('count')).toBe('0');
    expect(read('atCap')).toBe('false');
  });
});

describe('useGroupCap — the limit comes from Remote Config', () => {
  it('uses the configured limit, not a hardcoded 2', () => {
    h.config = { ...h.config, freeActiveGroups: 5 };
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('limit')).toBe('5');
    expect(read('atCap')).toBe('false');
  });
});

describe('useGroupCap — a paid plan lifts the cap', () => {
  // `atCap` is what a Phase 3 "disable Create group" check reaches for. Without
  // the entitlement input a PAYING subscriber at two groups gets a dead button
  // while `groupDisclosure` (which does mute on `unlimited`) stays silent —
  // broken with no explanation, the worst combination.
  it('is never at the cap for a subscriber, however many groups they own', () => {
    h.entitlement = { plan: 'pro', unlimited: true, loading: false };
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('count')).toBe('3');
    expect(read('atCap')).toBe('false');
    expect(read('unlimited')).toBe('true');
  });

  it('is not at the cap while entitlement is still loading', () => {
    h.entitlement = { plan: 'free', unlimited: false, loading: true };
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('atCap')).toBe('false');
    expect(read('loading')).toBe('true');
  });
});

describe('useGroupCap — the kill switch mutes the cap', () => {
  // THE BLOCKING BUG a whole-slice review caught. Every test in this file pinned
  // paywallEnabled: true, so nothing could see that the hook re-implemented
  // `activeCount >= limit` and dropped the kill-switch term.
  //
  // paywall_enabled = false is the DARK-LAUNCH state prod is in right now, and
  // the documented rollback in plan step 8.5. The server permits over-cap
  // creation while dark (eventFunctions.ts: `allowed: !wouldBlock ||
  // !paywallEnabled`), so a client that walls anyway blocks an action the server
  // would have served — and flipping the switch off would not have cleared it.
  it('is NOT at the cap while enforcement is dark, even at the limit', () => {
    h.config = { ...h.config, paywallEnabled: false };
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('count')).toBe('2');
    expect(read('atCap')).toBe('false');
    expect(read('text')).toBe('');
  });

  it('is not at the cap while dark even ABOVE the limit', () => {
    h.config = { ...h.config, paywallEnabled: false };
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('atCap')).toBe('false');
  });

  it('renders copy alongside the flag, so a wall is never silent', () => {
    // The failure mode this pairing prevents: a dead button with no explanation,
    // because the boolean and the copy disagreed.
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('atCap')).toBe('true');
    expect(read('text')).toBe('2 of 2 groups active');
  });

  it('shows no copy to a subscriber', () => {
    h.entitlement = { plan: 'pro', unlimited: true, loading: false };
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('text')).toBe('');
  });
});

describe('useGroupCap — never block on incomplete information', () => {
  it('is not at the cap while the caller is still loading events', () => {
    // An empty-or-partial list during load must not read as "0 groups", and a
    // partial one must not read as "at cap" either. Blocking creation for a
    // user whose list has not arrived is the unrecoverable direction.
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} loading />);
    expect(read('atCap')).toBe('false');
    expect(read('loading')).toBe('true');
  });

  it('is not at the cap while the config is still loading', () => {
    h.config = { ...h.config, loading: true };
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('atCap')).toBe('false');
    expect(read('loading')).toBe('true');
  });

  it('is not at the cap while auth is unresolved', () => {
    h.user = undefined;
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('atCap')).toBe('false');
    expect(read('loading')).toBe('true');
  });

  it('counts nothing when signed out, and settles', () => {
    h.user = null;
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} />);
    expect(read('count')).toBe('0');
    expect(read('atCap')).toBe('false');
    expect(read('loading')).toBe('false');
  });

  it('is at the cap once everything has settled', () => {
    render(<Probe events={[{ ownerId: 'u1' }, { ownerId: 'u1' }]} loading={false} />);
    expect(read('atCap')).toBe('true');
    expect(read('loading')).toBe('false');
  });
});
