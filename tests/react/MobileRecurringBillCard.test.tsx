/**
 * `MobileRecurringBillCard` — the pause/resume control on the Bills page.
 *
 * Pause/resume used to be reachable only from Settings → Recurring. That tab is
 * being removed, so this control is now the ONLY way to pause a template; the
 * tests pin that it exists, says the right verb, and acts without opening the
 * template (the row itself navigates).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MobileRecurringBillCard from '@/components/dashboard/MobileRecurringBillCard';
import type { RecurringBill } from '@/types/recurring.types';

function bill(overrides: Partial<RecurringBill> = {}): RecurringBill {
  return {
    id: 'r1',
    ownerId: 'u1',
    ownerName: 'Sam',
    title: 'Rent',
    amount: 1200,
    paidById: 'u1',
    people: [],
    splitEvenly: true,
    schedule: { frequency: 'monthly', dayOfMonth: 1 },
    status: 'active',
    nextRunDate: '2026-11-01',
    lastRunDate: null,
    generatedBillIds: [],
    ...overrides,
  } as RecurringBill;
}

describe('MobileRecurringBillCard — pause/resume', () => {
  it('an active template offers Pause, and tapping it does not open the template', async () => {
    const onView = vi.fn();
    const onTogglePause = vi.fn();
    const b = bill();
    render(<MobileRecurringBillCard bill={b} onView={onView} onTogglePause={onTogglePause} />);

    await userEvent.click(screen.getByRole('button', { name: 'Pause recurring bill Rent' }));

    expect(onTogglePause).toHaveBeenCalledWith(b);
    // Asserted alongside the positive call above, so it cannot pass vacuously:
    // the click demonstrably landed, and it still did not bubble to the row.
    expect(onView).not.toHaveBeenCalled();
  });

  it('a paused template offers Resume instead', () => {
    render(
      <MobileRecurringBillCard
        bill={bill({ status: 'paused' })}
        onView={() => {}}
        onTogglePause={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Resume recurring bill Rent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Pause/ })).toBeNull();
  });

  it('shows no pause control when the caller does not handle it', () => {
    render(<MobileRecurringBillCard bill={bill()} onView={() => {}} onDelete={() => {}} />);
    expect(screen.queryByRole('button', { name: /Pause|Resume/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Delete recurring bill Rent' })).toBeInTheDocument();
  });
});
