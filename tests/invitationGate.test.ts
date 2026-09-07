import { describe, it, expect, vi, beforeEach } from 'vitest';

// Firestore is mocked wholesale: this test is about the DECISION to touch the
// database at all, so the assertion is that the query never happens.
const getDocs = vi.fn();
const updateDoc = vi.fn();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn(() => ({})),
  where: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  arrayUnion: vi.fn((v) => v),
  arrayRemove: vi.fn((v) => v),
  getDocs: (...args: unknown[]) => getDocs(...args),
  updateDoc: (...args: unknown[]) => updateDoc(...args),
}));

vi.mock('@/config/firebase', () => ({ db: {} }));

import { acceptPendingInvitations } from '@/services/invitationService';

describe('acceptPendingInvitations — email trust gate', () => {
  beforeEach(() => {
    getDocs.mockReset();
    updateDoc.mockReset();
    getDocs.mockResolvedValue({
      empty: false,
      docs: [{ id: 'event-1', data: () => ({}) }],
    });
  });

  // THE HOLE: without the gate, typing a stranger's address into the signup
  // form joins you to every event that invited them.
  it('refuses to join events for an UNVERIFIED password account', async () => {
    const joined = await acceptPendingInvitations({
      uid: 'attacker-uid',
      email: 'victim@example.com',
      emailVerified: false,
      providerData: [{ providerId: 'password', email: 'victim@example.com' }],
    });

    expect(joined).toBe(0);
    expect(getDocs).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
  });

  it('joins events once the password account verifies its email', async () => {
    const joined = await acceptPendingInvitations({
      uid: 'real-uid',
      email: 'real@example.com',
      emailVerified: true,
      providerData: [{ providerId: 'password', email: 'real@example.com' }],
    });

    expect(joined).toBe(1);
    expect(updateDoc).toHaveBeenCalled();
  });

  it('still joins events for an OAuth account, which is the existing behaviour', async () => {
    const joined = await acceptPendingInvitations({
      uid: 'google-uid',
      email: 'person@gmail.com',
      providerData: [{ providerId: 'google.com', email: 'person@gmail.com' }],
    });

    expect(joined).toBe(1);
  });
});
