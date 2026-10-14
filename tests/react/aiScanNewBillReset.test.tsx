/**
 * Money bug: a new bill kept the previous bill's items.
 *
 * Repro (iOS): scan a receipt (draft JIT-creates /bill/X), then open
 * /bill/new. The Manual tab still listed X's items; scanning again produced a
 * bill whose total was old items + new ($197.60).
 *
 * Mechanism: `bill/:billId` is ONE route element, so /bill/X -> /bill/new
 * re-renders the same AIScanView and the same BillWizard instance. BillWizard
 * seeds `billData` (and upload preview, step, etc.) from props in useState —
 * i.e. only at mount — so AIScanView clearing its own state never reaches it.
 *
 * The stub below reproduces exactly that contract: it copies
 * `initialBillData` into state at mount and ignores later prop changes. The
 * test therefore pins AIScanView's responsibility: remount the wizard when the
 * bill identity changes — but NOT when a draft is JIT-created and the URL
 * swaps /bill/new -> /bill/<newId>, which would wipe an in-progress scan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import type { Bill, BillData } from '@/types';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  deleteField: vi.fn(),
}));
// Stable identities, like the real hooks: AIScanView effects depend on them.
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
const profileValue = vi.hoisted(() => ({ profile: { venmoId: 'owner-venmo' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => profileValue }));
vi.mock('@/hooks/useSessionTimeout', () => ({ useSessionTimeout: () => {} }));
vi.mock('@/hooks/useReturnTo', () => ({ useReturnTo: () => ({ goBack: vi.fn() }) }));
vi.mock('@/components/layout/HeroSection', () => ({ HeroSection: () => null }));
vi.mock('@/components/share/ShareLinkDialog', () => ({ ShareLinkDialog: () => null }));
vi.mock('@/services/billService', () => ({ billService: {} }));
vi.mock('@/services/userService', () => ({ userService: {} }));

let mounts = 0;
vi.mock('@/components/bill-wizard/BillWizard', () => ({
  BILL_WIZARD_REVIEW_STEP: 3,
  BillWizard: ({ initialBillData }: { initialBillData: BillData | null }) => {
    // Mount-only seeding, same as the real BillWizard's useState(initialBillData).
    const [billData] = useState(() => {
      mounts += 1;
      return initialBillData;
    });
    const names = billData?.items.map((i) => i.name).join(',') || 'none';
    return <div data-testid="wizard-items">{names}</div>;
  },
}));

const oldBill = {
  id: 'bill-old',
  billData: {
    items: [{ id: 'i1', name: 'Old Pasta', price: 20 }],
    subtotal: 20,
    tax: 0,
    tip: 0,
    total: 20,
  },
  people: [],
  itemAssignments: {},
} as unknown as Bill;

const ctx = {
  activeSession: oldBill as Bill | null,
  isLoadingSessions: false,
  isUploading: false,
  uploadReceiptImage: vi.fn(),
  resumeSession: vi.fn(async (id: string) =>
    id === oldBill.id ? oldBill : { ...oldBill, id, billData: null },
  ),
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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavGrabber />
      <Routes>
        <Route path="/bill/:billId" element={<AIScanView />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AIScanView — new bill must not inherit the previous bill', () => {
  beforeEach(() => {
    mounts = 0;
    ctx.activeSession = oldBill;
  });

  it('opening /bill/new from an existing bill shows no items', async () => {
    renderAt('/bill/bill-old');
    expect(await screen.findByText('Old Pasta')).toBeInTheDocument();

    await act(async () => nav('/bill/new'));

    expect(screen.getByTestId('wizard-items')).toHaveTextContent('none');
  });

  it('JIT-creating a draft (/bill/new -> /bill/<id>) keeps the same wizard', async () => {
    ctx.activeSession = null;
    renderAt('/bill/new');
    expect(await screen.findByTestId('wizard-items')).toHaveTextContent('none');
    const mountsBefore = mounts;

    await act(async () =>
      nav('/bill/bill-jit', { replace: true, state: { draftCreated: true } }),
    );

    // A remount here would discard an in-progress scan / upload preview.
    expect(mounts).toBe(mountsBefore);
  });
  it('a pushed navigation from a draft to an existing bill shows that bill', async () => {
    // Deep links (appUrlOpen) push; only the JIT swap uses replace.
    ctx.activeSession = null;
    renderAt('/bill/new');
    expect(await screen.findByTestId('wizard-items')).toHaveTextContent('none');

    ctx.activeSession = oldBill;
    await act(async () => nav('/bill/bill-old'));

    expect(await screen.findByText('Old Pasta')).toBeInTheDocument();
  });
  it('a replace that is NOT a draft creation (goBack) still remounts', async () => {
    // useReturnTo.goBack() navigates with replace; it must not be mistaken for
    // the JIT swap, or the draft's empty wizard would sit on an existing bill.
    ctx.activeSession = null;
    renderAt('/bill/new');
    expect(await screen.findByTestId('wizard-items')).toHaveTextContent('none');

    ctx.activeSession = oldBill;
    await act(async () => nav('/bill/bill-old', { replace: true }));

    expect(await screen.findByText('Old Pasta')).toBeInTheDocument();
  });
});
