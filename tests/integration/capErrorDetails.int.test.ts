/**
 * The `details` payload on the group-cap `HttpsError`, asserted against a REAL
 * thrown error rather than the source text.
 *
 * `functions/src/index.ts` cannot be imported (it calls `initializeApp()` at
 * module load), so the scan-quota equivalent is covered structurally in
 * `tests/analyzeBillGates.test.ts`. `eventFunctions.ts` has no such problem, so
 * this one gets the real thing: throw it, catch it, read `.details`.
 *
 * Lives in its own file because it `vi.mock`s `remoteConfigLimits` — enforcement
 * must be ON for the throw to happen at all, and mock hoisting is file-scoped.
 * Folding it into `groupCapAndQuota.int.test.ts` would silently swap Remote
 * Config out from under that file's other 30 cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { isCapErrorDetails, isPaywallTrigger } from '../../shared/capErrors';

const FREE_ACTIVE_GROUPS = 2;

vi.mock('../../functions/src/remoteConfigLimits', () => ({
  getMonetizationLimits: async () => ({
    freeScansPerMonth: 2,
    freeActiveGroups: FREE_ACTIVE_GROUPS,
    // The switch this whole test depends on. With the real loader in the
    // emulator this is false (Remote Config is unreachable → DEFAULT_LIMITS),
    // the gate would permit, and the test would vacuously pass by never
    // throwing at all.
    paywallEnabled: true,
    degraded: false,
  }),
}));

const { assertGroupSlotAvailable } = await import('../../functions/src/eventFunctions');

const ALICE = 'alice';

async function seedEvent(id: string, ownerId: string, archived?: boolean): Promise<void> {
  await db.doc(`events/${id}`).set({
    name: id,
    ownerId,
    memberIds: [ownerId],
    ...(archived === undefined ? {} : { archived }),
  });
}

async function captureThrow(fn: () => Promise<unknown>): Promise<{
  code?: string;
  message?: string;
  details?: unknown;
}> {
  try {
    await fn();
  } catch (error) {
    const e = error as { code?: string; message?: string; details?: unknown };
    return { code: e.code, message: e.message, details: e.details };
  }
  throw new Error('expected assertGroupSlotAvailable to throw, but it resolved');
}

describe('group-cap HttpsError details', () => {
  beforeEach(async () => {
    await clearFirestore();
  });

  it('does not throw below the cap', async () => {
    await seedEvent('e1', ALICE);
    await expect(assertGroupSlotAvailable(db, ALICE)).resolves.toBeUndefined();
  });

  it('throws resource-exhausted with typed group-cap details AT the cap', async () => {
    await seedEvent('e1', ALICE);
    await seedEvent('e2', ALICE);

    const err = await captureThrow(() => assertGroupSlotAvailable(db, ALICE));

    expect(err.code).toBe('resource-exhausted');
    expect(err.details).toEqual({
      reason: 'group-cap',
      activeCount: 2,
      limit: FREE_ACTIVE_GROUPS,
    });
    // The prose survives as fallback copy — the client prefers `details` but
    // must still have something to render if it is ever absent.
    expect(err.message).toMatch(/active groups/i);
  });

  it('the details satisfy the shared guards the client will use', async () => {
    await seedEvent('e1', ALICE);
    await seedEvent('e2', ALICE);

    const err = await captureThrow(() => assertGroupSlotAvailable(db, ALICE));

    // This is the actual contract: the payload the server emits must be
    // accepted by the predicate the client narrows with. A field-name typo on
    // either side breaks here rather than in a user's face.
    expect(isCapErrorDetails(err.details)).toBe(true);
    expect(isPaywallTrigger(err.details)).toBe(true);
  });

  // capMessage already covers the copy for this case; what matters here is that
  // the NUMBER in details is the user's real count, not the limit. A client that
  // assumed activeCount === limit would tell someone with five groups they have
  // two — the exact lie the message helper was written to avoid.
  it('reports the real active count when the user is already past the cap', async () => {
    for (const id of ['e1', 'e2', 'e3', 'e4', 'e5']) await seedEvent(id, ALICE);

    const err = await captureThrow(() => assertGroupSlotAvailable(db, ALICE));

    expect(err.details).toEqual({
      reason: 'group-cap',
      activeCount: 5,
      limit: FREE_ACTIVE_GROUPS,
    });
  });

  it('archived events do not count toward the cap', async () => {
    await seedEvent('e1', ALICE);
    await seedEvent('e2', ALICE, true);
    await expect(assertGroupSlotAvailable(db, ALICE)).resolves.toBeUndefined();
  });
});
