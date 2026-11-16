/**
 * /transaction/:billId (quick expense) binds to the URL bill, not the user's
 * latest one, and hides the hero title until the bill is on screen.
 *
 * - C4: an older bill comes from savedSessions, so it renders offline. Before:
 *   only activeSession hydrated, so an offline fetch showed the error card.
 * - C5: isOwner / ownerId / settledPersonIds come from THAT bill. Before: from
 *   activeSession, so an older bill owned by someone else was editable and
 *   showed the latest bill's settled people.
 * - C6: #hero-bill-title is not rendered while the wizard shows a spinner or
 *   the error card. Before: an editable, empty title sat above both.
 *
 * Rendered through SimpleTransactionView with the REAL HeroSection.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Bill } from '@/types';
import type { BillLoadResult } from '@/utils/billLoadResult';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn() }));
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));
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
vi.mock('@/services/billService', () => ({
  billService: { updateBill: vi.fn(async () => undefined), createSimpleTransaction: vi.fn() },
}));
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
  DetailsStep: () => <div data-testid="details" />,
}));
vi.mock('@/components/simple-transaction-wizard/steps/PeopleStep', () => ({
  PeopleStep: () => <div data-testid="people" />,
}));
vi.mock('@/components/simple-transaction-wizard/steps/ReviewStep', () => ({
  ReviewStep: (p: {
    title: string;
    isOwner?: boolean;
    ownerId?: string;
    settledPersonIds?: string[];
  }) => (
    <div
      data-testid="review"
      data-is-owner={String(p.isOwner)}
      data-owner-id={p.ownerId}
      data-settled={(p.settledPersonIds ?? []).join(',')}
    >
      {p.title}
    </div>
  ),
}));

const mkBill = (over: Partial<Bill>) =>
  ({
    ownerId: 'owner-uid',
    isSimpleTransaction: true,
    splitEvenly: true,
    paidById: 'owner-uid',
    people: [
      { id: 'user-owner-uid', name: 'Owner' },
      { id: 'person-2', name: 'Sam' },
    ],
    billData: {
      items: [{ id: 'item-1', name: 'x', price: 40 }],
      subtotal: 40,
      tax: 0,
      tip: 0,
      total: 40,
    },
    itemAssignments: { 'item-1': ['user-owner-uid', 'person-2'] },
    settledPersonIds: [],
    ...over,
  }) as unknown as Bill;

const OLDER_ID = 'bill-older';
const latest = mkBill({ id: 'bill-latest', title: 'Latest dinner', settledPersonIds: ['user-owner-uid'] });
const older = mkBill({ id: OLDER_ID, title: 'Older taxi' });
// An older bill someone else owns, with Sam already settled.
const othersOlder = mkBill({
  id: OLDER_ID,
  title: 'Shared taxi',
  ownerId: 'friend-uid',
  paidById: 'friend-uid',
  settledPersonIds: ['person-2'],
});

const ctx = {
  activeSession: null as Bill | null,
  savedSessions: [] as Bill[],
  loadBill: vi.fn<(id: string) => Promise<BillLoadResult>>(),
  resumeSession: vi.fn(async () => null),
  saveSession: vi.fn(async () => 'bill-draft'),
};
vi.mock('@/contexts/BillSessionContext', () => ({ useBillContext: () => ctx }));

import SimpleTransactionView from '@/pages/SimpleTransactionView';

const tree = (path: string) => (
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/transaction/:billId" element={<SimpleTransactionView />} />
    </Routes>
  </MemoryRouter>
);

const flush = () => act(async () => {});
const heroTitle = () => document.getElementById('hero-bill-title') as HTMLInputElement | null;
const review = () => screen.getByTestId('review');

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  ctx.activeSession = latest;
  ctx.savedSessions = [];
  ctx.loadBill.mockReset();
});

describe('quick expense — an older cached bill renders offline (C4)', () => {
  it('C4: an older bill in savedSessions renders when loadBill is offline, no error card', async () => {
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    render(tree(`/transaction/${OLDER_ID}`));
    await flush();

    expect(review()).toHaveTextContent('Older taxi');
    expect(heroTitle()).toHaveValue('Older taxi');
    expect(screen.queryByRole('heading', { name: "You're offline" })).toBeNull();
  });

  it('C4: savedSessions arriving after the offline failure replaces the error with the bill', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    const { rerender } = render(tree(`/transaction/${OLDER_ID}`));
    await flush();
    expect(screen.getByRole('heading', { name: "You're offline" })).toBeInTheDocument();

    ctx.savedSessions = [older];
    rerender(tree(`/transaction/${OLDER_ID}`));
    await flush();

    expect(review()).toHaveTextContent('Older taxi');
    expect(screen.queryByRole('heading', { name: "You're offline" })).toBeNull();
  });

  it('C7: a later snapshot of the older bill does not re-apply over an edit', async () => {
    ctx.savedSessions = [older];
    ctx.loadBill.mockResolvedValue({ status: 'offline' });
    const { rerender } = render(tree(`/transaction/${OLDER_ID}`));
    await flush();
    expect(review()).toHaveTextContent('Older taxi');
    fireEvent.change(heroTitle()!, { target: { value: 'My edit' } });

    ctx.savedSessions = [{ ...older, title: 'Echo' } as Bill];
    rerender(tree(`/transaction/${OLDER_ID}`));
    await flush();

    expect(heroTitle()).toHaveValue('My edit');
    expect(review()).toHaveTextContent('My edit');
  });
});

describe('quick expense — ownership and settlement come from the URL bill (C5)', () => {
  it('C5: an older bill (savedSessions) owned by someone else is read-only with its own settled people', async () => {
    ctx.savedSessions = [othersOlder];
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: othersOlder });
    render(tree(`/transaction/${OLDER_ID}`));
    await flush();

    expect(review()).toHaveTextContent('Shared taxi');
    expect(review()).toHaveAttribute('data-is-owner', 'false');
    expect(review()).toHaveAttribute('data-owner-id', 'friend-uid');
    expect(review()).toHaveAttribute('data-settled', 'person-2');
  });

  it('C5: a fetched-only older bill also binds ownership and settlement to that bill', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'loaded', bill: othersOlder });
    render(tree(`/transaction/${OLDER_ID}`));
    await flush();

    expect(review()).toHaveTextContent('Shared taxi');
    expect(review()).toHaveAttribute('data-is-owner', 'false');
    expect(review()).toHaveAttribute('data-settled', 'person-2');
  });

  it('C5 control: the latest bill still uses activeSession', async () => {
    render(tree('/transaction/bill-latest'));
    await flush();

    expect(review()).toHaveTextContent('Latest dinner');
    expect(review()).toHaveAttribute('data-is-owner', 'true');
    expect(review()).toHaveAttribute('data-settled', 'user-owner-uid');
  });
});

describe('quick expense — hero title hidden until the bill renders (C6)', () => {
  it('C6: no title input while loading; it appears with the bill title once rendered', async () => {
    const fetch = deferred<BillLoadResult>();
    ctx.loadBill.mockReturnValue(fetch.promise);
    render(tree(`/transaction/${OLDER_ID}`));
    await flush();

    expect(screen.getByRole('status', { name: 'Loading bill' })).toBeInTheDocument();
    expect(heroTitle()).toBeNull();

    await act(async () => fetch.resolve({ status: 'loaded', bill: older }));
    expect(review()).toHaveTextContent('Older taxi');
    expect(heroTitle()).toHaveValue('Older taxi');
  });

  it('C6: no title input on the error card', async () => {
    ctx.loadBill.mockResolvedValue({ status: 'not-found' });
    render(tree('/transaction/missing-id'));
    await flush();

    expect(screen.getByRole('heading', { name: "Couldn't open this bill" })).toBeInTheDocument();
    expect(heroTitle()).toBeNull();
  });

  it('C6: the very first paint (before effects run) has no title on an existing bill, one on /new', () => {
    // Effects never run in a server render, so this pins the initial state —
    // without it the title flashes for a frame before the wizard reports in.
    ctx.loadBill.mockReturnValue(new Promise(() => {}));
    expect(renderToStaticMarkup(tree(`/transaction/${OLDER_ID}`))).not.toContain('hero-bill-title');
    expect(renderToStaticMarkup(tree('/transaction/new'))).toContain('id="hero-bill-title"');
  });

  it('C6: /transaction/new renders the title input immediately', async () => {
    render(tree('/transaction/new'));

    expect(heroTitle()).not.toBeNull();
    expect(heroTitle()).toHaveAttribute('placeholder', 'Quick Expense');
    expect(screen.getByTestId('details')).toBeInTheDocument();
    expect(ctx.loadBill).not.toHaveBeenCalled();
  });
});
