/**
 * Picking (or clearing) an event on a DRAFT (/bill/new, /airbnb/new) must
 * never write to another bill. The pages used to save with
 * `billId || activeSession?.id`; on a draft billId is undefined and
 * activeSession is the user's LATEST bill, so the pick overwrote that bill's
 * eventId/billType/people/itemAssignments and then navigated the draft to it.
 *
 * Decision: a pick on a draft CREATES the draft (saveSession with no id) with
 * the event, its members and the draft's content, then swaps the URL with
 * DRAFT_CREATED_NAV_STATE. If the wizard is already creating the draft, the
 * pick joins that creation instead of making a second bill. Existing bills
 * keep saving to their own id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useEffect } from 'react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import type { Bill } from '@/types';
import type { BillLoadResult } from '@/utils/billLoadResult';

vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
const firestore = vi.hoisted(() => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` })),
  getDoc: vi.fn(),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
}));
vi.mock('firebase/firestore', () => firestore);
const authValue = vi.hoisted(() => ({ user: { uid: 'owner-uid', displayName: 'Owner' } }));
const profileValue = vi.hoisted(() => ({ profile: { venmoId: 'owner-venmo' } }));
const returnTo = vi.hoisted(() => ({ goBack: vi.fn(), label: 'Bills', returnTo: '/dashboard' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => authValue }));
vi.mock('@/hooks/useUserProfile', () => ({ useUserProfile: () => profileValue }));
vi.mock('@/hooks/useSessionTimeout', () => ({ useSessionTimeout: () => {} }));
vi.mock('@/hooks/useReturnTo', () => ({ useReturnTo: () => returnTo }));
const userService = vi.hoisted(() => ({ getUserProfile: vi.fn() }));
vi.mock('@/services/userService', () => ({ userService }));
vi.mock('@/services/billService', () => ({
  billService: { generateShareCode: vi.fn(), updateBill: vi.fn(), getBill: vi.fn() },
}));
const hero = vi.hoisted(() => ({ onTitleChange: null as null | ((t: string) => void) }));
vi.mock('@/components/layout/HeroSection', () => ({
  HeroSection: ({ onTitleChange }: { onTitleChange: (t: string) => void }) => {
    hero.onTitleChange = onTitleChange;
    return null;
  },
}));
vi.mock('@/components/share/ShareLinkDialog', () => ({ ShareLinkDialog: () => null }));

type SaveFn = (data: Partial<Bill>, id?: string) => Promise<string | null | void>;
type WizardProps = {
  billId?: string;
  saveSession: SaveFn;
  onEventChange: (eventId: string | null) => Promise<void> | void;
};
const wizard = vi.hoisted(() => ({ last: null as WizardProps | null, mounts: 0 }));
function WizardStub(props: WizardProps) {
  wizard.last = props;
  useEffect(() => {
    wizard.mounts += 1;
  }, []);
  return <div data-testid="wizard" />;
}
vi.mock('@/components/bill-wizard/BillWizard', () => ({
  BILL_WIZARD_REVIEW_STEP: 3,
  BillWizard: WizardStub,
}));
vi.mock('@/components/airbnb-wizard/AirbnbWizard', () => ({ AirbnbWizard: WizardStub }));

const LATEST_ID = 'bill-latest';
const OLDER_ID = 'bill-older';
const NEW_ID = 'bill-new-draft';
const EVENT_E = 'event-E';

// The user's latest bill — what activeSession points at while on a draft.
const latest = {
  id: LATEST_ID,
  title: 'Latest dinner',
  eventId: 'event-OLD',
  billType: 'event',
  billData: { items: [{ id: 'i1', name: 'Steak', price: 30 }], subtotal: 30, tax: 0, tip: 0, total: 30 },
  people: [{ id: 'user-owner-uid', name: 'Owner' }, { id: 'p-carol', name: 'Carol' }],
  itemAssignments: { i1: ['p-carol'] },
} as unknown as Bill;
const older = { ...latest, id: OLDER_ID, title: 'Older lunch', eventId: undefined, billType: 'private' } as unknown as Bill;

const ctx = {
  activeSession: null as Bill | null,
  savedSessions: [] as Bill[],
  isLoadingSessions: false,
  isUploading: false,
  uploadReceiptImage: vi.fn(),
  resumeSession: vi.fn(),
  loadBill: vi.fn<(id: string) => Promise<BillLoadResult>>(),
  saveSession: vi.fn<(data: Partial<Bill>, id?: string, opts?: unknown) => Promise<string | null>>(),
  removeReceiptImage: vi.fn(),
  deleteSession: vi.fn(),
};
vi.mock('@/contexts/BillSessionContext', () => ({ useBillContext: () => ctx }));

import AIScanView from '@/pages/AIScanView';
import AirbnbView from '@/pages/AirbnbView';

const loc = { pathname: '', state: null as unknown };
function LocationSpy() {
  const l = useLocation();
  loc.pathname = l.pathname;
  loc.state = l.state;
  return null;
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// Event E has the owner and Bob as members.
const EVENT_PEOPLE = [
  { id: 'user-owner-uid', name: 'Owner', venmoId: 'owner-venmo' },
  { id: 'user-bob-uid', name: 'Bob', venmoId: 'bob-venmo' },
];

const PAGES = [
  { name: 'AIScanView', base: '/bill', Page: AIScanView, extra: {} },
  { name: 'AirbnbView', base: '/airbnb', Page: AirbnbView, extra: { isAirbnb: true } },
] as const;

describe.each(PAGES)('$name — event change targets this page\'s own bill', ({ base, Page, extra }) => {
  const renderAt = (id: string) =>
    render(
      <MemoryRouter initialEntries={[`${base}/${id}`]}>
        <LocationSpy />
        <Routes>
          <Route path={`${base}/:billId`} element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );

  const savedIds = () => ctx.saveSession.mock.calls.map((c) => c[1]);
  const pick = (eventId: string | null) => act(async () => {
    await wizard.last!.onEventChange(eventId);
  });

  beforeEach(() => {
    ctx.activeSession = latest;
    ctx.savedSessions = [];
    ctx.loadBill.mockReset().mockResolvedValue({ status: 'loaded', bill: older });
    ctx.saveSession.mockReset().mockImplementation(async (_d, id) => id ?? NEW_ID);
    firestore.getDoc.mockReset().mockResolvedValue({
      exists: () => true,
      data: () => ({ memberIds: ['owner-uid', 'bob-uid'] }),
    });
    userService.getUserProfile.mockReset().mockImplementation(async (uid: string) =>
      uid === 'owner-uid'
        ? { uid, displayName: 'Owner', venmoId: 'owner-venmo' }
        : { uid, displayName: 'Bob', venmoId: 'bob-venmo' },
    );
    wizard.last = null;
    wizard.mounts = 0;
  });

  it('C1/C2: picking an event on a draft creates the draft (no id) with event, members and content, never writing the latest bill', async () => {
    renderAt('new');
    await screen.findByTestId('wizard');
    act(() => hero.onTitleChange!('Ski trip'));

    // The wizard's earlier JIT creation failed (saveSession → null), so the
    // draft still has no bill; the page saw the draft's content in that save.
    const draftBillData = { items: [{ id: 'd1', name: 'Lift pass', price: 80 }], subtotal: 80, tax: 0, tip: 0, total: 80 };
    ctx.saveSession.mockResolvedValueOnce(null);
    await act(async () => {
      await wizard.last!.saveSession({ billData: draftBillData, people: [] }, undefined);
    });
    ctx.saveSession.mockClear();

    await pick(EVENT_E);

    expect(savedIds()).not.toContain(LATEST_ID);
    expect(ctx.saveSession).toHaveBeenCalledTimes(1);
    const [payload, id] = ctx.saveSession.mock.calls[0];
    expect(id).toBeUndefined();
    expect(payload).toMatchObject({
      eventId: EVENT_E,
      billType: 'event',
      people: EVENT_PEOPLE,
      itemAssignments: {},
      billData: draftBillData,
      title: 'Ski trip',
      ...extra,
    });
    expect(loc.pathname).toBe(`${base}/${NEW_ID}`);
    expect(loc.state).toEqual({ draftCreated: true });
    // Same page + wizard instance: the draft's on-screen content is kept.
    expect(wizard.mounts).toBe(1);
    expect(wizard.last!.billId).toBe(NEW_ID);
  });

  it('C2: a pick on a draft the wizard never saved creates it with the event, members and title', async () => {
    renderAt('new');
    await screen.findByTestId('wizard');
    act(() => hero.onTitleChange!('Ski trip'));

    await pick(EVENT_E);

    expect(ctx.saveSession).toHaveBeenCalledTimes(1);
    const [payload, id] = ctx.saveSession.mock.calls[0];
    expect(id).toBeUndefined();
    expect(payload).toMatchObject({
      eventId: EVENT_E,
      billType: 'event',
      people: EVENT_PEOPLE,
      itemAssignments: {},
      title: 'Ski trip',
      status: 'draft',
      ...extra,
    });
    expect(loc.pathname).toBe(`${base}/${NEW_ID}`);
  });

  it('C1/C2: a pick while the wizard is still creating the draft joins that creation (one bill, never the latest)', async () => {
    renderAt('new');
    await screen.findByTestId('wizard');

    const creation = deferred<string | null>();
    ctx.saveSession.mockReturnValueOnce(creation.promise);
    let wizardSave!: Promise<unknown>;
    act(() => {
      wizardSave = wizard.last!.saveSession({ billData: latest.billData, people: [] }, undefined);
    });

    let picked!: Promise<void>;
    await act(async () => {
      picked = Promise.resolve(wizard.last!.onEventChange(EVENT_E));
      await Promise.resolve();
    });
    await act(async () => {
      creation.resolve(NEW_ID);
      await wizardSave;
      await picked;
    });

    expect(savedIds()).not.toContain(LATEST_ID);
    // Exactly one creation; the event lands on the bill it created.
    expect(savedIds().filter((x) => x === undefined)).toHaveLength(1);
    expect(ctx.saveSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventId: EVENT_E, billType: 'event', people: EVENT_PEOPLE, itemAssignments: {} }),
      NEW_ID,
      { allowPeopleRemoval: true },
    );
  });

  it('C1: a wizard save after the page created the draft updates that draft instead of creating another', async () => {
    renderAt('new');
    await screen.findByTestId('wizard');
    const creation = deferred<string | null>();
    ctx.saveSession.mockReturnValueOnce(creation.promise);

    let picked!: Promise<void>;
    await act(async () => {
      picked = Promise.resolve(wizard.last!.onEventChange(EVENT_E));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
    let wizardSave!: Promise<unknown>;
    act(() => {
      wizardSave = wizard.last!.saveSession({ billData: latest.billData }, undefined);
    });
    await act(async () => {
      creation.resolve(NEW_ID);
      await picked;
      await wizardSave;
    });

    expect(savedIds()).not.toContain(LATEST_ID);
    expect(savedIds()).toEqual([undefined, NEW_ID]);
  });

  it('C3: clearing the event on a draft writes nothing to any existing bill', async () => {
    renderAt('new');
    await screen.findByTestId('wizard');

    await pick(null);

    expect(savedIds()).not.toContain(LATEST_ID);
    expect(ctx.saveSession).not.toHaveBeenCalled();
    expect(loc.pathname).toBe(`${base}/new`);
  });

  it('C4: an older (non-latest) bill saves an event pick to its own id', async () => {
    ctx.savedSessions = [older];
    renderAt(OLDER_ID);
    await screen.findByTestId('wizard');

    await pick(EVENT_E);

    expect(ctx.saveSession).toHaveBeenCalledTimes(1);
    expect(ctx.saveSession).toHaveBeenCalledWith(
      { eventId: EVENT_E, billType: 'event', people: EVENT_PEOPLE, itemAssignments: {} },
      OLDER_ID,
      { allowPeopleRemoval: true },
    );
    expect(loc.pathname).toBe(`${base}/${OLDER_ID}`);
  });

  it('C4: clearing the event on an existing bill converts that bill (its own id) to private', async () => {
    ctx.savedSessions = [older];
    renderAt(OLDER_ID);
    await screen.findByTestId('wizard');

    await pick(null);

    expect(ctx.saveSession).toHaveBeenCalledTimes(1);
    expect(ctx.saveSession).toHaveBeenCalledWith(
      { eventId: 'DELETE_FIELD', billType: 'private' },
      OLDER_ID,
    );
  });
});
