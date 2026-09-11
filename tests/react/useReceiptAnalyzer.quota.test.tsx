/**
 * The SERVER-RACE path: what happens when the client thought a scan was fine
 * and the server refused it.
 *
 * The pre-action wall in `ReceiptUploader` is a courtesy, not the gate. It can
 * be wrong in both directions — a second device burned the last scan, the
 * Remote Config limit tightened mid-session, or the 5-minute config TTL had not
 * yet expired. When it is wrong, `analyzeBill` rejects with `resource-exhausted`
 * and a typed `details` payload, and THAT is what must raise the wall.
 *
 * THE DISTINCTION THIS FILE EXISTS TO PROTECT: three unrelated conditions share
 * the `resource-exhausted` code. The hourly anti-abuse limiter is one of them,
 * it applies to Pro subscribers too, and it clears itself in minutes. Treating
 * any `resource-exhausted` as a paywall trigger sells Pro to someone who
 * already pays.
 *
 * `@/services/gemini` is mocked WITHOUT `importOriginal` — it reaches
 * `@/config/firebase`, which calls `getAuth(app)` at import time and throws
 * without a populated `.env`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { AnalyzeBillError } from '@/utils/analyzeBillError';

const h = vi.hoisted(() => ({
  analyze: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/services/gemini', () => ({ analyzeBillImage: h.analyze }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

import { useReceiptAnalyzer } from '@/hooks/useReceiptAnalyzer';

const IMAGE = 'data:image/png;base64,AAAA';
const FILE = new File(['x'], 'receipt.png', { type: 'image/png' });

function setup() {
  return renderHook(() => useReceiptAnalyzer(vi.fn(), vi.fn()));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useReceiptAnalyzer — a refused scan raises the wall, not a toast', () => {
  it('surfaces the server payload as the quota wall', async () => {
    h.analyze.mockRejectedValue(
      new AnalyzeBillError("You've used your 2 free scans this month.", {
        reason: 'scan-quota',
        used: 2,
        limit: 2,
        resetsAtMs: Date.UTC(2026, 9, 1),
      }),
    );

    const { result } = setup();
    await act(async () => {
      await result.current.analyzeReceipt(FILE, IMAGE);
    });

    expect(result.current.quotaWall).toEqual({
      reason: 'scan-quota',
      used: 2,
      limit: 2,
      resetsAtMs: Date.UTC(2026, 9, 1),
    });
    // A toast BEHIND the wall would be the same news told twice, in a tone that
    // reads as a malfunction rather than a limit.
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('trusts the SERVER limit over anything the client believed', async () => {
    // The whole reason this path exists is that the client was wrong. Rendering
    // the client's own `limit` here would reprint the stale number that let the
    // scan through in the first place.
    h.analyze.mockRejectedValue(
      new AnalyzeBillError('nope', {
        reason: 'scan-quota',
        used: 5,
        limit: 5,
        resetsAtMs: Date.UTC(2026, 9, 1),
      }),
    );

    const { result } = setup();
    await act(async () => {
      await result.current.analyzeReceipt(FILE, IMAGE);
    });

    expect(result.current.quotaWall?.limit).toBe(5);
  });

  it('does NOT raise the wall for the hourly rate limiter', async () => {
    // Same `resource-exhausted` code, entirely different meaning: anti-abuse,
    // applies to Pro subscribers, clears on its own. Selling an upgrade here is
    // a lie told to someone who may already have paid.
    h.analyze.mockRejectedValue(
      new AnalyzeBillError('Too many scans. Try again shortly.', {
        reason: 'scan-rate-limit',
        retryAfterMs: 60_000,
      }),
    );

    const { result } = setup();
    await act(async () => {
      await result.current.analyzeReceipt(FILE, IMAGE);
    });

    expect(result.current.quotaWall).toBeNull();
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('falls back to the toast when there is no usable payload', async () => {
    // An older deployed function, or a field lost in transit. The prose message
    // is still the whole user-facing story.
    h.analyze.mockRejectedValue(new Error('Failed to analyze receipt: something broke'));

    const { result } = setup();
    await act(async () => {
      await result.current.analyzeReceipt(FILE, IMAGE);
    });

    expect(result.current.quotaWall).toBeNull();
    expect(h.toast).toHaveBeenCalledTimes(1);
  });

  it('can be dismissed, and a later success does not resurrect it', async () => {
    h.analyze.mockRejectedValue(
      new AnalyzeBillError('nope', {
        reason: 'scan-quota',
        used: 2,
        limit: 2,
        resetsAtMs: Date.UTC(2026, 9, 1),
      }),
    );

    const { result } = setup();
    await act(async () => {
      await result.current.analyzeReceipt(FILE, IMAGE);
    });
    expect(result.current.quotaWall).not.toBeNull();

    act(() => result.current.dismissQuotaWall());
    expect(result.current.quotaWall).toBeNull();
  });

  it('clears a stale wall when a later scan succeeds', async () => {
    // A subscriber who upgrades mid-session, or a month boundary crossing,
    // makes the previous refusal obsolete. A wall left standing over a
    // successful scan is a dead modal the user cannot explain.
    h.analyze.mockRejectedValueOnce(
      new AnalyzeBillError('nope', {
        reason: 'scan-quota',
        used: 2,
        limit: 2,
        resetsAtMs: Date.UTC(2026, 9, 1),
      }),
    );
    const { result } = setup();
    await act(async () => {
      await result.current.analyzeReceipt(FILE, IMAGE);
    });
    expect(result.current.quotaWall).not.toBeNull();

    h.analyze.mockResolvedValueOnce({
      items: [{ id: 'i1', name: 'Burger', price: 12 }],
      subtotal: 12,
      tax: 1,
      tip: 2,
      total: 15,
    });
    await act(async () => {
      await result.current.analyzeReceipt(FILE, IMAGE);
    });

    expect(result.current.quotaWall).toBeNull();
  });
});
