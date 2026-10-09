/**
 * `billService.updateBill`'s people guard — defence in depth for the
 * people-loss class of bug.
 *
 * Why a guard exists at all: `updateBill` UNIONS `participantIds` but REPLACES
 * `people` wholesale. Any caller holding a stale array therefore deletes
 * whoever is missing from it, with no error, and `ledgerProcessor` then
 * reverses that person's share. The confirmed instance was `useBillSession`
 * committing a payload captured while the bill was still a draft (see
 * `tests/react/useBillSession.peopleLoss.test.tsx`), but the shape is reachable
 * from ~10 call sites, so the write choke point defends against all of them.
 *
 * Two properties are load-bearing, and BOTH were learned the hard way from an
 * adversarial review plus a read-only production audit:
 *
 * 1. It FAILS SAFE, not closed. An accidental shrink strips the `people` key
 *    and writes the rest. Throwing would discard the whole payload, because
 *    every caller swallows the error — for `handleAnalyze` that is the entire
 *    receipt scan. Losing a scan to protect an array is a worse trade than the
 *    bug being prevented.
 *
 * 2. Ids are compared NORMALIZED. `people[].id` mixes `user-<uid>` with bare
 *    `<uid>`, and `ensureUserInPeople` rewrites whoever is currently loading
 *    from bare to prefixed IN PLACE. 59% of production bills carry a bare id,
 *    and 13 live bills across 5 real accounts would have been permanently
 *    unwritable under raw string comparison — including the two bills that are
 *    actually corrupted and most need repair.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Person } from '@/types/person.types';

const owner: Person = { id: 'user-owner-uid', name: 'Owner' };
const charlie: Person = { id: 'user-charlie-uid', name: 'Charlie' };

/** What the stored document looks like when the write arrives. */
let stored: Record<string, unknown>;
/** What actually reached `transaction.update`, or null if nothing did. */
let written: Record<string, unknown> | null;

vi.mock('@/config/firebase', () => ({ db: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({ id: 'bill-1' })),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(async (_ref: unknown, data: Record<string, unknown>) => {
    written = data;
  }),
  query: vi.fn(),
  where: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  Timestamp: { now: vi.fn() },
  serverTimestamp: vi.fn(() => '__ts__'),
  arrayUnion: vi.fn((x: unknown) => x),
  arrayRemove: vi.fn((x: unknown) => x),
  orderBy: vi.fn(),
  // `removeUndefinedFields` does `item instanceof FieldValue`, so the mock
  // has to expose a real constructor or every write path throws.
  FieldValue: class FieldValue {},
  deleteField: vi.fn(() => '__delete__'),
  // Runs the body for real against `stored`, so the guard is genuinely exercised.
  runTransaction: vi.fn(async (_db: unknown, body: (t: unknown) => Promise<void>) =>
    body({
      get: async () => ({ exists: () => true, data: () => stored }),
      update: (_ref: unknown, data: Record<string, unknown>) => {
        written = data;
      },
    }),
  ),
}));

import { billService } from '@/services/billService';

