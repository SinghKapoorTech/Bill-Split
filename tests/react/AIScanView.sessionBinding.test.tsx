/**
 * /bill/:billId must bind the wizard, Share and the share dialog to the URL
 * bill. activeSession is only the user's LATEST bill (useBills bills[0]); for an
 * older bill, passing it to BillWizard makes useBillSession drop every save
 * (it returns when billId !== activeSession.id) and Share targeted the other
 * bill. The page session is: activeSession if it IS the URL bill, else the
 * live savedSessions entry, else the bill loadBill fetched.
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
  deleteField: vi.fn(() => 'DELETE'),
}));
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
const profileValue = vi.hoisted(() => ({ profile: { venmoId: 'owner-venmo' } }));
const returnTo = vi.hoisted(() => ({ goBack: vi.fn(), label: 'Bills', returnTo: '/dashboard' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => profileValue }));
vi.mock('@/hooks/useSessionTimeout', () => ({ useSessionTimeout: () => {} }));
vi.mock('@/hooks/useReturnTo', () => ({ useReturnTo: () => returnTo }));
vi.mock('@/services/userService', () => ({ userService: {} }));

const billService = vi.hoisted(() => ({
  generateShareCode: vi.fn(),
  updateBill: vi.fn(),
  getBill: vi.fn(),
}));
vi.mock('@/services/billService', () => ({ billService }));

// Stubs expose exactly what the page hands them.
vi.mock('@/components/layout/HeroSection', () => ({
  HeroSection: ({ onShare }: { onShare: () => void }) => (
    <button onClick={onShare}>Share</button>
  ),
}));
vi.mock('@/components/share/ShareLinkDialog', () => ({
  ShareLinkDialog: ({
    billId,
    shareCode,
    onRegenerate,
  }: {
    billId: string;
    shareCode?: string;
    onRegenerate: () => void;
  }) => (
    <div data-testid="share-dialog" data-bill-id={billId} data-share-code={shareCode ?? ''}>
      <button onClick={onRegenerate}>Regenerate</button>
    </div>
  ),
}));
type WizardProps = {
  activeSession: Bill | null;
  billId?: string;
  initialPeople: { id: string }[];
  initialItemAssignments: Record<string, string[]>;
  removeReceiptImage: () => Promise<void>;
};
const wizardProps = vi.hoisted(() => ({ last: null as WizardProps | null }));
vi.mock('@/components/bill-wizard/BillWizard', () => ({
  BILL_WIZARD_REVIEW_STEP: 3,
  BillWizard: (props: WizardProps) => {
    wizardProps.last = props;
    return (
      <div data-testid="wizard" data-session-id={props.activeSession?.id ?? 'none'}>
        <button onClick={() => props.removeReceiptImage()}>Remove receipt</button>
      </div>
    );
  },
}));

const LATEST_ID = 'bill-latest';
const OLDER_ID = 'bill-older';
const mkBill = (id: string, title: string, shareCode: string) =>
  ({
    id,
    title,
    shareCode,
    billData: { items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
    people: [],
    itemAssignments: {},
  }) as unknown as Bill;

const latest = mkBill(LATEST_ID, 'Latest dinner', 'LATEST');
const older = mkBill(OLDER_ID, 'Older lunch', 'OLDER1');

const ctx = {
  activeSession: null as Bill | null,
  savedSessions: [] as Bill[],
  isLoadingSessions: false,
  isUploading: false,
  uploadReceiptImage: vi.fn(),
  resumeSession: vi.fn(),
  loadBill: vi.fn<(id: string) => Promise<BillLoadResult>>(),
  saveSession: vi.fn(),
  removeReceiptImage: vi.fn<(target?: Bill | null) => Promise<void>>(),
  deleteSession: vi.fn(),
};
vi.mock('@/contexts/BillSessionContext', () => ({ useBillContext: () => ctx }));

import AIScanView from '@/pages/AIScanView';

function tree(billId: string) {
  return (
    <MemoryRouter initialEntries={[`/bill/${billId}`]}>
      <Routes>
        <Route path="/bill/:billId" element={<AIScanView />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AIScanView — binds to the URL bill, not the latest session', () => {
  beforeEach(() => {
    ctx.activeSession = null;
    ctx.savedSessions = [];
    ctx.loadBill.mockReset();
    billService.generateShareCode.mockReset().mockResolvedValue('CODE');
    billService.updateBill.mockReset().mockResolvedValue(undefined);
    billService.getBill.mockReset();
    ctx.removeReceiptImage.mockReset().mockResolvedValue(undefined);
    wizardProps.last = null;
  });

  it('C12: an older bill passes ITS session (live list entry) to the wizard, so saves are not dropped', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    render(tree(OLDER_ID));

    const wizard = await screen.findByTestId('wizard');
    expect(wizard).toHaveAttribute('data-session-id', OLDER_ID);
    expect(wizardProps.last?.billId).toBe(OLDER_ID);
    expect(wizardProps.last?.activeSession).toBe(older);
  });

  it('C12: Share on an older bill generates the code for THAT bill', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    render(tree(OLDER_ID));
    await screen.findByTestId('wizard');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));

    expect(billService.generateShareCode).toHaveBeenCalledTimes(1);
    expect(billService.generateShareCode).toHaveBeenCalledWith(OLDER_ID, 'owner-uid');
  });

  it('C12: Regenerate on an older bill clears and regenerates THAT bill\'s code', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    render(tree(OLDER_ID));
    await screen.findByTestId('wizard');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Regenerate' })));

    expect(billService.updateBill).toHaveBeenCalledTimes(1);
    expect(billService.updateBill.mock.calls[0][0]).toBe(OLDER_ID);
    expect(billService.generateShareCode).toHaveBeenCalledWith(OLDER_ID, 'owner-uid');
  });

  it('C12: the share dialog shows the older bill\'s id and share code', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    render(tree(OLDER_ID));
    await screen.findByTestId('wizard');

    const dialog = screen.getByTestId('share-dialog');
    expect(dialog).toHaveAttribute('data-bill-id', OLDER_ID);
    expect(dialog).toHaveAttribute('data-share-code', 'OLDER1');
  });

  it('C12: a bill missing from the live list (e.g. joined by link) binds to the fetched bill', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    render(tree(OLDER_ID));

    expect(await screen.findByTestId('wizard')).toHaveAttribute('data-session-id', OLDER_ID);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));
    expect(billService.generateShareCode).toHaveBeenCalledWith(OLDER_ID, 'owner-uid');
  });

  it('C12: live updates to the older bill flow through (list entry beats the one-off fetch)', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    const { rerender } = render(tree(OLDER_ID));
    await screen.findByTestId('wizard');

    const updated = { ...older, shareCode: 'NEWCOD' } as Bill;
    ctx.savedSessions = [updated];
    rerender(tree(OLDER_ID));

    expect(screen.getByTestId('share-dialog')).toHaveAttribute('data-share-code', 'NEWCOD');
    expect(wizardProps.last?.activeSession).toBe(updated);
  });

  it('C12: a new draft (/bill/new) binds to no session, never the latest bill', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    render(tree('new'));

    expect(await screen.findByTestId('wizard')).toHaveAttribute('data-session-id', 'none');
    expect(wizardProps.last?.activeSession).toBeNull();
    expect(wizardProps.last?.billId).toBeUndefined();
    expect(screen.queryByTestId('share-dialog')).not.toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));
    // Absence is only meaningful because the other tests show these same stubs
    // DO receive a session / call generateShareCode when one is bound.
    expect(billService.generateShareCode).not.toHaveBeenCalled();
  });

  it('C12: removing the receipt on an older bill targets THAT bill, not the latest', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    render(tree(OLDER_ID));
    await screen.findByTestId('wizard');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove receipt' })));

    expect(ctx.removeReceiptImage).toHaveBeenCalledTimes(1);
    expect(ctx.removeReceiptImage.mock.calls[0][0]?.id).toBe(OLDER_ID);
  });

  it('C12: removing the receipt on a draft never falls back to the latest bill', async () => {
    ctx.activeSession = latest;
    render(tree('new'));
    await screen.findByTestId('wizard');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Remove receipt' })));

    // Not called at all: the context fn with no target clears activeSession.
    // (The test above shows this same stub does reach it when a bill is bound.)
    expect(ctx.removeReceiptImage).not.toHaveBeenCalled();
  });

  it('C12: live people/assignment changes to an older bill reach the wizard', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    const { rerender } = render(tree(OLDER_ID));
    await screen.findByTestId('wizard');
    expect(wizardProps.last?.initialPeople.map((p) => p.id)).not.toContain('p-guest');

    ctx.savedSessions = [
      {
        ...older,
        people: [{ id: 'p-guest', name: 'Guest' }],
        itemAssignments: { 'item-1': ['p-guest'] },
      } as unknown as Bill,
    ];
    rerender(tree(OLDER_ID));

    expect(wizardProps.last?.initialPeople.map((p) => p.id)).toContain('p-guest');
    expect(wizardProps.last?.initialItemAssignments).toEqual({ 'item-1': ['p-guest'] });
  });

  it('C12: an older bill only in the live list renders without waiting for the fetch', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockReturnValue(new Promise(() => {}));
    render(tree(OLDER_ID));

    expect(await screen.findByTestId('wizard')).toHaveAttribute('data-session-id', OLDER_ID);
  });

  it('C12: a fetched-only bill shows the share code it just generated', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [];
    const fetchedOnly = { ...older, shareCode: undefined } as unknown as Bill;
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: fetchedOnly });
    billService.getBill.mockResolvedValue({ ...older, shareCode: 'FRESH1' });
    render(tree(OLDER_ID));
    await screen.findByTestId('wizard');
    expect(screen.getByTestId('share-dialog')).toHaveAttribute('data-share-code', '');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));

    expect(billService.getBill).toHaveBeenCalledWith(OLDER_ID);
    expect(screen.getByTestId('share-dialog')).toHaveAttribute('data-share-code', 'FRESH1');

    billService.getBill.mockResolvedValue({ ...older, shareCode: 'REGEN2' });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Regenerate' })));
    expect(screen.getByTestId('share-dialog')).toHaveAttribute('data-share-code', 'REGEN2');
  });

  it('C12: refreshing a fetched-only bill\'s share code does not reset the wizard\'s people', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: older });
    billService.getBill.mockResolvedValue({ ...older, shareCode: 'FRESH1', people: [{ id: 'p-stale', name: 'Stale' }] });
    render(tree(OLDER_ID));
    await screen.findByTestId('wizard');

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));

    expect(screen.getByTestId('share-dialog')).toHaveAttribute('data-share-code', 'FRESH1');
    expect(wizardProps.last?.initialPeople.map((p) => p.id)).not.toContain('p-stale');
    expect(wizardProps.last?.activeSession?.people).toEqual([]);
  });

  it('positive control: the latest bill still binds to activeSession, live updates included', async () => {
    ctx.activeSession = latest;
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: latest });
    const { rerender } = render(tree(LATEST_ID));

    expect(await screen.findByTestId('wizard')).toHaveAttribute('data-session-id', LATEST_ID);
    expect(wizardProps.last?.activeSession).toBe(latest);

    const updated = { ...latest, shareCode: 'LIVE22' } as Bill;
    ctx.activeSession = updated;
    rerender(tree(LATEST_ID));

    expect(wizardProps.last?.activeSession).toBe(updated);
    expect(screen.getByTestId('share-dialog')).toHaveAttribute('data-share-code', 'LIVE22');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Share' })));
    expect(billService.generateShareCode).toHaveBeenCalledWith(LATEST_ID, 'owner-uid');
  });
});
