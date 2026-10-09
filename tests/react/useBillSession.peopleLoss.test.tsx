/**
 * The people-loss WRITE race (distinct from the people-loss ADD race already
 * covered by `usePeopleManager.race.test.tsx`).
 *
 * Symptom (user-visible, live in prod): add a guest to a bill and they can
 * silently vanish server-side. The owner is then charged the full total and
 * `ledgerProcessor` REVERSES the guest's share from `processedBalances`.
 *
 * Mechanism under test — `useBillSession.executeSave`:
 *
 *   1. `isDraft` is `!billId && !activeSession?.id` — "we do not know an id yet".
 *   2. While that is true the payload gets `people` (a WHOLE-ARRAY REPLACE) and
 *      `status: 'draft'`, because a brand-new draft must be created with its
 *      people or it would be created empty. That intent is correct.
 *   3. But the payload is CAPTURED there, and `performSaveAndSwap` then
 *      `await`s `pendingDraftCreation.current` before writing. By the time it
 *      writes, the bill EXISTS and a guest may have been added to it.
 *   4. The captured pre-guest array lands on the real document and erases them.
 *
 * So the decision "include people" is made at CAPTURE time from `isDraft`,
 * while the write it guards happens at an arbitrarily later moment. The fix
 * must re-decide at WRITE time from `actualTargetId`.
 *
 * This needs a real render loop plus hand-controlled promise ordering: the
 * defect is entirely about which writes are in flight when the creation
 * resolves, which no pure test of the same logic can express.
 *
 * Not an e2e test on purpose. `e2e/settle-bill.spec.ts` catches this bug 5/5 on
 * macOS, but a 90-second browser run is a poor regression test for a write
 * race — it proves the symptom, not the ordering, and it cannot pin WHICH
 * write lost the guest. This test fails on the ordering itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import type { Person } from '@/types';
import type { Bill } from '@/types/bill.types';

// --- Leaf mocks. Keep Firebase and the router out; nothing else is needed. ---
vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

import { useBillSession } from '@/components/bill-wizard/hooks/useBillSession';

const OWNER_UID = 'owner-uid';
const owner: Person = { id: `user-${OWNER_UID}`, name: 'Owner' };
const charlie: Person = { id: 'user-charlie-uid', name: 'Charlie' };

const billData = {
  items: [
    { id: 'item-1', name: 'Pizza', price: 45 },
    { id: 'item-2', name: 'Pasta', price: 45 },
  ],
  subtotal: 90,
  tax: 0,
  tip: 0,
  otherFees: 0,
  total: 90,
};

/** Every `saveSession` call, in order, exactly as the hook emitted it. */
type SaveCall = {
  data: Partial<Bill> & { status?: string };
  id?: string;
  /** false for the harness's own simulated `persistPeopleAddition` write. */
  viaHook: boolean;
};

let saves: SaveCall[];
/** Resolves the in-flight draft CREATION, handing back the new bill id. */
let finishCreation: (id: string) => void;

/**
 * Mirrors the wizard's ownership contract: the PARENT owns `people` and the
 * bill id, and `useBillSession` auto-saves whatever it is handed.
 *
 * `bump` changes `currentStep`, which is what the hook's step-change effect
 * watches — the same trigger the real wizard uses, rather than poking
 * `executeSave` directly.
 */
function Harness() {
  const [people, setPeople] = useState<Person[]>([owner]);
  const [step, setStep] = useState(0);
  const [billId, setBillId] = useState<string | undefined>(undefined);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({
    'item-1': [owner.id],
    'item-2': [owner.id],
  });
  const [paidBy, setPaidBy] = useState(owner.id);

  const saveSession = (data: Partial<Bill>, id?: string) => {
    saves.push({ data, id, viaHook: true });
    if (!id) {
      // A creation: stays in flight until the test resolves it, which is the
      // whole race window.
      return new Promise<string>((res) => {
        finishCreation = res;
      });
    }
    return Promise.resolve(id);
  };

  const session = useBillSession({
    billData,
    people,
    itemAssignments: assignments,
    // splitEvenly must be true or the hook omits itemAssignments entirely.
    splitEvenly: true,
    currentStep: step,
    title: 'Dinner',
    activeSession: null,
    billId,
    paidById: paidBy,
    saveSession,
  });

  return (
    <div>
      <button onClick={() => setStep((s) => s + 1)}>bump</button>
      {/* What `persistPeopleAddition` does: add the guest locally AND write
          the merged array straight to the known bill id. */}
      <button
        onClick={() => {
          setPeople([owner, charlie]);
          // Split-evenly widens every item to the new person, and the user can
          // also hand the bill to them — both are whole-value replaces.
          setAssignments({
            'item-1': [owner.id, charlie.id],
            'item-2': [owner.id, charlie.id],
          });
          setPaidBy(charlie.id);
          // Recorded directly: this stands in for `persistPeopleAddition`,
          // which is NOT the hook under test. Tagging it keeps the
          // assertions below about the HOOK's writes only.
          saves.push({
            data: { people: [owner, charlie] },
            id: 'bill-1',
            viaHook: false,
          });
        }}
      >
        add-charlie
      </button>
      <button onClick={() => setBillId('bill-1')}>learn-id</button>
      <button onClick={() => session.executeSave()}>save</button>
    </div>
  );
}

