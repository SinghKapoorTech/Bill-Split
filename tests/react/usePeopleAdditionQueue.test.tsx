/**
 * An add that happens BEFORE the bill exists must not be thrown away.
 *
 * Observed in a captured e2e failure: `persistPeopleAddition` was never called
 * at all. `BillWizard` computed `const id = billId || activeSession?.id` and
 * guarded the write with `if (id)` — no else. While the just-in-time draft is
 * still being created the URL is `/bill/new`, so `billId` is undefined and
 * `activeSession` is deliberately null for drafts (AIScanView passes
 * `effectiveSession = isDraft ? null : activeSession`). The person therefore
 * landed in local React state only: the UI showed them, `canProceedFromStep(1)`
 * accepted `people.length > 1`, the wizard advanced — and nothing was ever
 * written, with no error surfaced. The next snapshot erased them.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Person } from '@/types';
import { usePeopleAdditionQueue } from '@/components/bill-wizard/hooks/usePeopleAdditionQueue';

const alice: Person = { id: 'p-alice', name: 'Alice' };
const bob: Person = { id: 'p-bob', name: 'Bob' };

describe('usePeopleAdditionQueue', () => {
  it('persists immediately when the bill already exists', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => usePeopleAdditionQueue('bill-1', persist));

    act(() => result.current([alice]));

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('bill-1', [alice]);
  });

  it('queues an add made before the bill exists, then flushes it once the id arrives', () => {
    const persist = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }: { id?: string }) => usePeopleAdditionQueue(id, persist),
      { initialProps: { id: undefined as string | undefined } },
    );

    // No bill yet — the add must be retained, not dropped.
    act(() => result.current([alice]));
    act(() => result.current([bob]));
    expect(persist).not.toHaveBeenCalled();

    // The JIT draft creation lands and the URL swaps.
    rerender({ id: 'bill-1' });

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith('bill-1', [alice, bob]);
  });

  it('does not re-flush on later renders', () => {
    const persist = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }: { id?: string }) => usePeopleAdditionQueue(id, persist),
      { initialProps: { id: undefined as string | undefined } },
    );

    act(() => result.current([alice]));
    rerender({ id: 'bill-1' });
    expect(persist).toHaveBeenCalledTimes(1);

    rerender({ id: 'bill-1' });
    rerender({ id: 'bill-1' });
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('uses the CURRENT bill id, not the one captured when the caller started', async () => {
    // addPerson awaits a network round trip before calling back, so the id can
    // arrive mid-flight. Reading a stale closure would re-queue forever.
    const persist = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }: { id?: string }) => usePeopleAdditionQueue(id, persist),
      { initialProps: { id: undefined as string | undefined } },
    );

    const addLater = result.current; // captured while id was undefined
    rerender({ id: 'bill-1' });
    act(() => addLater([alice]));

    expect(persist).toHaveBeenCalledWith('bill-1', [alice]);
  });

  it('marks additions pending SYNCHRONOUSLY, even while they sit in the queue', () => {
    // The snapshot-reconciliation guard in BillWizard only protects ids it knows
    // are in flight. If queued people are not marked until the flush, the sync
    // effect adopts the server array verbatim and they vanish from the visible
    // People step — indistinguishable from the bug this all exists to fix.
    const persist = vi.fn();
    const onEnqueue = vi.fn();
    const { result } = renderHook(() =>
      usePeopleAdditionQueue(undefined, persist, onEnqueue),
    );

    act(() => result.current([alice]));

    expect(onEnqueue).toHaveBeenCalledWith([alice]);
    expect(persist).not.toHaveBeenCalled();
  });

  it('KEEPS the queue when the flush write fails, and retries it with the next add', async () => {
    // Clearing the queue before the write means a transient failure silently
    // drops exactly the additions this hook exists to protect.
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ id }: { id?: string }) => usePeopleAdditionQueue(id, persist),
      { initialProps: { id: undefined as string | undefined } },
    );

    act(() => result.current([alice]));
    await act(async () => {
      rerender({ id: 'bill-1' });
    });

    expect(persist).toHaveBeenNthCalledWith(1, 'bill-1', [alice]);

    // Alice must not be lost — the next add carries her along.
    await act(async () => result.current([bob]));

    expect(persist).toHaveBeenNthCalledWith(2, 'bill-1', [alice, bob]);
  });
});
