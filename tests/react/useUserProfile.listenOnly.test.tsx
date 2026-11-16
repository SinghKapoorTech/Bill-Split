/**
 * useUserProfile only LISTENS to users/{uid}; it never creates it.
 *
 * It used to create the doc itself when its first snapshot said "missing",
 * racing userService.syncUserProfile on every signup. That write published
 * the typed (unverified) email with no username, and made both profile syncs
 * that followed fail with permission-denied. syncUserProfile is now the only
 * creator; until its doc lands the hook must report profile:null and stop
 * loading, so the Dashboard renders and opens onboarding once the doc arrives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

type Snap = { exists: () => boolean; data: () => Record<string, unknown> | undefined };

const h = vi.hoisted(() => ({
  emit: null as null | ((snap: Snap) => void),
  unsubscribe: vi.fn(),
  setDoc: vi.fn(),
  user: { uid: 'u1', email: 'typed@divit.test', displayName: null, photoURL: null } as unknown,
}));

// Full factories only — never load src/config/firebase.ts.
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  onSnapshot: (_ref: unknown, next: (s: Snap) => void) => {
    h.emit = next;
    return h.unsubscribe;
  },
  setDoc: h.setDoc,
  Timestamp: { now: () => ({ ms: 1 }) },
}));
vi.mock('@/config/firebase', () => ({ db: {} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: h.user }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { useUserProfile } from '@/hooks/useUserProfile';

const missing: Snap = { exists: () => false, data: () => undefined };
const present = (data: Record<string, unknown>): Snap => ({ exists: () => true, data: () => data });

beforeEach(() => {
  h.emit = null;
  h.unsubscribe.mockReset();
  h.setDoc.mockReset().mockResolvedValue(undefined);
});

describe('useUserProfile — listen-only', () => {
  it('with no doc yet: stops loading, reports profile null, and writes nothing', async () => {
    const { result } = renderHook(() => useUserProfile());
    expect(result.current.loading).toBe(true);
    expect(h.emit).not.toBeNull();

    await act(async () => {
      h.emit!(missing);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.profile).toBeNull();
    expect(h.setDoc).toHaveBeenCalledTimes(0);
  });

  it('picks the profile up when syncUserProfile\'s doc arrives — and the setDoc spy is live', async () => {
    const { result, unmount } = renderHook(() => useUserProfile());
    await act(async () => {
      h.emit!(missing);
    });
    const doc = { uid: 'u1', email: '', displayName: 'Typed Name', username: 'typed-name', hasSeenOnboarding: false };
    await act(async () => {
      h.emit!(present(doc));
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.profile).toEqual(doc);
    expect(h.setDoc).toHaveBeenCalledTimes(0);

    // Proves the absence above is meaningful: a write the hook DOES own goes
    // through the same mocked setDoc and is counted.
    await act(async () => {
      await result.current.updateVenmoId('typed-venmo');
    });
    expect(h.setDoc).toHaveBeenCalledTimes(1);
    expect(h.setDoc.mock.calls[0][1]).toMatchObject({ venmoId: 'typed-venmo', username: 'typed-name' });

    unmount();
    expect(h.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
