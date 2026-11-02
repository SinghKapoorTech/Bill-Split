/**
 * useBills.loadBill — the bill screens' URL load — and the silent
 * resumeSession contract.
 *
 * loadBill must turn every getBill outcome into a BillLoadResult without
 * throwing, toasting, or writing (a screen renders its own error state, and an
 * updatedAt write would reorder the user's sessions just for opening a link).
 *
 * resumeSession(id, true) is the silent URL load: it must not toast either.
 * The explicit resume (Dashboard/Event/Squad/Balance) keeps its toast + null,
 * since those callers ignore the return and rely on the toast as feedback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Bill } from '@/types/bill.types';

// Full factories only: anything that imports `@/config/firebase` for real
// throws auth/invalid-api-key without a .env (CI).
vi.mock('@/config/firebase', () => ({ db: {}, storage: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(() => () => {}),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  Timestamp: { now: vi.fn(() => '__now__') },
  orderBy: vi.fn(),
  limit: vi.fn(),
  deleteField: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(() => '__ts__'),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn(),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  getBill: vi.fn(),
  updateBill: vi.fn(),
}));
const toastValue = vi.hoisted(() => ({ toast: (...a: unknown[]) => h.toast(...a) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => toastValue }));
vi.mock('@/services/billService', () => ({
  billService: {
    getBill: (...a: unknown[]) => h.getBill(...a),
    updateBill: (...a: unknown[]) => h.updateBill(...a),
  },
}));

import { useBills } from '@/hooks/useBills';

const bill = { id: 'bill-1', title: 'Taco Night' } as unknown as Bill;
const firestoreError = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  h.toast.mockReset();
  h.getBill.mockReset();
  h.updateBill.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useBills.loadBill', () => {
  it('returns loaded with the fetched bill', async () => {
    h.getBill.mockResolvedValue(bill);
    const { result } = renderHook(() => useBills());
    let res: unknown;
    await act(async () => {
      res = await result.current.loadBill('bill-1');
    });
    expect(h.getBill).toHaveBeenCalledWith('bill-1');
    expect(res).toEqual({ status: 'loaded', bill: { id: 'bill-1', title: 'Taco Night' } });
    expect(h.updateBill).not.toHaveBeenCalled();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('returns not-found when the bill does not exist', async () => {
    h.getBill.mockResolvedValue(null);
    const { result } = renderHook(() => useBills());
    let res: unknown;
    await act(async () => {
      res = await result.current.loadBill('missing');
    });
    expect(res).toEqual({ status: 'not-found' });
    expect(h.toast).not.toHaveBeenCalled();
  });

  it.each([
    ['permission-denied', 'denied'],
    ['unavailable', 'offline'],
    ['internal', 'error'],
  ])('classifies a %s rejection as %s without throwing, toasting or writing', async (code, status) => {
    h.getBill.mockRejectedValue(firestoreError(code));
    const { result } = renderHook(() => useBills());
    let res: unknown;
    await act(async () => {
      res = await result.current.loadBill('bill-1');
    });
    expect(res).toEqual({ status });
    expect(h.toast).not.toHaveBeenCalled();
    expect(h.updateBill).not.toHaveBeenCalled();
  });
});

describe('useBills.resumeSession', () => {
  it('silent load failure does not toast and resolves null', async () => {
    h.getBill.mockRejectedValue(firestoreError('unavailable'));
    const { result } = renderHook(() => useBills());
    let res: unknown = 'unset';
    await act(async () => {
      res = await result.current.resumeSession('bill-1', true);
    });
    expect(res).toBeNull();
    expect(h.toast).not.toHaveBeenCalled();
    // Positive control in the same render: the toast mock IS wired — an
    // explicit resume failing right after does toast.
    await act(async () => {
      await result.current.resumeSession('bill-1');
    });
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('silent load of a missing bill does not toast', async () => {
    h.getBill.mockResolvedValue(null);
    const { result } = renderHook(() => useBills());
    await act(async () => {
      await result.current.resumeSession('missing', true);
    });
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('explicit resume failure still toasts "Could not resume session." and resolves null', async () => {
    h.getBill.mockResolvedValue(null);
    const { result } = renderHook(() => useBills());
    let res: unknown = 'unset';
    await act(async () => {
      res = await result.current.resumeSession('missing');
    });
    expect(res).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Could not resume session.', variant: 'destructive' }),
    );
  });

  it('explicit resume success still touches updatedAt and returns the bill', async () => {
    h.getBill.mockResolvedValue(bill);
    const { result } = renderHook(() => useBills());
    let res: unknown;
    await act(async () => {
      res = await result.current.resumeSession('bill-1');
    });
    expect(res).toEqual({ id: 'bill-1', title: 'Taco Night' });
    expect(h.updateBill).toHaveBeenCalledWith('bill-1', { updatedAt: '__now__' });
    expect(h.toast).not.toHaveBeenCalled();
  });
});
