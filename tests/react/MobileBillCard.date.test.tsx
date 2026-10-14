/**
 * `MobileBillCard` shows when the bill was created ("$41.00 · 10/09/26").
 *
 * Pinned: the date appears; it is left off (not "Unknown date") when the
 * timestamp is missing; and it is not repeated for an untitled bill whose
 * title already IS the date (getBillTitle's fallback).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import type { Bill } from '@/types/bill.types';

const OCT_9 = new Date(2026, 9, 9, 12); // local noon — matches toLocaleDateString
const ts = (d: Date) => ({ toDate: () => d });

function bill(overrides: Partial<Bill> = {}): Bill {
  return {
    id: 'b1',
    ownerId: 'u1',
    billType: 'private',
    title: 'Osteria Nino',
    billData: { items: [], subtotal: 41, tax: 0, tip: 0, total: 41 },
    people: [],
    itemAssignments: {},
    createdAt: ts(OCT_9),
    ...overrides,
  } as unknown as Bill;
}

function renderCard(
  b: Bill,
  getBillTitle = (x: Bill) => x.title || 'Oct 9, 2026',
  isLatest = false,
) {
  return render(
    <MobileBillCard
      bill={b}
      isLatest={isLatest}
      onView={() => {}}
      onResume={async () => {}}
      onDelete={() => {}}
      isResuming={false}
      isDeleting={false}
      formatDate={() => 'unused'}
      getBillTitle={getBillTitle}
    />,
  );
}

describe('MobileBillCard — created date', () => {
  it('shows the created date next to the total', () => {
    renderCard(bill());
    expect(screen.getByText('$41.00 · 10/09/26')).toBeInTheDocument();
  });

  it('leaves the date off when the bill has no createdAt', () => {
    renderCard(bill({ createdAt: undefined as unknown as Bill['createdAt'] }));
    expect(screen.getByText('$41.00')).toBeInTheDocument();
    expect(screen.queryByText(/Unknown date/)).toBeNull();
  });

  it('does not repeat the date for an untitled bill titled by its date', () => {
    renderCard(bill({ title: undefined }));
    // Title is the date; the subtitle is just the total.
    expect(screen.getByText('Oct 9, 2026')).toBeInTheDocument();
    expect(screen.getByText('$41.00')).toBeInTheDocument();
  });
});

describe('MobileBillCard — Latest marker', () => {
  it('sits on the amount line, not beside the title', () => {
    renderCard(bill(), undefined, true);
    const latest = screen.getByText(/Latest/);
    // Same line as the total and date; the title line is left to the name.
    expect(latest.closest('span.text-xs')?.textContent).toBe('$41.00 · 10/09/26 · Latest');
    expect(screen.getByText('Osteria Nino').parentElement?.textContent).not.toContain('Latest');
  });

  it('is absent on other bills', () => {
    renderCard(bill());
    expect(screen.queryByText(/Latest/)).toBeNull();
  });
});
