/**
 * /bill/:billId used to spin forever when the URL load failed (missing doc,
 * permission-denied, offline). It must show BillLoadErrorState instead — but
 * never in place of a bill that is already on screen: offline, getDoc rejects
 * while onSnapshot keeps serving the cached bill.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Bill } from '@/types';
import type { BillLoadResult } from '@/utils/billLoadResult';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  deleteField: vi.fn(),
}));
// Stable identities, like the real hooks: AIScanView effects depend on them.
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
const profileValue = vi.hoisted(() => ({ profile: { venmoId: 'owner-venmo' } }));
const goBack = vi.hoisted(() => vi.fn());
const returnTo = vi.hoisted(() => ({ goBack, label: 'Bills', returnTo: '/dashboard' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => profileValue }));
vi.mock('@/hooks/useSessionTimeout', () => ({ useSessionTimeout: () => {} }));
vi.mock('@/hooks/useReturnTo', () => ({ useReturnTo: () => returnTo }));
vi.mock('@/components/layout/HeroSection', () => ({ HeroSection: () => null }));
vi.mock('@/components/share/ShareLinkDialog', () => ({ ShareLinkDialog: () => null }));
vi.mock('@/services/billService', () => ({ billService: {} }));
vi.mock('@/services/userService', () => ({ userService: {} }));
vi.mock('@/components/bill-wizard/BillWizard', () => ({
  BILL_WIZARD_REVIEW_STEP: 3,
  BillWizard: ({ initialTitle }: { initialTitle?: string }) => (
    <div data-testid="wizard">{initialTitle || 'untitled'}</div>
  ),
}));

const BILL_ID = 'bill-1';
const bill = {
  id: BILL_ID,
  title: 'Taco Tuesday',
  billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
  people: [],
  itemAssignments: {},
} as unknown as Bill;

const ctx = {
  activeSession: null as Bill | null,
  isLoadingSessions: false,
  isUploading: false,
  uploadReceiptImage: vi.fn(),
  resumeSession: vi.fn(),
  loadBill: vi.fn<(id: string) => Promise<BillLoadResult>>(),
  saveSession: vi.fn(),
  removeReceiptImage: vi.fn(),
  deleteSession: vi.fn(),
};
vi.mock('@/contexts/BillSessionContext', () => ({ useBillContext: () => ctx }));

import AIScanView from '@/pages/AIScanView';

function tree() {
  return (
    <MemoryRouter initialEntries={[`/bill/${BILL_ID}`]}>
      <Routes>
        <Route path="/bill/:billId" element={<AIScanView />} />
      </Routes>
    </MemoryRouter>
  );
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('AIScanView — URL load failure', () => {
  beforeEach(() => {
    ctx.activeSession = null;
    ctx.isLoadingSessions = false;
    ctx.loadBill.mockReset();
    ctx.resumeSession.mockReset();
    goBack.mockReset();
  });

  it('C1: a missing bill shows the unavailable screen with Go back + Try again, no spinner', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    const { container } = render(tree());

    expect(await screen.findByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(container.querySelector('.loading-spinner')).not.toBeInTheDocument();
    expect(ctx.loadBill).toHaveBeenCalledWith(BILL_ID);
  });

  it('C1: a permission-denied bill shows the same unavailable screen', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'denied' });
    render(tree());
    expect(await screen.findByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
  });

  it('C2: an offline load shows the offline screen with Try again first', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    render(tree());

    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Try again');
    expect(buttons[1]).toHaveAccessibleName(/go back/i);
  });

  it('C2: any other error also shows the offline (retryable) screen', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'error' });
    render(tree());
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
  });

  it('C3: Try again re-runs the load, shows progress, then renders the bill', async () => {
    ctx.loadBill.mockResolvedValueOnce({ status: 'offline' });
    render(tree());
    const retry = await screen.findByRole('button', { name: 'Try again' });

    const second = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValueOnce(second.promise);
    fireEvent.click(retry);

    expect(ctx.loadBill).toHaveBeenCalledTimes(2);
    expect(ctx.loadBill).toHaveBeenLastCalledWith(BILL_ID);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled();

    await act(async () => second.resolve({ status: 'loaded', bill }));

    expect(screen.getByTestId('wizard')).toHaveTextContent('Taco Tuesday');
    expect(screen.queryByRole('heading', { name: "You're offline" })).not.toBeInTheDocument();
  });

  it('C3: a retry that fails again shows the latest failure and can be retried', async () => {
    ctx.loadBill.mockResolvedValueOnce({ status: 'offline' });
    render(tree());
    const retry = await screen.findByRole('button', { name: 'Try again' });

    ctx.loadBill.mockResolvedValueOnce({ status: 'not-found' });
    fireEvent.click(retry);

    expect(ctx.loadBill).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled();
  });

  it('C4: Go back calls useReturnTo().goBack and shows its label', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    render(tree());
    const back = await screen.findByRole('button', { name: 'Go back to Bills' });

    fireEvent.click(back);

    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('C5: a failing fetch never replaces a bill already rendered from the snapshot', async () => {
    ctx.activeSession = bill;
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    render(tree());

    expect(await screen.findByTestId('wizard')).toHaveTextContent('Taco Tuesday');
    // let the rejected fetch settle
    await act(async () => {});
    expect(ctx.loadBill).toHaveBeenCalledWith(BILL_ID);
    expect(screen.getByTestId('wizard')).toHaveTextContent('Taco Tuesday');
    expect(screen.queryByRole('heading', { name: "You're offline" })).not.toBeInTheDocument();
  });

  it('C6: a snapshot that arrives after the fetch failed replaces the error with the bill', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    const { rerender } = render(tree());
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();

    ctx.activeSession = bill;
    rerender(tree());

    expect(await screen.findByTestId('wizard')).toHaveTextContent('Taco Tuesday');
    expect(screen.queryByRole('heading', { name: "You're offline" })).not.toBeInTheDocument();
  });

  it('C10: a successful load renders the bill (not the latest session)', async () => {
    ctx.activeSession = { ...bill, id: 'other-bill', title: 'Other' } as Bill;
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill });
    render(tree());

    expect(await screen.findByTestId('wizard')).toHaveTextContent('Taco Tuesday');
    expect(ctx.resumeSession).not.toHaveBeenCalled();
  });
});
