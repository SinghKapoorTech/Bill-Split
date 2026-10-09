/**
 * `useBills.saveSession` must FORWARD its `options` argument to
 * `billService.updateBill`.
 *
 * Why this file exists: the people guard in `billService.updateBill` refuses a
 * `people` write that drops a stored person unless the caller passes
 * `{ allowPeopleRemoval: true }`. That intent is threaded through several
 * layers, and a dropped forward is INVISIBLE — the call still succeeds, it just
 * silently loses the authorization, and the legitimate removal stops
 * persisting. The first adversarial review of the guard found exactly that
 * class of defect (a write site that was never wired), and a second review
 * noted that deleting any one of these forwards left all 1041 tests green.
 *
 * So this pins the wiring itself rather than the guard's logic (which
 * `tests/billServicePeopleGuard.test.ts` covers).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import type { Bill } from '@/types/bill.types';

// --- Leaf mocks. Plain factories only: anything that transitively imports
// --- `@/config/firebase` calls `getAuth(app)` at import time and throws
// --- `auth/invalid-api-key`, so no `importOriginal` here.
vi.mock('@/config/firebase', () => ({ db: {}, storage: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  Timestamp: { now: vi.fn() },
  orderBy: vi.fn(),
  limit: vi.fn(),
  deleteField: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '__ts__'),
  FieldValue: class FieldValue {},
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const updateBill = vi.fn(async () => ({ peopleStripped: false }));
vi.mock('@/services/billService', () => ({
  billService: {
    updateBill: (...args: unknown[]) => updateBill(...(args as [])),
    createBill: vi.fn(),
    createSimpleTransaction: vi.fn(),
  },
}));

import { useBills } from '@/hooks/useBills';

const people = [{ id: 'user-owner-uid', name: 'Owner' }];

function Harness() {
  const { saveSession } = useBills();
  return (
    <div>
      <button
        onClick={() =>
          void saveSession({ people } as Partial<Bill>, 'bill-1', {
            allowPeopleRemoval: true,
          })
        }
      >
        save-with-intent
      </button>
      <button onClick={() => void saveSession({ people } as Partial<Bill>, 'bill-1')}>
        save-without-intent
      </button>
    </div>
  );
}

const click = async (label: string) => {
  await act(async () => {
    screen.getByText(label).click();
  });
};

describe('useBills.saveSession — options forwarding', () => {
  beforeEach(() => {
    updateBill.mockClear();
  });

  it('forwards allowPeopleRemoval through to billService.updateBill', async () => {
    render(<Harness />);
    await click('save-with-intent');

    expect(updateBill).toHaveBeenCalledTimes(1);
    // The third argument is the whole point — dropping it is the silent
    // failure this test exists to catch.
    expect(updateBill.mock.calls[0][2]).toEqual({ allowPeopleRemoval: true });
  });

  it('does not invent intent when the caller passed none', async () => {
    render(<Harness />);
    await click('save-without-intent');

    expect(updateBill).toHaveBeenCalledTimes(1);
    expect(updateBill.mock.calls[0][2]).toBeUndefined();
  });
});
