/**
 * The compacted Settings → Profile rows (owner, 2026-10-13: "sign-in method and
 * delete account take too much space").
 *
 * What must NOT be lost in the compaction:
 *   - SignInMethodsCard: an Apple-only user still needs a way to add a password
 *     (it is their only route into the account from a desktop browser). The
 *     form is now behind a button — it must still open, and must not appear
 *     for an account that already has a password.
 *   - DeleteAccountCard: Guideline 5.1.1(v) — the control must stay present and
 *     still lead into the confirmation flow.
 *
 * Every dependency is mocked with a FULL factory (no importOriginal — that
 * drags src/config/firebase.ts in and fails in CI without .env).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ providers: ['google.com'] as string[] }));

vi.mock('@/config/firebase', () => ({
  auth: {
    get currentUser() {
      return { providerData: h.providers.map((providerId) => ({ providerId })) };
    },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'u1', email: 'sam@example.com' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/services/passwordLinkService', () => ({
  currentProviderIds: () => h.providers,
  describeProvider: (id: string) =>
    id === 'password' ? 'Email' : id === 'apple.com' ? 'Apple' : 'Google',
  isAppleRelayAddress: () => false,
  linkPassword: vi.fn(),
}));
vi.mock('@/services/reauthService', () => ({ reauthNeedsPassword: () => false }));
vi.mock('@/utils/authProviders', () => ({
  describePasswordAuthError: () => 'error',
  isSilentAuthCancellation: () => false,
}));
vi.mock('@/services/accountService', () => ({ accountService: { deleteAccount: vi.fn() } }));
vi.mock('@/services/userService', () => ({
  userService: { getActiveBalances: vi.fn(async () => []) },
}));

import { SignInMethodsCard } from '@/components/settings/SignInMethodsCard';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';

beforeEach(() => {
  h.providers = ['google.com'];
});

describe('SignInMethodsCard — compact', () => {
  it('shows one row and keeps the add-password form closed until asked', async () => {
    render(<SignInMethodsCard />);
    expect(screen.getByText('Google')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: /add password/i }));

    // The positive half: the form a web-stranded Apple user needs is reachable.
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('sam@example.com');
  });

  it('offers no add-password control when the account already has one', () => {
    h.providers = ['google.com', 'password'];
    render(<SignInMethodsCard />);
    expect(screen.getByText('Google and Email')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add password/i })).toBeNull();
  });
});

describe('DeleteAccountCard — compact', () => {
  it('still leads into the delete confirmation (Guideline 5.1.1(v))', async () => {
    render(
      <MemoryRouter>
        <DeleteAccountCard />
      </MemoryRouter>,
    );
    expect(screen.getByText('Delete account')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Delete your account?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByText('This cannot be undone')).toBeInTheDocument();
  });
});
