/**
 * /airbnb/:billId URL load: a failed fetch must show the bill-load error state
 * (not an endless spinner), but never replace a bill that is already showing —
 * offline getDoc rejects while onSnapshot keeps serving the cached bill.
 *
 * The context mock's resumeSession is derived from loadBill (null on any
 * failure), so the pre-change page — which called resumeSession(id, true) —
 * sees the same backend as the new one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import type { Bill } from '@/types';
import type { BillLoadResult } from '@/utils/billLoadResult';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  deleteField: vi.fn(),
}));
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
const profileValue = vi.hoisted(() => ({ profile: { venmoId: 'owner-venmo' } }));
const goBack = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => profileValue }));
vi.mock('@/hooks/useSessionTimeout', () => ({ useSessionTimeout: () => {} }));
vi.mock('@/hooks/useReturnTo', () => ({
  useReturnTo: () => ({ goBack, label: 'Bills', returnTo: '/dashboard' }),
}));
vi.mock('@/components/layout/HeroSection', () => ({
  HeroSection: ({ onShare }: { onShare: () => void }) => <button onClick={onShare}>hero-share</button>,
}));
vi.mock('@/components/share/ShareLinkDialog', () => ({
  ShareLinkDialog: ({ billId, shareCode }: { billId: string; shareCode?: string }) => (
    <div data-testid="share-dialog" data-bill-id={billId}>{shareCode ?? 'no-code'}</div>
  ),
}));
const billServiceMock = vi.hoisted(() => ({ generateShareCode: vi.fn(async () => 'CODE12') }));
vi.mock('@/services/billService', () => ({ billService: billServiceMock }));
vi.mock('@/services/userService', () => ({ userService: {} }));
vi.mock('@/components/airbnb-wizard/AirbnbWizard', () => ({
  AirbnbWizard: ({ title, activeSession }: { title: string; activeSession: Bill | null }) => (
    <div data-testid="airbnb-wizard" data-session-id={activeSession?.id ?? 'none'}>{title || 'untitled'}</div>
  ),
}));

const cabin = {
  id: 'bill-cabin',
  title: 'Lake Tahoe Cabin',
  billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
  people: [],
  itemAssignments: {},
  isAirbnb: true,
} as unknown as Bill;
const otherBill = { ...cabin, id: 'bill-latest', title: 'Some Other Bill' } as unknown as Bill;

type Ctx = {
  activeSession: Bill | null;
  savedSessions: Bill[];
  isLoadingSessions: boolean;
  loadBill: ReturnType<typeof vi.fn<(id: string) => Promise<BillLoadResult>>>;
  resumeSession: ReturnType<typeof vi.fn>;
  saveSession: ReturnType<typeof vi.fn>;
  deleteSession: ReturnType<typeof vi.fn>;
};
const ctx: Ctx = {
  activeSession: null,
  savedSessions: [],
  isLoadingSessions: false,
  loadBill: vi.fn(),
  resumeSession: vi.fn(),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
};
vi.mock('@/contexts/BillSessionContext', () => ({ useBillContext: () => ctx }));

import AirbnbView from '@/pages/AirbnbView';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

let nav: ReturnType<typeof useNavigate>;
function NavGrabber() {
  nav = useNavigate();
  return null;
}

function tree(path: string) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <NavGrabber />
      <Routes>
        <Route path="/airbnb/:billId" element={<AirbnbView />} />
      </Routes>
    </MemoryRouter>
  );
}
const renderAt = (path: string) => render(tree(path));

const spinner = () => document.querySelector('.loading-spinner');
const retryButton = () => screen.getByRole('button', { name: /try again/i });
const backButton = () => screen.getByRole('button', { name: /go back/i });

describe('AirbnbView — bill load failure state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ctx.activeSession = null;
    ctx.savedSessions = [];
    ctx.isLoadingSessions = false;
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: cabin });
    ctx.resumeSession.mockImplementation(async (id: string) => {
      const r = await ctx.loadBill(id);
      return r.status === 'loaded' ? r.bill : null;
    });
  });

  it('C1: a missing bill shows "Couldn\'t open this bill" with Go back + Try again and no spinner', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    renderAt('/airbnb/missing-id');

    expect(await screen.findByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
    expect(backButton()).toBeInTheDocument();
    expect(retryButton()).toBeInTheDocument();
    expect(spinner()).toBeNull();
    expect(ctx.loadBill).toHaveBeenCalledWith('missing-id');
  });

  it('C1: a permission-denied bill shows the unavailable variant', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'denied' });
    renderAt('/airbnb/denied-id');

    expect(await screen.findByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
    expect(spinner()).toBeNull();
  });

  it('C2: an offline failure shows "You\'re offline" with Try again first', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    renderAt('/airbnb/bill-cabin');

    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons[0]).toMatch(/try again/i);
    expect(spinner()).toBeNull();
  });

  it('C2: any other error also shows the offline variant', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'error' });
    renderAt('/airbnb/bill-cabin');

    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
  });

  it('C2: a rejected load (unavailable) is classified offline instead of hanging', async () => {
    ctx.loadBill.mockRejectedValue({ code: 'unavailable' });
    ctx.resumeSession.mockResolvedValue(null);
    renderAt('/airbnb/bill-cabin');

    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
  });

  it('C3: Try again shows the spinner, re-runs the load and renders the bill when it succeeds', async () => {
    ctx.loadBill.mockResolvedValueOnce({ status: 'offline' });
    renderAt('/airbnb/bill-cabin');
    await screen.findByRole('heading', { name: "You're offline" });

    const retry = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValueOnce(retry.promise);
    fireEvent.click(retryButton());

    expect(spinner()).not.toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(ctx.loadBill).toHaveBeenCalledTimes(2);

    await act(async () => retry.resolve({ status: 'loaded', bill: cabin }));
    expect(screen.getByTestId('airbnb-wizard')).toHaveTextContent('Lake Tahoe Cabin');
  });

  it('C3: a retry that fails again shows the error again', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    renderAt('/airbnb/bill-cabin');
    await screen.findByRole('heading', { name: "You're offline" });

    ctx.loadBill.mockResolvedValueOnce({ status: 'not-found' });
    fireEvent.click(retryButton());

    expect(await screen.findByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
    expect(ctx.loadBill).toHaveBeenCalledTimes(2);
  });

  it('C4: Go back calls useReturnTo().goBack and labels the destination', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    renderAt('/airbnb/missing-id');
    await screen.findByRole('heading', { name: "Couldn't open this bill" });

    expect(backButton()).toHaveTextContent('Back to Bills');
    fireEvent.click(backButton());
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  it('C5: a fetch failure never replaces the bill already shown from the snapshot', async () => {
    ctx.activeSession = cabin;
    const load = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(load.promise);
    ctx.resumeSession.mockReturnValue(load.promise.then(() => null));
    renderAt('/airbnb/bill-cabin');

    expect(screen.getByTestId('airbnb-wizard')).toHaveTextContent('Lake Tahoe Cabin');
    await act(async () => load.resolve({ status: 'offline' }));

    expect(screen.getByTestId('airbnb-wizard')).toHaveTextContent('Lake Tahoe Cabin');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('heading', { name: "You're offline" })).toBeNull();
  });

  it('C6: a snapshot for this bill arriving after the fetch failed replaces the error with the bill', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    const view = renderAt('/airbnb/bill-cabin');
    await screen.findByRole('heading', { name: "You're offline" });

    ctx.activeSession = cabin;
    view.rerender(tree('/airbnb/bill-cabin'));

    expect(await screen.findByTestId('airbnb-wizard')).toHaveTextContent('Lake Tahoe Cabin');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('C8: a successful load of a non-latest bill renders it (no endless spinner)', async () => {
    ctx.activeSession = otherBill;
    renderAt('/airbnb/bill-cabin');

    expect(await screen.findByTestId('airbnb-wizard')).toHaveTextContent('Lake Tahoe Cabin');
    expect(spinner()).toBeNull();
  });

  it('C8: a non-latest bill is the wizard session, so its saves are not dropped', async () => {
    // useBillSession skips every save when activeSession.id !== billId.
    ctx.activeSession = otherBill;
    renderAt('/airbnb/bill-cabin');

    const wizard = await screen.findByTestId('airbnb-wizard');
    expect(wizard).toHaveAttribute('data-session-id', 'bill-cabin');
  });

  it('C8: Share on a non-latest bill shares that bill, not the latest one', async () => {
    ctx.activeSession = otherBill;
    renderAt('/airbnb/bill-cabin');
    await screen.findByTestId('airbnb-wizard');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'hero-share' })));
    expect(billServiceMock.generateShareCode).toHaveBeenCalledWith('bill-cabin', 'owner-uid');
  });

  it('C8: a non-latest bill uses its live list entry (fresh share code), not the one-off fetch', async () => {
    // The fetched copy has no share code; the live listener entry does.
    ctx.activeSession = otherBill;
    ctx.savedSessions = [{ ...cabin, shareCode: 'LIVE01' } as unknown as Bill];
    renderAt('/airbnb/bill-cabin');

    await screen.findByTestId('airbnb-wizard');
    expect(screen.getByTestId('share-dialog')).toHaveAttribute('data-bill-id', 'bill-cabin');
    expect(screen.getByTestId('share-dialog')).toHaveTextContent('LIVE01');
  });

  it('C10: the latest bill still renders from the snapshot', async () => {
    ctx.activeSession = cabin;
    renderAt('/airbnb/bill-cabin');

    expect(await screen.findByTestId('airbnb-wizard')).toHaveTextContent('Lake Tahoe Cabin');
  });

  it('C10: /airbnb/new renders the empty wizard without loading anything', async () => {
    renderAt('/airbnb/new');

    expect(await screen.findByTestId('airbnb-wizard')).toHaveTextContent('untitled');
    expect(ctx.loadBill).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('C10: a JIT draft swap (/airbnb/new -> /airbnb/<id>) keeps the wizard even if the fetch fails', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    renderAt('/airbnb/new');
    expect(await screen.findByTestId('airbnb-wizard')).toHaveTextContent('untitled');

    await act(async () => nav('/airbnb/bill-jit', { replace: true, state: { draftCreated: true } }));

    expect(screen.getByTestId('airbnb-wizard')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
