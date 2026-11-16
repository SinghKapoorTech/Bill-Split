/**
 * /airbnb/:billId — the bill the page renders and when it is (re)applied.
 *
 * - C2: once rendered (snapshot OR fetch, either order), the other source must
 *   not re-apply title/step. Before: the fetch hydrated unconditionally and
 *   never marked the bill applied, so a later snapshot re-applied too.
 * - C3: an older bill comes from savedSessions, so it renders offline. Before:
 *   only activeSession hydrated, so an offline fetch showed the error card.
 *
 * Assertions pin a specific edited / snapshot value, never mere absence.
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
const returnTo = vi.hoisted(() => ({ goBack: vi.fn(), label: 'Bills', returnTo: '/dashboard' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => profileValue }));
vi.mock('@/hooks/useSessionTimeout', () => ({ useSessionTimeout: () => {} }));
vi.mock('@/hooks/useReturnTo', () => ({ useReturnTo: () => returnTo }));
vi.mock('@/components/share/ShareLinkDialog', () => ({ ShareLinkDialog: () => null }));
vi.mock('@/services/billService', () => ({ billService: {} }));
vi.mock('@/services/userService', () => ({ userService: {} }));
// The page owns the title: the hero input is wired to it like the real one.
vi.mock('@/components/layout/HeroSection', () => ({
  HeroSection: (p: { title: string; onTitleChange: (t: string) => void; hasBillData: boolean }) => (
    <input
      aria-label="Bill title"
      data-has-bill-data={String(p.hasBillData)}
      value={p.title}
      onChange={(e) => p.onTitleChange(e.target.value)}
    />
  ),
}));
vi.mock('@/components/airbnb-wizard/AirbnbWizard', () => ({
  AirbnbWizard: (p: {
    activeSession: Bill | null;
    initialStep?: number;
    initialPeople: { name: string }[];
    initialAirbnbData?: { nights?: number };
  }) => (
    <div
      data-testid="airbnb-wizard"
      data-session-id={p.activeSession?.id ?? 'none'}
      data-step={String(p.initialStep)}
      data-nights={String(p.initialAirbnbData?.nights)}
    >
      {p.initialPeople.map((x) => x.name).join(',')}
    </div>
  ),
}));

const CABIN_ID = 'bill-cabin';
const latest = {
  id: 'bill-latest',
  title: 'Some Other Bill',
  billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
  people: [],
  itemAssignments: {},
  isAirbnb: true,
} as unknown as Bill;
// The listener's copy of the cabin bill …
const cabin = {
  id: CABIN_ID,
  title: 'Lake Tahoe Cabin',
  currentStep: 1,
  airbnbData: { nights: 2 },
  billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
  people: [{ id: 'p-sam', name: 'Sam' }],
  itemAssignments: {},
  isAirbnb: true,
} as unknown as Bill;
// … and a different copy (server fetch, or a later snapshot).
const other = {
  ...cabin,
  title: 'Server title',
  currentStep: 3,
  airbnbData: { nights: 5 },
  people: [{ id: 'p-sam', name: 'Sam' }, { id: 'p-ana', name: 'Ana' }],
} as unknown as Bill;

const ctx = {
  activeSession: null as Bill | null,
  savedSessions: [] as Bill[],
  isLoadingSessions: false,
  loadBill: vi.fn<(id: string) => Promise<BillLoadResult>>(),
  resumeSession: vi.fn(),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
};
vi.mock('@/contexts/BillSessionContext', () => ({ useBillContext: () => ctx }));

import AirbnbView from '@/pages/AirbnbView';

let nav: ReturnType<typeof useNavigate>;
function NavGrabber() {
  nav = useNavigate();
  return null;
}

/** Starts on a draft; the JIT swap is driven with explicit paths via `nav`. */
function draftTree() {
  return (
    <MemoryRouter initialEntries={['/airbnb/new']}>
      <NavGrabber />
      <Routes>
        <Route path="/airbnb/:billId" element={<AirbnbView />} />
      </Routes>
    </MemoryRouter>
  );
}

