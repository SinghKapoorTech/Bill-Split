/**
 * `SimpleTransactionWizard` must NOT hand `allowPeopleRemoval` to its bulk
 * writes.
 *
 * This is a structural test, deliberately. The people guard in
 * `billService.updateBill` is only as strong as the set of callers that opt
 * out of it, and that set is invisible at runtime — a blanket opt-out on a
 * debounced autosave looks exactly like a correct call. Two adversarial review
 * rounds both landed on this wizard:
 *
 *   - It persists `people` through a `setTimeout` closure (the autosave) and
 *     through `handleComplete`, both whole-array replaces.
 *   - Its `people` is loaded ONCE in `applyBillData`, behind
 *     `hasLoadedBillId.current`, and is never re-hydrated from a snapshot. So
 *     the array it holds can be arbitrarily stale.
 *
 * Combining those with a blanket `allowPeopleRemoval` let a stale load revert
 * a concurrent change — e.g. `claimShadowUser` rewriting a person's id to
 * `user-<realUid>` after this wizard had loaded the pre-claim array. The
 * autosave would write the old array *with* permission to shrink, reverting
 * the claim, while `participantIds` unioned both uids and the ledger
 * re-animated the shadow balance.
 *
 * The contract instead: deliberate shrinks (`handleRemovePerson`,
 * `handleEventChange`) persist themselves with explicit intent, and the bulk
 * writes stay guarded. A behavioural test cannot express "this call site does
 * not pass a flag", so assert it on the source.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(
  __dirname,
  '../src/components/simple-transaction-wizard/SimpleTransactionWizard.tsx',
);
const source = readFileSync(SRC, 'utf8');

/** Strip comments so prose discussing the flag is not mistaken for a call. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('SimpleTransactionWizard — people-removal intent', () => {
  it('opts out of the guard exactly twice, and only for deliberate shrinks', () => {
    const optOuts = code.match(/allowPeopleRemoval:\s*true/g) ?? [];

    // One for handleEventChange (roster replace), one for handleRemovePerson.
    // If this count rises, a new call site took permission to delete people —
    // which is the thing that caused a production money-loss bug.
    expect(optOuts).toHaveLength(2);
  });

  it('does NOT flag the debounced autosave', () => {
    // The autosave sends `payload`, which contains `people`. It must be
    // strippable: its array comes from a setTimeout closure over state that is
    // never re-hydrated.
    // Tolerant of Prettier reflowing / adding a trailing comma: match the
    // call, then assert no options object follows `payload` before the close.
    const call = code.match(
      /updateBill\(\s*activeBillId\.current\s*,\s*payload\s*,?\s*\)/,
    );
    expect(
      call,
      'the autosave no longer calls updateBill(activeBillId.current, payload) — if this call was reshaped, re-verify it is still unflagged',
    ).not.toBeNull();
  });

  it('persists a removal itself rather than leaving it to the autosave', () => {
    // Without its own write, a local-only removal would be stripped by the
    // guard on the next autosave and would never stick.
    expect(code).toMatch(/const handleRemovePerson\s*=/);
    expect(code).toMatch(/onRemovePerson=\{handleRemovePerson\}/);
  });

  it('persists the event-roster replace itself', () => {
    const start = code.indexOf('const handleEventChange');
    const end = code.indexOf('const handleRemovePerson');

    // Fail LOUDLY rather than slicing the rest of the file. With `indexOf`
    // returning -1, `slice(-1, …)` silently yields a region that any
    // downstream `updateBill(..., { allowPeopleRemoval: true })` would satisfy
    // — the assertions below would pass while the handler had been deleted.
    expect(start, 'handleEventChange not found').toBeGreaterThan(-1);
    expect(end, 'handleRemovePerson not found').toBeGreaterThan(-1);
    expect(
      end,
      'handleRemovePerson must be declared AFTER handleEventChange, or this slice is empty and vacuous',
    ).toBeGreaterThan(start);

    const eventChange = code.slice(start, end);
    expect(eventChange).toMatch(/updateBill/);
    expect(eventChange).toMatch(/allowPeopleRemoval:\s*true/);
  });

  it('keeps the opt-outs INSIDE the two deliberate handlers', () => {
    // The count test alone cannot tell where the two opt-outs live: moving one
    // onto handleComplete keeps the count at 2 while restoring the blanket
    // opt-out and breaking removal. Pin the location of each.
    const bodyFrom = (marker: string, nextMarker: string) => {
      const a = code.indexOf(marker);
      const b = code.indexOf(nextMarker, a + 1);
      expect(a, `${marker} not found`).toBeGreaterThan(-1);
      expect(b, `${nextMarker} not found after ${marker}`).toBeGreaterThan(a);
      return code.slice(a, b);
    };

    const removeBody = bodyFrom('const handleRemovePerson', '\n  const ');
    expect(removeBody).toMatch(/allowPeopleRemoval:\s*true/);

    const eventBody = bodyFrom('const handleEventChange', '\n  const ');
    expect(eventBody).toMatch(/allowPeopleRemoval:\s*true/);
  });

  it('does NOT flag handleComplete', () => {
    const start = code.indexOf('const handleComplete');
    expect(start, 'handleComplete not found').toBeGreaterThan(-1);
    const body = code.slice(start, start + 2500);

    // handleComplete writes the whole payload including `people`; it must stay
    // strippable, because removals are already persisted by their own write.
    expect(body).not.toMatch(/allowPeopleRemoval/);
  });
});
