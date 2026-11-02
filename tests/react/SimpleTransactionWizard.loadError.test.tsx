/**
 * /transaction/:billId — what the quick-expense wizard shows when the URL load
 * of a bill fails, and that it never autosaves a blank form onto that id.
 *
 * Before: the wizard rendered an empty Details form immediately, kicked off a
 * silent resumeSession, and on failure left that blank form bound to the bad
 * id. `hasLoadedBillId` was set BEFORE the fetch, so (a) a later activeSession
 * snapshot for the bill was ignored and (b) the autosave guard passed.
 *
 * The steps are stubbed to show the fields the wizard hands them, so a
 * rendered bill is asserted by its title, never by the absence of the error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { Bill } from '@/types';
import type { BillLoadResult } from '@/utils/billLoadResult';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }));
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));
// Stable identities, like the real hooks: the wizard's effects depend on them.
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
const profileValue = vi.hoisted(() => ({ profile: { venmoId: 'owner-venmo' } }));
const returnTo = vi.hoisted(() => ({ goBack: vi.fn(), label: 'Bills', returnTo: '/dashboard' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => profileValue }));
vi.mock('@/hooks/useReturnTo', () => ({ useReturnTo: () => returnTo }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/usePlatform', () => ({ usePlatform: () => ({ isNative: false }) }));
vi.mock('@/hooks/usePeopleManager', () => ({
  usePeopleManager: () => ({ removePerson: vi.fn() }),
}));
const billServiceMock = vi.hoisted(() => ({
  updateBill: vi.fn(async () => undefined),
  createSimpleTransaction: vi.fn(),
}));
vi.mock('@/services/billService', () => ({ billService: billServiceMock }));
vi.mock('@/services/userService', () => ({ userService: {} }));

vi.mock('@/components/ui/stepper', () => ({
  Stepper: () => null,
  StepContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/ui/pill-progress', () => ({ PillProgress: () => null }));
vi.mock('@/components/ui/swipeable-container', () => ({
  SwipeableStepContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/bill-wizard/WizardNavigation', () => ({ WizardNavigation: () => null }));
vi.mock('@/components/simple-transaction-wizard/steps/DetailsStep', () => ({
  DetailsStep: (p: {
    amount: string;
    setAmount: (v: string) => void;
    title: string;
    setTitle: (v: string) => void;
  }) => (
    <div>
      <input aria-label="Amount" value={p.amount} onChange={(e) => p.setAmount(e.target.value)} />
      <input aria-label="Title" value={p.title} onChange={(e) => p.setTitle(e.target.value)} />
    </div>
  ),
}));
vi.mock('@/components/simple-transaction-wizard/steps/PeopleStep', () => ({
  PeopleStep: ({ onPrev }: { onPrev: () => void }) => (
    <button onClick={onPrev}>people-prev</button>
  ),
}));
vi.mock('@/components/simple-transaction-wizard/steps/ReviewStep', () => ({
  ReviewStep: (p: { title: string; amount: string; onPrev: () => void }) => (
    <div>
      <div data-testid="review">
        {p.title}|{p.amount}
      </div>
      <button onClick={p.onPrev}>review-prev</button>
    </div>
  ),
}));

const bill = {
  id: 'bill-1',
  ownerId: 'owner-uid',
  title: 'Team Dinner',
  isSimpleTransaction: true,
  splitEvenly: true,
  paidById: 'owner-uid',
  people: [
    { id: 'user-owner-uid', name: 'Owner' },
    { id: 'person-2', name: 'Sam' },
  ],
  billData: {
    items: [{ id: 'item-1', name: 'Team Dinner', price: 40 }],
    subtotal: 40,
    tax: 0,
    tip: 0,
    total: 40,
  },
  itemAssignments: { 'item-1': ['user-owner-uid', 'person-2'] },
} as unknown as Bill;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ctx = {
  activeSession: null as Bill | null,
  loadBill: vi.fn<(id: string) => Promise<BillLoadResult>>(),
  resumeSession: vi.fn(async () => null),
  saveSession: vi.fn(async () => 'bill-draft'),
};
vi.mock('@/contexts/BillSessionContext', () => ({ useBillContext: () => ctx }));

import { SimpleTransactionWizard } from '@/components/simple-transaction-wizard/SimpleTransactionWizard';

const tree = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/transaction/:billId" element={<SimpleTransactionWizard />} />
    </Routes>
  </MemoryRouter>
);

/** Flush effects + resolved promises without advancing the autosave debounce. */
const flush = () => act(async () => {});

