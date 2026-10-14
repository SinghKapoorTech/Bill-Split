/**
 * "Scan again" REPLACES the bill's items with the new scan — it does not add
 * to them (owner decision, 2026-10-14).
 *
 * The old behaviour merged: items and subtotal were summed while the existing
 * tax/tip were kept and the new receipt's were dropped. A second, different
 * receipt therefore produced a bill that was neither receipt (beta repro:
 * 12 items, $190 subtotal, ONE $7.60 tax = $197.60).
 *
 * Asserts the exact replacement value, not the absence of old items, so the
 * test cannot pass on an empty or partial result.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { BillData } from '@/types/bill.types';

const h = vi.hoisted(() => ({ analyze: vi.fn(), toast: vi.fn() }));
vi.mock('@/services/gemini', () => ({ analyzeBillImage: h.analyze }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

import { useReceiptAnalyzer } from '@/hooks/useReceiptAnalyzer';

const IMAGE = 'data:image/png;base64,AAAA';
const FILE = new File(['x'], 'receipt.png', { type: 'image/png' });

const newScan: BillData = {
  items: [
    { id: 'new-1', name: 'Tacos', price: 15 },
    { id: 'new-2', name: 'Free Chips', price: 0 }, // $0 lines are still dropped
    { id: 'new-3', name: 'Horchata', price: 5 },
  ],
  subtotal: 20,
  tax: 1.8,
  tip: 4,
  otherFees: 0,
  total: 25.8,
  restaurantName: 'Taqueria Luna',
};

const expected: BillData = {
  ...newScan,
  items: [newScan.items[0], newScan.items[2]],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useReceiptAnalyzer — scanning again replaces the items', () => {
  it('a scan yields exactly the new receipt, with $0 lines dropped', async () => {
    h.analyze.mockResolvedValue(newScan);
    const setBillData = vi.fn();
    const { result } = renderHook(() =>
      // The hook no longer receives the bill on screen at all, so nothing
      // from a previous scan can leak into the result.
      useReceiptAnalyzer(setBillData, vi.fn()),
    );

    let returned: BillData | null = null;
    await act(async () => {
      returned = await result.current.analyzeReceipt(FILE, IMAGE);
    });

    expect(returned).toEqual(expected);
    expect(setBillData).toHaveBeenCalledTimes(1);
    expect(setBillData).toHaveBeenCalledWith(expected);
  });

  it('the result does not depend on the bill already on screen', async () => {
    // Tripwire: the hook used to take the on-screen bill as a third argument
    // and merge into it. Re-adding one must be a deliberate decision.
    expect(useReceiptAnalyzer.length).toBe(2);
  });
});
