/**
 * The group-cap gate on the events page — the WIRING, not the component.
 *
 * This file exists because the last two review passes both found the defects in
 * the wiring while the components themselves were fine: a handler passed to a
 * call site that could not honour it, and props never passed at all. Component
 * tests were green through both.
 *
 * TWO ENTRY POINTS, and the second is the one that would rot: besides the
 * header `Plus`, an empty-state "Create Event" button renders whenever
 * `activeEvents.length === 0` — INCLUDING the "all your events are archived"
 * branch, which is the at-cap-adjacent state. Gating only the header leaves it
 * live.
 *
 * Every mock is a plain factory; nothing uses `importOriginal`, so no module
 * here reaches `@/config/firebase` and needs a populated `.env`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  cap: { activeCount: 2, limit: 2, atCap: false, text: '', unlimited: false, loading: false },
  events: [] as Array<Record<string, unknown>>,
  createEvent: vi.fn(),
  unarchiveEvent: vi.fn(),
  toast: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('@/hooks/useGroupCap', () => ({ useGroupCap: () => h.cap }));
vi.mock('@/hooks/useEventManager', () => ({
  useEventManager: () => ({
    events: h.events,
    loading: false,
    createEvent: h.createEvent,
    deleteEvent: vi.fn(),
    archiveEvent: vi.fn(),
    unarchiveEvent: h.unarchiveEvent,
  }),
}));
vi.mock('@/hooks/useEventInvites', () => ({ useEventInvites: () => ({ inviteByEmail: vi.fn() }) }));
// EventsView -> CreateEventDialog -> AddAppUserDialog -> userService ->
// @/config/firebase, which calls getAuth(app) at import time and throws
// `auth/invalid-api-key` without a populated .env. Plain factory, no
// importOriginal, or the real module loads anyway.
vi.mock('@/services/userService', () => ({
  userService: { searchUsersByName: vi.fn().mockResolvedValue([]), getUserProfile: vi.fn() },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'u1' } }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: h.toast }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  // `importActual` is safe HERE specifically: react-router-dom has no path to
  // @/config/firebase. It would not be safe on an app module.
  return { ...actual, useNavigate: () => h.navigate };
});

import EventsView from '@/pages/EventsView';

const renderView = () =>
  render(
    <MemoryRouter>
      <EventsView />
    </MemoryRouter>,
  );

const capModal = () => screen.queryByText(/You have \d+ active groups?\./);

beforeEach(() => {
  vi.clearAllMocks();
  h.cap = { activeCount: 2, limit: 2, atCap: false, text: '', unlimited: false, loading: false };
  h.events = [];
});

describe('EventsView — below the cap nothing changes', () => {
  it('opens the create dialog from the header button', async () => {
    // The POSITIVE case, and the one that matters most: a regression where the
    // gate blocks everybody is the unrecoverable direction, and asserting only
    // "no modal" would sail straight through it.
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(screen.getByRole('heading', { name: 'Create New Event' })).toBeInTheDocument();
    expect(capModal()).not.toBeInTheDocument();
  });

  it('opens it from the empty-state button too', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    expect(screen.getByRole('heading', { name: 'Create New Event' })).toBeInTheDocument();
    expect(capModal()).not.toBeInTheDocument();
  });

  it('shows no cap text', () => {
    renderView();
    expect(screen.queryByText(/groups active/)).not.toBeInTheDocument();
  });
});

describe('EventsView — at the cap', () => {
  beforeEach(() => {
    h.cap = { ...h.cap, atCap: true, text: '2 of 2 groups active' };
  });

  it('states the cap on the page', () => {
    renderView();
    expect(screen.getByText('2 of 2 groups active')).toBeInTheDocument();
  });

  it('raises the cap modal from the HEADER button', async () => {
    // The header Plus is the entry point actually reachable at the cap: being
    // at the cap implies at least one owned ACTIVE group, which puts a card on
    // screen, so the empty state cannot render at the same time. (An earlier
    // version of this file claimed the empty state was the reachable one via
    // other people's groups — false: the cap counts OWNED groups only.)
    h.events = [
      { id: 'e1', name: 'Trip', ownerId: 'u1', memberIds: ['u1'] },
      { id: 'e2', name: 'Ski', ownerId: 'u1', memberIds: ['u1'] },
    ];
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    expect(capModal()).toBeInTheDocument();
  });

  it('gates the empty-state button as well', async () => {
    // Defensive rather than reachable today, but it is a second `setDialogOpen`
    // route and the one that would rot if the cap definition ever changed.
    h.events = [];
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    expect(capModal()).toBeInTheDocument();
  });

  it('does not open the create dialog behind the modal', async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Create Event' }));
    // CreateEventDialog's own heading. The previous version of this assertion
    // used a placeholder regex that matched NOTHING in that component, so it
    // passed with the gate fully reverted.
    expect(screen.queryByRole('heading', { name: 'Create New Event' })).not.toBeInTheDocument();
  });
});

describe('EventsView — the server still gets the last word', () => {
  it('raises the modal when the SERVER refuses a create with group-cap', async () => {
    // The client gate is a courtesy: `atCap` is false while anything loads, and
    // a second device can take the last slot. When the client was wrong the
    // server rejects with a typed payload, and THAT must draw the wall rather
    // than a toast.
    // The client count is deliberately DIFFERENT from the server's, and
    // deliberately 0: on a real refusal the client list has usually not
    // loaded (that is WHY the client gate let the call through). If the modal
    // ever reads from `cap` instead of the payload it renders "You have 0
    // active groups. Your free plan includes 2." — nonsense, and the exact
    // regression an equal-counts fixture cannot see.
    h.cap = { ...h.cap, atCap: false, activeCount: 0, limit: 2 };
    const err = Object.assign(new Error('too many groups'), {
      code: 'functions/resource-exhausted',
      details: { reason: 'group-cap', activeCount: 3, limit: 2 },
    });
    h.unarchiveEvent.mockRejectedValue(err);
    h.events = [
      { id: 'e1', name: 'Old Trip', ownerId: 'u1', archived: true, memberIds: ['u1'] },
    ];
    renderView();

    await userEvent.click(screen.getByRole('button', { name: /archived/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Restore|Unarchive/i }));

    // Literal, not the \d+ regex: the regex passes on the client's 0 too.
    expect(screen.getByText('You have 3 active groups.')).toBeInTheDocument();
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('raises the modal when the SERVER refuses a CREATE with group-cap', async () => {
    // Deleting the `handledAsGroupCap` call on the create path broke no test
    // before this one existed — only the unarchive path was covered.
    h.cap = { ...h.cap, atCap: false, activeCount: 0, limit: 2 };
    h.createEvent.mockRejectedValue(
      Object.assign(new Error('too many groups'), {
        code: 'functions/resource-exhausted',
        details: { reason: 'group-cap', activeCount: 3, limit: 2 },
      }),
    );
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Create event' }));
    await userEvent.type(screen.getByLabelText(/Event Name/i), 'Third trip');
    // Drive the REAL dialog rather than stubbing it: Create stays disabled
    // until a member is selected, and the email-invite path is the one branch
    // that needs no user-search results.
    await userEvent.click(screen.getByRole('button', { name: /Add Member/i }));
    await userEvent.type(
      screen.getByPlaceholderText(/Name, @username, or email/i),
      'sam@example.com',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Invite' }));
    await userEvent.click(screen.getByRole('button', { name: 'Create Event' }));

    expect(await screen.findByText('You have 3 active groups.')).toBeInTheDocument();
    expect(h.createEvent).toHaveBeenCalledTimes(1);
    expect(h.toast).not.toHaveBeenCalled();
  });

  it('still toasts a refusal that is NOT the group cap', async () => {
    h.unarchiveEvent.mockRejectedValue(new Error('network died'));
    h.events = [
      { id: 'e1', name: 'Old Trip', ownerId: 'u1', archived: true, memberIds: ['u1'] },
    ];
    renderView();

    await userEvent.click(screen.getByRole('button', { name: /archived/i }));
    await userEvent.click(await screen.findByRole('button', { name: /Restore|Unarchive/i }));

    expect(capModal()).not.toBeInTheDocument();
    expect(h.toast).toHaveBeenCalledTimes(1);
  });
});