const review = () => screen.getByTestId('review');
const errorHeading = (name: string) => screen.queryByRole('heading', { name });

beforeEach(() => {
  ctx.activeSession = null;
  ctx.loadBill.mockReset();
  ctx.resumeSession.mockClear();
  ctx.saveSession.mockClear();
  billServiceMock.updateBill.mockClear();
  returnTo.goBack.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('SimpleTransactionWizard — bill URL load failure', () => {
  it('C1: not-found shows "Couldn\'t open this bill" with Go back + Try again and no spinner', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    render(tree('/transaction/missing-id'));
    await flush();

    expect(ctx.loadBill).toHaveBeenCalledWith('missing-id');
    expect(errorHeading("Couldn't open this bill")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading bill' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Amount' })).not.toBeInTheDocument();
  });

  it('C1: permission-denied shows the same unavailable screen', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'denied' });
    render(tree('/transaction/other-users-bill'));
    await flush();

    expect(errorHeading("Couldn't open this bill")).toBeInTheDocument();
    // Retrying cannot fix "denied", so Go back leads.
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName(/go back/i);
  });

  it('C2: an offline (unavailable) load shows "You\'re offline" with Try again first', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    render(tree('/transaction/bill-1'));
    await flush();

    expect(errorHeading("You're offline")).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAccessibleName('Try again');
    expect(buttons[1]).toHaveAccessibleName(/go back/i);
  });

  it('C2: any other error also shows the offline variant', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'error' });
    render(tree('/transaction/bill-1'));
    await flush();

    expect(errorHeading("You're offline")).toBeInTheDocument();
  });

  it('C3: Try again shows the spinner, re-runs the load and renders the bill', async () => {
    const second = deferred<BillLoadResult>();
    ctx.loadBill.mockResolvedValueOnce({ status: 'offline' }).mockReturnValueOnce(second.promise);
    render(tree('/transaction/bill-1'));
    await flush();
    expect(errorHeading("You're offline")).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(ctx.loadBill).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status', { name: 'Loading bill' })).toBeInTheDocument();
    expect(errorHeading("You're offline")).not.toBeInTheDocument();

    await act(async () => second.resolve({ status: 'loaded', bill }));
    expect(review()).toHaveTextContent('Team Dinner|40');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('C3: a retry that fails again shows the error again', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    render(tree('/transaction/bill-1'));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();

    expect(ctx.loadBill).toHaveBeenCalledTimes(2);
    expect(errorHeading("You're offline")).toBeInTheDocument();
  });

  it('C4: Go back calls useReturnTo().goBack and shows its label', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    render(tree('/transaction/missing-id'));
    await flush();

    const back = screen.getByRole('button', { name: 'Go back to Bills' });
    fireEvent.click(back);
    expect(returnTo.goBack).toHaveBeenCalledTimes(1);
  });

  it('C5: a fetch that fails after the snapshot rendered the bill keeps the bill', async () => {
    // getDoc rejects offline while onSnapshot keeps serving (the August trap).
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    const { rerender } = render(tree('/transaction/bill-1'));
    await flush();

    ctx.activeSession = bill;
    rerender(tree('/transaction/bill-1'));
    await flush();
    expect(review()).toHaveTextContent('Team Dinner|40');

    await act(async () => fetch.resolve({ status: 'offline' }));
    expect(review()).toHaveTextContent('Team Dinner|40');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('C5: a fetch that succeeds after the snapshot rendered the bill does not overwrite edits', async () => {
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    const { rerender } = render(tree('/transaction/bill-1'));
    await flush();
    ctx.activeSession = bill;
    rerender(tree('/transaction/bill-1'));
    await flush();

    fireEvent.click(screen.getByRole('button', { name: 'review-prev' }));
    fireEvent.click(screen.getByRole('button', { name: 'people-prev' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Edited title' },
    });

    await act(async () => fetch.resolve({ status: 'loaded', bill }));
    // A re-apply would also jump back to the Review step.
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Edited title');
  });

  it('C5: a newer snapshot of the same bill (e.g. its own autosave echo) does not overwrite edits', async () => {
    ctx.activeSession = bill;
    const { rerender } = render(tree('/transaction/bill-1'));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'review-prev' }));
    fireEvent.click(screen.getByRole('button', { name: 'people-prev' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Edited title' },
    });

    ctx.activeSession = { ...bill } as Bill;
    rerender(tree('/transaction/bill-1'));
    await flush();

    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveValue('Edited title');
  });

  it('C6: a snapshot that arrives after a failed fetch replaces the error with the bill', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    const { rerender } = render(tree('/transaction/bill-1'));
    await flush();
    expect(errorHeading("You're offline")).toBeInTheDocument();

    ctx.activeSession = bill;
    rerender(tree('/transaction/bill-1'));
    await flush();

    expect(review()).toHaveTextContent('Team Dinner|40');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('C7: while the bill loads it shows a spinner, not a blank form', async () => {
    ctx.loadBill.mockReturnValue(new Promise(() => {}));
    render(tree('/transaction/bill-1'));
    await flush();

    expect(screen.getByRole('status', { name: 'Loading bill' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Amount' })).not.toBeInTheDocument();
  });

  it('C7: after a failed load nothing is autosaved, even past the debounce', async () => {
    vi.useFakeTimers();
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    render(tree('/transaction/missing-id'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(errorHeading("Couldn't open this bill")).toBeInTheDocument();
    // No blank form to type into and bind to the bad id.
    expect(screen.queryByRole('textbox', { name: 'Amount' })).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(billServiceMock.updateBill).not.toHaveBeenCalled();
    expect(ctx.saveSession).not.toHaveBeenCalled();
  });

  it('C7 control: after a successful load, an edit IS autosaved to that bill', async () => {
    vi.useFakeTimers();
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill });
    render(tree('/transaction/bill-1'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(review()).toHaveTextContent('Team Dinner|40');

    // Review → People → Details, then edit the title.
    fireEvent.click(screen.getByRole('button', { name: 'review-prev' }));
    fireEvent.click(screen.getByRole('button', { name: 'people-prev' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
      target: { value: 'Team Dinner + drinks' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(billServiceMock.updateBill).toHaveBeenCalledWith(
      'bill-1',
      expect.objectContaining({ title: 'Team Dinner + drinks', paidById: 'owner-uid' }),
    );
  });

  it('C10: a new draft renders the form at once, never loads, and still autosaves a draft', async () => {
    vi.useFakeTimers();
    render(tree('/transaction/new'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(ctx.loadBill).not.toHaveBeenCalled();
    expect(screen.queryByRole('status', { name: 'Loading bill' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount' }), { target: { value: '25' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), { target: { value: 'Taxi' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(ctx.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Taxi', isSimpleTransaction: true }),
    );
    expect(billServiceMock.updateBill).not.toHaveBeenCalled();
  });

  it('C10: a bill already in the snapshot renders without fetching', async () => {
    ctx.activeSession = bill;
    render(tree('/transaction/bill-1'));
    await flush();

    expect(review()).toHaveTextContent('Team Dinner|40');
    expect(ctx.loadBill).not.toHaveBeenCalled();
  });
});