function tree() {
  return (
    <MemoryRouter initialEntries={[`/airbnb/${CABIN_ID}`]}>
      <Routes>
        <Route path="/airbnb/:billId" element={<AirbnbView />} />
      </Routes>
    </MemoryRouter>
  );
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const titleInput = () => screen.getByRole('textbox', { name: 'Bill title' });
const wizard = () => screen.getByTestId('airbnb-wizard');
const flush = () => act(async () => {});

beforeEach(() => {
  ctx.activeSession = null;
  ctx.savedSessions = [];
  ctx.isLoadingSessions = false;
  ctx.loadBill.mockReset();
});

describe('AirbnbView — a rendered bill is never re-hydrated (C2)', () => {
  it('C2: snapshot first — an edit survives the fetch resolving with the server copy', async () => {
    ctx.activeSession = cabin;
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    render(tree());
    expect(titleInput()).toHaveValue('Lake Tahoe Cabin');

    fireEvent.change(titleInput(), { target: { value: 'My edit' } });
    await act(async () => fetch.resolve({ status: 'loaded', bill: other }));

    expect(ctx.loadBill).toHaveBeenCalledWith(CABIN_ID);
    expect(titleInput()).toHaveValue('My edit');
    expect(wizard()).toHaveAttribute('data-step', '1');
    expect(wizard()).toHaveAttribute('data-nights', '2');
  });

  it('C2: snapshot first from savedSessions (older bill) — the edit survives too', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [cabin];
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    render(tree());
    expect(titleInput()).toHaveValue('Lake Tahoe Cabin');

    fireEvent.change(titleInput(), { target: { value: 'My edit' } });
    await act(async () => fetch.resolve({ status: 'loaded', bill: other }));

    expect(titleInput()).toHaveValue('My edit');
    expect(wizard()).toHaveAttribute('data-step', '1');
  });

  it('C2: fetch first — a later snapshot keeps the edit and step, but syncs people', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: cabin });
    const { rerender } = render(tree());
    await flush();
    expect(titleInput()).toHaveValue('Lake Tahoe Cabin');
    expect(wizard()).toHaveTextContent('Sam');

    fireEvent.change(titleInput(), { target: { value: 'My edit' } });
    ctx.activeSession = other;
    rerender(tree());
    await flush();

    expect(titleInput()).toHaveValue('My edit');
    expect(wizard()).toHaveAttribute('data-step', '1');
    expect(wizard()).toHaveAttribute('data-nights', '2');
    // Live people sync from the snapshot continues (C7).
    expect(wizard()).toHaveTextContent('Sam,Ana');
  });

  it('C7: a bill not in the listener still hydrates from the fetch', async () => {
    ctx.activeSession = latest;
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: other });
    render(tree());

    expect(await screen.findByTestId('airbnb-wizard')).toHaveAttribute('data-step', '3');
    expect(titleInput()).toHaveValue('Server title');
  });
});

describe('AirbnbView — an older cached bill renders offline (C3)', () => {
  it('C3: an older bill in savedSessions renders when loadBill is offline, no error card', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [cabin];
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    render(tree());
    await flush();

    expect(titleInput()).toHaveValue('Lake Tahoe Cabin');
    expect(wizard()).toHaveAttribute('data-session-id', CABIN_ID);
    expect(screen.queryByRole('heading', { name: "You're offline" })).toBeNull();
  });

  it('C3: savedSessions arriving after the offline failure replaces the error with the bill', async () => {
    ctx.activeSession = latest;
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    const { rerender } = render(tree());
    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();

    ctx.savedSessions = [cabin];
    rerender(tree());
    await flush();

    expect(titleInput()).toHaveValue('Lake Tahoe Cabin');
    expect(screen.queryByRole('heading', { name: "You're offline" })).toBeNull();
  });

  it('C7: with nothing cached, an offline load still shows the error card', async () => {
    ctx.activeSession = latest;
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    render(tree());

    expect(await screen.findByRole('heading', { name: "You're offline" })).toBeInTheDocument();
  });
});

describe('AirbnbView — a JIT draft swap keeps the edits on screen', () => {
  it('the first snapshot and fetch of the new bill do not re-apply over the draft', async () => {
    ctx.activeSession = null;
    ctx.savedSessions = [];
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    // The server copy of the just-created bill (written before the last edit).
    const created = { ...other, id: 'bill-jit' } as Bill;
    const view = render(draftTree());
    fireEvent.change(titleInput(), { target: { value: 'My edit' } });

    await act(async () => nav('/airbnb/bill-jit', { replace: true, state: { draftCreated: true } }));
    ctx.activeSession = created;
    view.rerender(draftTree());
    await act(async () => fetch.resolve({ status: 'loaded', bill: created }));

    expect(ctx.loadBill).toHaveBeenCalledWith('bill-jit');
    expect(titleInput()).toHaveValue('My edit');
    expect(screen.getByTestId('airbnb-wizard')).toHaveAttribute('data-step', '0');
    // The bill's data still lands once (it drives Share / hasBillData).
    expect(titleInput()).toHaveAttribute('data-has-bill-data', 'true');
    // AirbnbWizard copies initialAirbnbData into its state on every change,
    // so the draft's own dates/cost must not be replaced by the server copy.
    expect(wizard()).toHaveAttribute('data-nights', 'undefined');
    // Live people sync from the snapshot continues.
    expect(screen.getByTestId('airbnb-wizard')).toHaveTextContent('Sam');
  });

  it('fetch first: the fetch of the new bill does not re-apply over the draft either', async () => {
    ctx.activeSession = null;
    ctx.savedSessions = [];
    const created = { ...other, id: 'bill-jit' } as Bill;
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: created });
    render(draftTree());
    fireEvent.change(titleInput(), { target: { value: 'My edit' } });

    await act(async () => nav('/airbnb/bill-jit', { replace: true, state: { draftCreated: true } }));

    expect(ctx.loadBill).toHaveBeenCalledWith('bill-jit');
    expect(titleInput()).toHaveValue('My edit');
    expect(titleInput()).toHaveAttribute('data-has-bill-data', 'true');
    // AirbnbWizard copies initialAirbnbData into its state on every change,
    // so the draft's own dates/cost must not be replaced by the server copy.
    expect(wizard()).toHaveAttribute('data-nights', 'undefined');
    expect(screen.getByTestId('airbnb-wizard')).toHaveAttribute('data-step', '0');
  });
});
