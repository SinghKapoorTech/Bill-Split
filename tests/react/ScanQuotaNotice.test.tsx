/**
 * The standing scan count on the AI scan tab.
 *
 * Replaced a chip, deliberately: a pill reads as a notification that arrived
 * and will leave, and the owner wanted a permanent answer to "how many do I
 * have left". The muting contract is unchanged and is what these tests pin.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScanQuotaNotice } from '@/components/monetization/ScanQuotaNotice';

describe('ScanQuotaNotice', () => {
  it('states the count while scans remain', () => {
    render(<ScanQuotaNotice level="ambient" text="2 free AI scans left this month · resets Oct 1" />);
    expect(
      screen.getByText('2 free AI scans left this month · resets Oct 1'),
    ).toBeInTheDocument();
  });

  it('keeps stating it at zero, rather than disappearing behind the modal', () => {
    // The modal only fires on a tap. If this line vanished at zero the tab
    // would show no explanation at all until the user tried something.
    render(<ScanQuotaNotice level="wall" text="0 free AI scans left this month · resets Oct 1" />);
    expect(
      screen.getByText('0 free AI scans left this month · resets Oct 1'),
    ).toBeInTheDocument();
  });

  it('renders NOTHING at hidden — Pro, the kill switch, and mid-load', () => {
    const { container } = render(<ScanQuotaNotice level="hidden" text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the level says show but the copy is empty', () => {
    const { container } = render(<ScanQuotaNotice level="ambient" text="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('goes destructive ONLY at zero', () => {
    // Untested until now: revert the tone ternary to always-muted and every
    // other test in this file still passed. Zero is the one band that has
    // earned alarm — colouring "1 left" as a warning turns an allowance the
    // user is spending normally into an error state.
    const { container: atZero } = render(
      <ScanQuotaNotice level="wall" text="0 free AI scans left this month" />,
    );
    expect(atZero.firstElementChild).toHaveClass('text-destructive');

    const { container: lastOne } = render(
      <ScanQuotaNotice level="last" text="1 free AI scan left this month" />,
    );
    expect(lastOne.firstElementChild).toHaveClass('text-muted-foreground');
    expect(lastOne.firstElementChild).not.toHaveClass('text-destructive');
  });

  it('stays silent at the silent band', () => {
    // `'silent'` produces no input today at a limit of 2, but it is in the
    // spec's vocabulary and this component switches on it.
    const { container } = render(<ScanQuotaNotice level="silent" text="anything" />);
    expect(container).toBeEmptyDOMElement();
  });
});
