/**
 * A draft-creation URL swap (`new -> <id>`, DRAFT_CREATED_NAV_STATE) runs
 * after `await saveSession(...)`. If the user starts another new bill while
 * that save is in flight, useBillRouteInstanceKey remounts the page; the OLD
 * instance's late swap would then carry the flag, so the FRESH, empty page
 * would keep its instance and be bound to the first bill's id — the empty
 * wizard could then autosave over it.
 *
 * Pinned on useBillSession (the shared auto-save swap). The mounted case is
 * the positive control: it proves the swap fires at all, so "not called"
 * after unmount is not vacuous.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useState } from 'react';
import type { Person } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
const navigate = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));

import { useBillSession } from '@/components/bill-wizard/hooks/useBillSession';

const owner: Person = { id: 'user-owner', name: 'Owner' };
const billData = {
  items: [{ id: 'i1', name: 'Pizza', price: 20 }],
  subtotal: 20, tax: 0, tip: 0, otherFees: 0, total: 20,
};

let finishCreation: (id: string) => void;
const saveSession = vi.fn(
  () => new Promise<string>((resolve) => { finishCreation = resolve; }),
);
let bump: () => void;

function Harness() {
  const [step, setStep] = useState(0);
  bump = () => setStep((s) => s + 1);
  useBillSession({
    billData, people: [owner], itemAssignments: {}, splitEvenly: false,
    currentStep: step, title: '', activeSession: null, billId: undefined,
    saveSession,
  } as unknown as Parameters<typeof useBillSession>[0]);
  return null;
}

async function startDraftCreation() {
  const view = render(<Harness />);
  await act(async () => { await new Promise((r) => setTimeout(r, 250)); }); // past init guard
  await act(async () => bump());
  expect(saveSession).toHaveBeenCalledTimes(1); // creation is in flight
  return view;
}

describe('draft URL swap after the page is gone', () => {
  beforeEach(() => {
    navigate.mockClear();
    saveSession.mockClear();
  });

  it('mounted: the swap fires (positive control)', async () => {
    await startDraftCreation();
    await act(async () => finishCreation('bill-1'));
    expect(navigate).toHaveBeenCalledWith('/bill/bill-1', expect.objectContaining({ replace: true }));
  });

  it('unmounted before the save resolves: no swap', async () => {
    const view = await startDraftCreation();
    const first = finishCreation;
    view.unmount();
    await act(async () => first('bill-1'));
    expect(navigate).not.toHaveBeenCalledWith('/bill/bill-1', expect.anything());
  });
});
