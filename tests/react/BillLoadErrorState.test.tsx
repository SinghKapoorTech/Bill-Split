/**
 * BillLoadErrorState — the full-page card shown when a bill URL fails to load.
 * Two variants: offline (retry is the fix → primary) and unavailable (deleted
 * or no access → going back is the fix → primary).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BillLoadErrorState } from '@/components/bill/BillLoadErrorState';
import type { BillLoadFailure } from '@/utils/billLoadResult';

function setup(failure: BillLoadFailure, extra: { backLabel?: string; isRetrying?: boolean } = {}) {
  const onRetry = vi.fn();
  const onBack = vi.fn();
  render(<BillLoadErrorState failure={failure} onRetry={onRetry} onBack={onBack} {...extra} />);
  return { onRetry, onBack };
}

// Primary = the first button in DOM order (the visually leading action).
const buttonNames = () => screen.getAllByRole('button').map((b) => b.textContent?.trim());

describe('BillLoadErrorState', () => {
  it.each(['offline', 'error'] as const)('%s → offline copy with Try again primary', (failure) => {
    setup(failure);
    expect(screen.getByRole('heading', { name: "You're offline" })).toBeInTheDocument();
    expect(screen.getByText('Check your connection and try again.')).toBeInTheDocument();
    expect(screen.queryByText(/deleted/)).not.toBeInTheDocument();
    expect(buttonNames()).toEqual(['Try again', 'Go back']);
  });

  it.each(['not-found', 'denied'] as const)('%s → unavailable copy with Go back primary', (failure) => {
    setup(failure);
    expect(screen.getByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
    expect(screen.getByText("It may have been deleted, or you don't have access.")).toBeInTheDocument();
    expect(screen.queryByText(/offline/)).not.toBeInTheDocument();
    expect(buttonNames()).toEqual(['Go back', 'Try again']);
  });

  it('wires Try again and Go back to their own callbacks', () => {
    const { onRetry, onBack } = setup('offline');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('backLabel personalises the back button, keeping "Go back" in its name', () => {
    const { onBack } = setup('denied', { backLabel: 'Event' });
    const back = screen.getByRole('button', { name: /Go back/ });
    expect(back).toHaveAccessibleName(expect.stringContaining('Event'));
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('isRetrying disables Try again and shows a spinner', () => {
    const { onRetry } = setup('offline', { isRetrying: true });
    const retry = screen.getByRole('button', { name: /Try again/ });
    expect(retry).toBeDisabled();
    expect(retry.querySelector('svg.animate-spin')).not.toBeNull();
    fireEvent.click(retry);
    expect(onRetry).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Go back' })).toBeEnabled();
  });

  it('Try again is enabled with no spinner when not retrying', () => {
    setup('offline');
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toBeEnabled();
    expect(retry.querySelector('svg.animate-spin')).toBeNull();
  });
});
