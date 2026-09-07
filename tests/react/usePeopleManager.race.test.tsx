/**
 * The people-loss race.
 *
 * Symptom (user-visible): add a person to a bill and they can silently vanish,
 * with no error. `canProceedFromStep(1)` is `people.length > 1`, so the wizard
 * ACCEPTS the add and advances; the guest only disappears afterwards, and
 * Review shows the owner carrying the full total.
 *
 * Mechanism under test: `usePeopleManager.addPerson` awaits
 * `userService.resolveShadowUserByName` and then writes
 * `setPeople([...people, newPerson])` — where `people` is the RENDER CLOSURE
 * array, captured BEFORE the await. A Firestore snapshot landing during that
 * await replaces the parent's people array; the closure write then clobbers it
 * with pre-snapshot data.
 *
 * This needs a real React render loop: the defect is purely about which
 * render's closure is live when the promise resolves, which a pure test of the
 * same logic cannot express.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import type { Person } from '@/types';

// --- Leaf mocks: keep Firebase out, keep the pure utils real. ---------------
vi.mock('@/config/firebase', () => ({ db: {}, auth: {}, storage: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn().mockResolvedValue(undefined),
  updateDoc: vi.fn().mockResolvedValue(undefined),
  arrayUnion: vi.fn((x: unknown) => x),
  arrayRemove: vi.fn((x: unknown) => x),
  FirestoreError: class extends Error {},
}));

const OWNER_UID = 'owner-uid';
const owner: Person = { id: `user-${OWNER_UID}`, name: 'Owner', venmoId: 'owner-venmo' };
const bob: Person = { id: 'user-bob-uid', name: 'Bob' };

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: OWNER_UID, displayName: 'Owner' } }),
}));
vi.mock('@/hooks/useUserProfile', () => ({
  useUserProfile: () => ({ profile: { venmoId: 'owner-venmo' } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

// `resolveShadowUserByName` is the await that opens the race window. Deferring
// it by hand lets the test land a snapshot at the exact moment that matters.
let resolveShadowId: (id: string) => void;
vi.mock('@/services/userService', () => ({
  userService: {
    resolveShadowUserByName: vi.fn(
      () => new Promise<string>((res) => { resolveShadowId = res; }),
    ),
    getUserByContact: vi.fn(),
  },
}));

import { usePeopleManager } from '@/hooks/usePeopleManager';

/**
 * Mirrors BillWizard's ownership contract: the PARENT owns `people`, and the
 * hook mutates it through `setPeople`. `applySnapshot` stands in for the
 * Firestore listener re-deriving people from a new server document.
 */
function Harness() {
  const [people, setPeople] = useState<Person[]>([owner]);
  const manager = usePeopleManager(people, setPeople);

  return (
    <div>
      <ul data-testid="people">
        {people.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
      <button onClick={() => void manager.addPerson('Alice')}>add-alice</button>
      <button onClick={() => setPeople([owner, bob])}>apply-snapshot</button>
    </div>
  );
}

function names(): string[] {
  return Array.from(
    screen.getByTestId('people').querySelectorAll('li'),
  ).map((li) => li.textContent ?? '');
}

describe('usePeopleManager — snapshot landing mid-add', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps BOTH the just-added person and a person the snapshot brought in', async () => {
    render(<Harness />);
    expect(names()).toEqual(['Owner']);

    // 1. User adds Alice. addPerson suspends on resolveShadowUserByName.
    await act(async () => {
      screen.getByText('add-alice').click();
    });
    expect(names()).toEqual(['Owner']); // still in flight, nothing written yet

    // 2. A Firestore snapshot lands DURING the await and brings in Bob.
    await act(async () => {
      screen.getByText('apply-snapshot').click();
    });
    expect(names()).toEqual(['Owner', 'Bob']);

    // 3. The add now completes.
    await act(async () => {
      resolveShadowId('user-alice-uid');
    });

    // Nobody may be lost: Alice was added locally, Bob arrived from the server.
    expect(names()).toEqual(['Owner', 'Bob', 'Alice']);
  });
});
