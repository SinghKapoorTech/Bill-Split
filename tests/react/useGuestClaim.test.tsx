/**
 * A failed guest claim used to be swallowed (`console.error` only): the new
 * user landed on the shared bill with "We couldn't find your profile on this
 * bill." and no explanation. These tests pin the replacement behaviour.
 *
 * Every test asserts a value that SURVIVES (the pending id still stored, a toast
 * with specific copy) rather than an absence, so each can fail for the right
 * reason (CLAUDE.md rule 2a).
 *
 * `@/services/billService` is mocked with a full factory — it reaches
 * `@/config/firebase`, which throws at import time without a populated `.env`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const h = vi.hoisted(() => ({ claim: vi.fn(), toast: vi.fn() }));

vi.mock('@/services/billService', () => ({ billService: { claimShadowUser: h.claim } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));

import { useGuestClaim } from '@/hooks/useGuestClaim';
import { PENDING_CLAIM_KEY, describeClaimFailure } from '@/utils/guestClaim';

const SHADOW = 'shadow_uid_123';
const fnError = (code: string) => Object.assign(new Error(code), { code });

async function run() {
  const { result } = renderHook(() => useGuestClaim());
  let outcome: string | undefined;
  await act(async () => {
    outcome = await result.current.runPendingClaim();
  });
  return outcome;
}

beforeEach(() => {
  localStorage.clear();
  h.claim.mockReset();
  h.toast.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useGuestClaim', () => {
  it('does nothing when no claim is pending', async () => {
    localStorage.setItem('unrelated', 'kept');
    expect(await run()).toBe('none');
    expect(h.claim).not.toHaveBeenCalled();
    expect(localStorage.getItem('unrelated')).toBe('kept');
  });

  it('claims the pending guest and clears the id on success', async () => {
    localStorage.setItem(PENDING_CLAIM_KEY, SHADOW);
    h.claim.mockResolvedValue({ success: true, claimedBills: 2 });

    expect(await run()).toBe('claimed');
    expect(h.claim).toHaveBeenCalledWith(SHADOW);
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('a temporary failure is SHOWN, keeps the id, and offers Retry', async () => {
    localStorage.setItem(PENDING_CLAIM_KEY, SHADOW);
    h.claim.mockRejectedValue(fnError('functions/unavailable'));

    expect(await run()).toBe('failed');
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBe(SHADOW);
    expect(h.toast).toHaveBeenCalledTimes(1);
    const shown = h.toast.mock.calls[0][0];
    expect(shown).toMatchObject({ variant: 'destructive', title: "Couldn't link your guest bills" });
    expect(shown.action).toBeTruthy();
  });

  it('Retry re-runs the claim and confirms success', async () => {
    localStorage.setItem(PENDING_CLAIM_KEY, SHADOW);
    h.claim.mockRejectedValueOnce(fnError('functions/internal'));
    await run();
    const retry = h.toast.mock.calls[0][0].action.props.onClick as () => Promise<void>;

    h.claim.mockResolvedValueOnce({ success: true, claimedBills: 1 });
    await act(async () => {
      await retry();
    });

    expect(h.claim).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull();
    expect(h.toast).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Guest bills linked' }));
  });

  it('a permanent failure is SHOWN, clears the id, and offers no Retry', async () => {
    localStorage.setItem(PENDING_CLAIM_KEY, SHADOW);
    h.claim.mockRejectedValue(fnError('functions/not-found'));

    expect(await run()).toBe('failed');
    expect(localStorage.getItem(PENDING_CLAIM_KEY)).toBeNull();
    const shown = h.toast.mock.calls[0][0];
    expect(shown.description).toMatch(/already linked/);
    expect(shown.action).toBeUndefined();
  });
});

describe('describeClaimFailure', () => {
  it.each([
    'functions/not-found',
    'functions/permission-denied',
    'functions/invalid-argument',
    'functions/failed-precondition',
  ])('%s is permanent', (code) => {
    expect(describeClaimFailure(fnError(code)).retryable).toBe(false);
  });

  it.each([
    'functions/unavailable',
    'functions/internal',
    'functions/deadline-exceeded',
    'functions/unauthenticated',
  ])('%s is retryable', (code) => {
    expect(describeClaimFailure(fnError(code)).retryable).toBe(true);
  });

  it('a non-Firebase error (offline fetch, null) is retryable, never a crash', () => {
    expect(describeClaimFailure(new TypeError('Failed to fetch')).retryable).toBe(true);
    expect(describeClaimFailure(null).retryable).toBe(true);
    expect(describeClaimFailure(undefined).retryable).toBe(true);
  });
});
