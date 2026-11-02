/**
 * removeReceiptImage(target) must clear the TARGET bill's receipt. activeSession
 * is only the user's latest bill; a page showing an older bill used to delete
 * the latest bill's Storage object and receipt fields instead.
 *
 * Firestore/Storage are a tiny in-memory world so the test can assert the
 * other bill's receipt SURVIVED (not merely that some call was absent).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Bill } from '@/types/bill.types';

const world = vi.hoisted(() => ({
  files: new Set<string>(),
  docs: new Map<string, Record<string, unknown>>(),
}));
const DELETE = vi.hoisted(() => Symbol('deleteField'));

vi.mock('@/config/firebase', () => ({ db: {}, storage: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  // Serve the live list: LATEST first (= activeSession), then OLDER.
  onSnapshot: vi.fn((_q: unknown, next: (s: unknown) => void) => {
    next({
      docs: ['bill-latest', 'bill-older'].map((id) => ({ id, data: () => world.docs.get(id) })),
    });
    return () => {};
  }),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ col, id })),
  deleteDoc: vi.fn(),
  Timestamp: { now: vi.fn(() => '__now__') },
  orderBy: vi.fn(),
  limit: vi.fn(),
  deleteField: vi.fn(() => DELETE),
  updateDoc: vi.fn(async (ref: { id: string }, data: Record<string, unknown>) => {
    const d = { ...(world.docs.get(ref.id) ?? {}) };
    for (const [k, v] of Object.entries(data)) {
      if (v === DELETE) delete d[k];
      else d[k] = v;
    }
    world.docs.set(ref.id, d);
  }),
  serverTimestamp: vi.fn(() => '__ts__'),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(async (r: { path: string }) => {
    world.files.delete(r.path);
  }),
}));
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
const toastValue = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => toastValue }));
vi.mock('@/services/billService', () => ({ billService: {} }));

import { useBills } from '@/hooks/useBills';

const LATEST_FILE = 'receipts/owner-uid/receipt_latest';
const OLDER_FILE = 'receipts/owner-uid/receipt_older';

beforeEach(() => {
  world.files = new Set([LATEST_FILE, OLDER_FILE]);
  world.docs = new Map<string, Record<string, unknown>>([
    ['bill-latest', { title: 'Latest', receiptFileName: 'receipt_latest', receiptImageUrl: 'https://img/latest' }],
    ['bill-older', { title: 'Older', receiptFileName: 'receipt_older', receiptImageUrl: 'https://img/older' }],
  ]);
});

async function mountWithLiveList() {
  const hook = renderHook(() => useBills());
  await waitFor(() => expect(hook.result.current.activeSession?.id).toBe('bill-latest'));
  expect(hook.result.current.savedSessions.map((b) => b.id)).toEqual(['bill-older']);
  return hook;
}

describe('useBills.removeReceiptImage', () => {
  it('C12: with a target (older bill) it removes THAT receipt and the latest bill\'s receipt survives', async () => {
    const { result } = await mountWithLiveList();
    const older = result.current.savedSessions[0] as Bill;

    await act(async () => {
      await result.current.removeReceiptImage(older);
    });

    // Older bill's receipt is gone…
    expect(world.files.has(OLDER_FILE)).toBe(false);
    expect(world.docs.get('bill-older')).not.toHaveProperty('receiptFileName');
    expect(world.docs.get('bill-older')).not.toHaveProperty('receiptImageUrl');
    // …and the latest bill's receipt is exactly as it was.
    expect(world.files.has(LATEST_FILE)).toBe(true);
    expect(world.docs.get('bill-latest')).toMatchObject({
      receiptFileName: 'receipt_latest',
      receiptImageUrl: 'https://img/latest',
    });
  });

  it('backward compatible: with no target it still clears activeSession\'s receipt (and only that)', async () => {
    const { result } = await mountWithLiveList();

    await act(async () => {
      await result.current.removeReceiptImage();
    });

    expect(world.files.has(LATEST_FILE)).toBe(false);
    expect(world.docs.get('bill-latest')).not.toHaveProperty('receiptFileName');
    expect(world.files.has(OLDER_FILE)).toBe(true);
    expect(world.docs.get('bill-older')).toMatchObject({ receiptFileName: 'receipt_older' });
  });
});