const click = async (label: string) => {
  await act(async () => {
    screen.getByText(label).click();
  });
};

/** The hook ignores saves for its first 200ms (`isInitializing`). */
const settleInit = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 250));
  });
};

const peopleWrites = () => saves.filter((s) => s.data.people !== undefined);
const nameOf = (s: SaveCall) => (s.data.people ?? []).map((p) => p.name);

describe('useBillSession — a draft payload committing after the bill exists', () => {
  beforeEach(() => {
    saves = [];
    vi.clearAllMocks();
  });

  it('never replaces people on an EXISTING bill with a pre-guest array', async () => {
    render(<Harness />);
    await settleInit();

    // 1. First auto-save on a true draft. This one legitimately carries
    //    `people` because it is the creation. It stays in flight.
    await click('bump');
    expect(saves).toHaveLength(1);
    expect(saves[0].id).toBeUndefined();
    expect(nameOf(saves[0])).toEqual(['Owner']);

    // 2. A SECOND auto-save fires while the creation is still in flight, so
    //    `isDraft` is still true and it captures `people: [Owner]` too. It
    //    will now park on `await pendingDraftCreation.current`.
    await click('bump');

    // 3. The guest lands. In prod this is `persistPeopleAddition` writing the
    //    merged array to the id the creation just returned.
    await click('learn-id');
    await click('add-charlie');
    expect(nameOf(saves[saves.length - 1])).toEqual(['Owner', 'Charlie']);

    // 4. The creation resolves. The parked save from step 2 now flushes its
    //    captured payload at the REAL bill — this is the moment of loss.
    await act(async () => {
      finishCreation('bill-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    // ── The invariant, stated strictly ──
    // Only a CREATION (id undefined) may carry `people` at all. Asserting the
    // weaker "it didn't drop Charlie" let a mutant survive: with the payload
    // rebuilt at write time, an illegal update-with-people still carries the
    // FRESH array, so it looks harmless while the `!actualTargetId` guard is
    // actually broken. Pin the shape, not just the symptom.
    const hookPeopleWrites = peopleWrites().filter((s) => s.viaHook);
    const illegal = hookPeopleWrites.filter((s) => s.id !== undefined);
    expect(
      illegal.map((s) => ({ id: s.id, people: nameOf(s) })),
      'the hook sent a people array to a bill that already exists — people is a whole-array replace, so this is the deletion vector',
    ).toEqual([]);

    // And the creation itself must still carry everyone.
    const creations = hookPeopleWrites.filter((s) => s.id === undefined);
    expect(creations.length).toBeGreaterThan(0);

    // And the last word on the document must still include the guest.
    // The last word on the document must still include the guest.
    expect(nameOf(peopleWrites()[peopleWrites().length - 1])).toContain('Charlie');
  });

  it('never commits a STALE itemAssignments or paidById either', async () => {
    // The sibling-field half of the same bug. Keeping `people` correct is not
    // enough: `calculatePersonTotals` gives a participant with no assignments
    // $0, so a stale `itemAssignments` reverses their share just as surely —
    // and a stale `paidById` flips the creditor anchor, inverting the
    // DIRECTION of every debt on the bill.
    render(<Harness />);
    await settleInit();

    await click('bump'); // creation, in flight, captures owner-only assignments
    await click('bump'); // parks on the creation, capturing them again
    await click('learn-id');
    await click('add-charlie'); // widens assignments, moves the payer

    await act(async () => {
      finishCreation('bill-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    const assignmentWrites = saves.filter(
      (s) => s.id !== undefined && s.data.itemAssignments !== undefined,
    );
    for (const w of assignmentWrites) {
      const assigned = w.data.itemAssignments as Record<string, string[]>;
      expect(
        assigned['item-1'],
        `an existing bill got assignments ${JSON.stringify(assigned)} — Charlie unassigned, so his share reverses`,
      ).toContain(charlie.id);
    }

    const payerWrites = saves.filter(
      (s) => s.id !== undefined && s.data.paidById !== undefined,
    );
    for (const w of payerWrites) {
      expect(
        w.data.paidById,
        'an existing bill got a stale paidById — this inverts every debt',
      ).toBe(charlie.id);
    }
  });

  it('never reverts status to draft on an EXISTING bill', async () => {
    render(<Harness />);
    await settleInit();

    await click('bump'); // creation, in flight
    await click('bump'); // captured while isDraft -> carries status:'draft'
    await click('learn-id');

    await act(async () => {
      finishCreation('bill-1');
      await new Promise((r) => setTimeout(r, 0));
    });

    // Same capture-vs-write bug, different field: this is what stranded bills
    // at step 0/1 after they had already been completed.
    const reverted = saves.filter((s) => s.id !== undefined && s.data.status === 'draft');
    expect(reverted, 'an existing bill was pushed back to status:draft by a stale payload').toEqual(
      [],
    );
  });
});