describe('billService.updateBill — people shrink guard', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    written = null;
    stored = {
      ownerId: 'owner-uid',
      people: [owner, charlie],
      participantIds: ['owner-uid', 'charlie-uid'],
      members: [],
      settledPersonIds: [],
    };
    vi.clearAllMocks();
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('an accidental shrink', () => {
    // This is the exact payload the people-loss bug committed: the pre-guest
    // array, landing on a bill that already has the guest.
    it('does NOT write the stale people array', async () => {
      await billService.updateBill('bill-1', { people: [owner] });

      expect(written).not.toBeNull();
      expect(written!.people).toBeUndefined();
    });

    it('does NOT throw — callers swallow errors, so throwing loses the payload', async () => {
      await expect(billService.updateBill('bill-1', { people: [owner] })).resolves.not.toThrow();
    });

    it('still applies every OTHER field in the write', async () => {
      // The `handleAnalyze` scenario: a receipt scan rides along with a stale
      // `people`. The scan must survive.
      await billService.updateBill('bill-1', {
        people: [owner],
        receiptImageUrl: 'https://example.test/receipt.jpg',
        receiptFileName: 'receipt_123',
        billData: {
          items: [{ id: 'i1', name: 'Pizza', price: 90 }],
          subtotal: 90,
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: 90,
        },
      });

      expect(written!.people).toBeUndefined();
      expect(written!.receiptImageUrl).toBe('https://example.test/receipt.jpg');
      expect(written!.receiptFileName).toBe('receipt_123');
      expect((written!.billData as { total: number }).total).toBe(90);
    });

    it('does not re-derive participantIds from the array it just rejected', async () => {
      await billService.updateBill('bill-1', { people: [owner] });

      expect(written!.participantIds).toBeUndefined();
      expect(written!.unsettledParticipantIds).toBeUndefined();
    });

    it('REPORTS the strip back to the caller', async () => {
      // Load-bearing contract, not cosmetic. A strip RESOLVES, and
      // `usePeopleAdditionQueue.runPersist` re-queues only on a REJECTED
      // promise — so without this flag `persistPeopleAddition` cannot tell a
      // refusal from a success, the add is never retried, and
      // `reconcilePeopleWithServer` re-attaches the person locally forever
      // while the server never has them.
      const result = await billService.updateBill('bill-1', { people: [owner] });

      expect(result).toEqual({ peopleStripped: true });
    });

    it('logs the dropped person so the loss is diagnosable', async () => {
      await billService.updateBill('bill-1', { people: [owner] });

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(String(errorSpy.mock.calls[0][0])).toMatch(/user-charlie-uid/);
    });
  });

  describe('id normalization — the case that bricked 13 production bills', () => {
    it('treats a bare uid and its user- prefixed form as the SAME person', async () => {
      // Live in prod 14 times over: a real linked account stored with a bare
      // uid. `ensureUserInPeople` normalizes it to `user-<uid>` on load, and
      // the next autosave sends the normalized array. That is not a deletion.
      stored = {
        ownerId: 'owner-uid',
        people: [owner, { id: 'Ty1p1IcRealAccountUid', name: 'point to' }],
        participantIds: ['owner-uid', 'Ty1p1IcRealAccountUid'],
        members: [],
        settledPersonIds: [],
      };

      await billService.updateBill('bill-1', {
        people: [owner, { id: 'user-Ty1p1IcRealAccountUid', name: 'point to' }],
      });

      // The write must go through with people intact — under raw string
      // comparison this was refused, permanently, for every writer.
      expect(written!.people).toEqual([
        owner,
        { id: 'user-Ty1p1IcRealAccountUid', name: 'point to' },
      ]);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('still catches a REAL drop on a bill that also has bare ids', async () => {
      // Normalization must not become a blanket amnesty.
      stored = {
        ownerId: 'owner-uid',
        people: [owner, { id: 'bareShadowUid', name: 'Shadow' }, charlie],
        participantIds: ['owner-uid', 'bareShadowUid', 'charlie-uid'],
        members: [],
        settledPersonIds: [],
      };

      await billService.updateBill('bill-1', {
        people: [owner, { id: 'user-bareShadowUid', name: 'Shadow' }],
      });

      expect(written!.people).toBeUndefined();
      expect(String(errorSpy.mock.calls[0][0])).toMatch(/user-charlie-uid/);
    });
  });

  describe('deliberate removal', () => {
    it('replaces the array as asked when allowPeopleRemoval is passed', async () => {
      // `handleRemovePerson`, event conversion, SimpleTransactionWizard.
      await billService.updateBill('bill-1', { people: [owner] }, { allowPeopleRemoval: true });

      expect(written!.people).toEqual([owner]);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('re-derives participantIds on a deliberate removal', async () => {
      await billService.updateBill('bill-1', { people: [owner] }, { allowPeopleRemoval: true });

      // participantIds is a union and is never pruned, so charlie stays —
      // this is why an orphan uid is NOT by itself evidence of corruption.
      expect(written!.participantIds).toEqual(expect.arrayContaining(['owner-uid', 'charlie-uid']));
    });
  });

  describe('writes that are not a shrink at all', () => {
    it('ALLOWS an additive write with no flag, and unions participantIds', async () => {
      const dave: Person = { id: 'user-dave-uid', name: 'Dave' };

      await billService.updateBill('bill-1', { people: [owner, charlie, dave] });

      expect(written!.people).toEqual([owner, charlie, dave]);
      expect(written!.participantIds).toEqual(
        expect.arrayContaining(['owner-uid', 'charlie-uid', 'dave-uid']),
      );
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('ALLOWS a reorder or a rename that keeps every id', async () => {
      // Ids are the identity; `handleUpdatePerson` renames in place.
      await billService.updateBill('bill-1', {
        people: [{ ...charlie, name: 'Charles' }, owner],
      });

      expect(written!.people).toHaveLength(2);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('does not fire on a bill that has no people yet', async () => {
      stored = { ownerId: 'owner-uid', people: [], participantIds: [], members: [] };

      await billService.updateBill('bill-1', { people: [owner] });

      expect(written!.people).toEqual([owner]);
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('reports peopleStripped: false when the people write is accepted', async () => {
      const dave: Person = { id: 'user-dave-uid', name: 'Dave' };

      const result = await billService.updateBill('bill-1', {
        people: [owner, charlie, dave],
      });

      expect(result).toEqual({ peopleStripped: false });
    });

    it('reports peopleStripped: false for a deliberate removal', async () => {
      const result = await billService.updateBill(
        'bill-1',
        { people: [owner] },
        { allowPeopleRemoval: true },
      );

      expect(result).toEqual({ peopleStripped: false });
    });

    it('leaves writes that do not touch people alone', async () => {
      // These take the non-transactional branch entirely.
      await billService.updateBill('bill-1', { splitEvenly: true });

      expect(written!.splitEvenly).toBe(true);
      expect(written!.people).toBeUndefined();
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
