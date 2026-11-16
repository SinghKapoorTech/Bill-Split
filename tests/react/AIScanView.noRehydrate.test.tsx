/**
 * /bill/:billId — once the page has rendered a bill (from the live snapshot or
 * the one-off fetch), a later loadBill() result must not re-apply the static
 * form state (title, step, billData, ...). Before: the fetch's .then hydrated
 * unconditionally, so an older bill shown from savedSessions lost the title the
 * user typed the moment the server copy arrived.
 *
 * Every test asserts a specific EDITED / snapshot value survived, never absence.
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
// Stable identities, like the real hooks: AIScanView effects depend on them.
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
vi.mock('@/components/bill-wizard/BillWizard', () => ({
  BILL_WIZARD_REVIEW_STEP: 3,
  BillWizard: (p: {
    initialStep?: number;
    initialSplitEvenly: boolean;
    initialPeople: { name: string }[];
  }) => (
    <div
      data-testid="wizard"
      data-step={String(p.initialStep)}
      data-split-evenly={String(p.initialSplitEvenly)}
    >
      {p.initialPeople.map((x) => x.name).join(',')}
    </div>
  ),
}));

const OLDER_ID = 'bill-older';
const latest = {
  id: 'bill-latest',
  title: 'Latest dinner',
  billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
  people: [],
  itemAssignments: {},
} as unknown as Bill;
// The live listener's copy of the older bill …
const older = {
  id: OLDER_ID,
  title: 'Older lunch',
  currentStep: 1,
  splitEvenly: false,
  billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
  people: [{ id: 'p-sam', name: 'Sam' }],
  itemAssignments: {},
} as unknown as Bill;
// … and the server copy loadBill resolves with: different title/step/split.
const server = {
  ...older,
  title: 'Server title',
  currentStep: 3,
  splitEvenly: true,
} as unknown as Bill;

const ctx = {
  activeSession: null as Bill | null,
  savedSessions: [] as Bill[],
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

let nav: ReturnType<typeof useNavigate>;
function NavGrabber() {
  nav = useNavigate();
  return null;
}

/** Starts on a draft; the JIT swap is driven with explicit paths via `nav`. */
function draftTree() {
  return (
    <MemoryRouter initialEntries={['/bill/new']}>
      <NavGrabber />
      <Routes>
        <Route path="/bill/:billId" element={<AIScanView />} />
      </Routes>
    </MemoryRouter>
  );
}

function tree() {
  return (
    <MemoryRouter initialEntries={[`/bill/${OLDER_ID}`]}>
      <Routes>
        <Route path="/bill/:billId" element={<AIScanView />} />
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
const wizard = () => screen.getByTestId('wizard');

describe('AIScanView — a rendered bill is never re-hydrated by a later fetch', () => {
  beforeEach(() => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockReset();
  });

  it('C1: an edit to an older (savedSessions) bill survives the fetch resolving with the server copy', async () => {
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    render(tree());
    expect(titleInput()).toHaveValue('Older lunch');
    expect(wizard()).toHaveAttribute('data-step', '1');

    fireEvent.change(titleInput(), { target: { value: 'My edit' } });
    await act(async () => fetch.resolve({ status: 'loaded', bill: server }));

    expect(ctx.loadBill).toHaveBeenCalledWith(OLDER_ID);
    expect(titleInput()).toHaveValue('My edit');
    expect(wizard()).toHaveAttribute('data-step', '1');
    expect(wizard()).toHaveAttribute('data-split-evenly', 'false');
  });

  it('C1: the same holds for the latest bill (activeSession)', async () => {
    ctx.activeSession = older;
    ctx.savedSessions = [];
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    render(tree());

    fireEvent.change(titleInput(), { target: { value: 'My edit' } });
    await act(async () => fetch.resolve({ status: 'loaded', bill: server }));

    expect(titleInput()).toHaveValue('My edit');
    expect(wizard()).toHaveAttribute('data-step', '1');
  });

  it('C1: a newer listener snapshot of the same bill keeps the edit too', async () => {
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    const { rerender } = render(tree());
    fireEvent.change(titleInput(), { target: { value: 'My edit' } });

    ctx.savedSessions = [{ ...older, title: 'Echo title', currentStep: 2 } as Bill];
    rerender(tree());
    await act(async () => fetch.resolve({ status: 'loaded', bill: server }));

    expect(titleInput()).toHaveValue('My edit');
    expect(wizard()).toHaveAttribute('data-step', '1');
  });

  it('C7: live people still sync from the snapshot after the fetch was skipped', async () => {
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    const { rerender } = render(tree());
    await act(async () => fetch.resolve({ status: 'loaded', bill: server }));

    ctx.savedSessions = [
      { ...older, people: [{ id: 'p-sam', name: 'Sam' }, { id: 'p-ana', name: 'Ana' }] } as Bill,
    ];
    rerender(tree());

    expect(wizard()).toHaveTextContent('Sam,Ana');
  });

  it('C7: a bill not in the listener still hydrates from the fetch', async () => {
    ctx.savedSessions = [];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: server });
    render(tree());

    expect(await screen.findByTestId('wizard')).toHaveAttribute('data-step', '3');
    expect(titleInput()).toHaveValue('Server title');
    expect(wizard()).toHaveAttribute('data-split-evenly', 'true');
  });
});

describe('AIScanView — a JIT draft swap keeps the edits on screen', () => {
  it('the first snapshot and fetch of the new bill do not re-apply over the draft', async () => {
    ctx.activeSession = null;
    ctx.savedSessions = [];
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    // The server copy of the just-created bill (written before the last edit).
    const created = { ...server, id: 'bill-jit' } as Bill;
    const view = render(draftTree());
    fireEvent.change(titleInput(), { target: { value: 'My edit' } });

    await act(async () => nav('/bill/bill-jit', { replace: true, state: { draftCreated: true } }));
    ctx.activeSession = created;
    view.rerender(draftTree());
    await act(async () => fetch.resolve({ status: 'loaded', bill: created }));

    expect(ctx.loadBill).toHaveBeenCalledWith('bill-jit');
    expect(titleInput()).toHaveValue('My edit');
    expect(screen.getByTestId('wizard')).toHaveAttribute('data-step', '0');
    // The bill's data still lands once (it drives Share / hasBillData).
    expect(titleInput()).toHaveAttribute('data-has-bill-data', 'true');
    // Live people sync from the snapshot continues.
    expect(screen.getByTestId('wizard')).toHaveTextContent('Sam');
  });

  it('fetch first: the fetch of the new bill does not re-apply over the draft either', async () => {
    ctx.activeSession = null;
    ctx.savedSessions = [];
    const created = { ...server, id: 'bill-jit' } as Bill;
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: created });
    render(draftTree());
    fireEvent.change(titleInput(), { target: { value: 'My edit' } });

    await act(async () => nav('/bill/bill-jit', { replace: true, state: { draftCreated: true } }));

    expect(ctx.loadBill).toHaveBeenCalledWith('bill-jit');
    expect(titleInput()).toHaveValue('My edit');
    expect(titleInput()).toHaveAttribute('data-has-bill-data', 'true');
    expect(screen.getByTestId('wizard')).toHaveAttribute('data-step', '0');
  });
});
