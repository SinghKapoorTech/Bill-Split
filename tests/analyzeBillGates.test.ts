/**
 * Coverage for the parts of `analyzeBill` that decide whether a scan failed and
 * why: the receipt-amount extraction gate, and the outcome classification of a
 * value thrown out of the Gemini call.
 *
 * WHY THIS TEST IS SHAPED LIKE THIS: the gate lives inside
 * `functions/src/index.ts`, which cannot be imported from any suite — it calls
 * `initializeApp()` at module load and pulls in `firebase-admin`, which is not
 * a root dependency at all (only `functions/node_modules` has it). The
 * integration suite cannot import it either: `helpers/env.ts` has already
 * initialized the default app, so a second `initializeApp()` throws
 * `app/duplicate-app`.
 *
 * The predicate now lives in `shared/receiptAmounts.ts` and is imported directly.
 * Only the WIRING assertions below still read the source, because `index.ts`
 * cannot be imported (it initializes firebase-admin at module load).
 * That is unusual, and the repo has precedent for it (`callableNames.test.ts`
 * is pure source analysis over the same file). What it proves is real —
 * `Infinity` is rejected — and what it does not prove is the wiring: that the
 * predicate is applied to all four fields, and applied before `otherFees` is
 * derived from them. Those two are covered structurally below, which is the
 * honest limit of what is reachable without importing the module.
 *
 * The structural assertions are a stopgap for that, not a pattern to copy
 * and import it.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import {
  MAX_RECEIPT_AMOUNT,
  isPersistableAmount,
  isPersistableItemPrice,
  itemSumIsCoherent,
  ITEM_SUM_FLOOR,
} from '@shared/receiptAmounts';

const SOURCE = readFileSync(path.resolve(__dirname, '..', 'functions/src/index.ts'), 'utf8');

describe('analyzeBill amount gate', () => {
  const ceiling = MAX_RECEIPT_AMOUNT;

  it('accepts the amounts a real receipt produces', () => {
    for (const value of [0, 0.01, 4.5, 68.99, 1234.56]) {
      expect(isPersistableAmount(value)).toBe(true);
    }
  });

  it('rejects Infinity — the case `typeof === "number"` let through', () => {
    // Reachable straight off the model: JSON.parse('{"total":1e400}') is
    // Infinity. It passed the old gate, so the scan counted as a SUCCESS,
    // resetting the failure streak to 0 and handing the client a bill that
    // Firestore then refuses to persist.
    expect(JSON.parse('{"total":1e400}').total).toBe(Infinity);
    expect(typeof JSON.parse('{"total":1e400}').total).toBe('number');
    expect(isPersistableAmount(Infinity)).toBe(false);
    expect(isPersistableAmount(-Infinity)).toBe(false);
  });

  it('rejects NaN', () => {
    expect(isPersistableAmount(NaN)).toBe(false);
  });

  it('rejects negative amounts', () => {
    expect(isPersistableAmount(-0.01)).toBe(false);
    expect(isPersistableAmount(-50)).toBe(false);
  });

  it('rejects absurd magnitudes at the ceiling boundary', () => {
    expect(ceiling).toBeGreaterThan(10_000);
    expect(isPersistableAmount(ceiling)).toBe(true);
    expect(isPersistableAmount(ceiling + 1)).toBe(false);
    expect(isPersistableAmount(1e15)).toBe(false);
  });

  it('rejects non-numbers', () => {
    for (const value of ['12.00', null, undefined, {}, []]) {
      expect(isPersistableAmount(value)).toBe(false);
    }
  });

  it('does not throw on a model answer that poisons String()', () => {
    // JSON.parse('{"total":{"toString":1}}') is an object whose own toString is
    // not callable, so `String(value)` raises "Cannot convert object to
    // primitive value". The predicate must reject it, not blow up.
    const hostile = JSON.parse('{"total":{"toString":1}}').total;
    expect(() => String(hostile)).toThrow();
    expect(() => isPersistableAmount(hostile)).not.toThrow();
    expect(isPersistableAmount(hostile)).toBe(false);
  });
});

describe('item price gate', () => {
  it('accepts a negative price so comps and discounts still scan', () => {
    expect(isPersistableItemPrice(-5)).toBe(true);
  });

  it('rejects Infinity, NaN and absurd magnitudes', () => {
    expect(isPersistableItemPrice(Infinity)).toBe(false);
    expect(isPersistableItemPrice(NaN)).toBe(false);
    expect(isPersistableItemPrice(MAX_RECEIPT_AMOUNT + 1)).toBe(false);
    expect(isPersistableItemPrice(-(MAX_RECEIPT_AMOUNT + 1))).toBe(false);
  });

  it('rejects non-numbers', () => {
    expect(isPersistableItemPrice('5')).toBe(false);
    expect(isPersistableItemPrice(null)).toBe(false);
  });
});

describe('item name gate', () => {
  it('rejects a non-string name that a bare truthiness check would pass', () => {
    // `!{}` and `![]` are both false, so these reached Firestore and rendered
    // as "[object Object]" in the Venmo note.
    const block = SOURCE.slice(
      SOURCE.indexOf('// Validate each item has required fields'),
      SOURCE.indexOf('// Normalize tip field'),
    );
    expect(block).toContain("typeof item.name !== 'string'");
    expect(block).not.toMatch(/\n\s*!item\.name \|\|/);
  });
});

describe('item sum coherence', () => {
  it('accepts a normal receipt where items sum to about the subtotal', () => {
    expect(itemSumIsCoherent(58.5, 68.99)).toBe(true);
  });

  it('accepts partial extraction, where the model missed lines', () => {
    expect(itemSumIsCoherent(20, 68.99)).toBe(true);
  });

  it('accepts a total-level discount, where items exceed the total a little', () => {
    // Burger 20 + Burger 20 = 40 items, total 30 after an un-itemised discount.
    expect(itemSumIsCoherent(40, 30)).toBe(true);
  });

  it('REJECTS a hallucinated magnitude on a small receipt', () => {
    // The finding: every per-field bound passes, but person totals come from
    // the item list, so this is what the user would actually be charged.
    expect(itemSumIsCoherent(999_999 + 68.99, 68.99)).toBe(false);
  });

  it('rejects non-finite inputs rather than passing them through', () => {
    expect(itemSumIsCoherent(Infinity, 50)).toBe(false);
    expect(itemSumIsCoherent(NaN, 50)).toBe(false);
    expect(itemSumIsCoherent(50, Infinity)).toBe(false);
  });

  it('does not trip on tiny bills, where the floor dominates', () => {
    expect(itemSumIsCoherent(ITEM_SUM_FLOOR, 0)).toBe(true);
    expect(itemSumIsCoherent(ITEM_SUM_FLOOR + 1, 0)).toBe(false);
  });
});

describe('item sum coherence wiring', () => {
  it('runs the coherence check inside analyzeBill', () => {
    expect(SOURCE).toContain('itemSumIsCoherent(itemSum, billData.total)');
    expect(SOURCE).toContain('ExtractionError');
  });
});

describe('analyzeBill amount gate wiring', () => {
  it('applies the predicate to all four totals', () => {
    const block = SOURCE.slice(
      SOURCE.indexOf('const amounts: Array<[string, unknown]>'),
      SOURCE.indexOf('billData.otherFees = parseFloat('),
    );
    expect(block).not.toBe('');
    for (const field of ['subtotal', 'tax', 'tip', 'total']) {
      expect(block).toContain(`['${field}', billData.${field}]`);
    }
    expect(block).toContain('!isPersistableAmount(value)');
  });

  it('throws ExtractionError, not a bare error, so the failure streak advances', () => {
    // The classification is the point: an unusable amount is evidence about the
    // photo and must count toward the guidance, not be swallowed as a success.
    const block = SOURCE.slice(
      SOURCE.indexOf('const unusable = amounts.filter'),
      SOURCE.indexOf('billData.otherFees = parseFloat('),
    );
    expect(block).toContain('throw new ExtractionError(');
  });

  it('renders only the TYPE of a non-numeric field in the error message', () => {
    // `String(value)` here would throw for the object above — escaping the
    // ExtractionError and getting reclassified as an infrastructure failure,
    // inverting the classification this gate exists to get right. It would also
    // echo an unbounded model-controlled string back to the client.
    const code = SOURCE.slice(
      SOURCE.indexOf('const unusable = amounts.filter'),
      SOURCE.indexOf('billData.otherFees = parseFloat('),
    )
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    expect(code).toContain("typeof value === 'number' ? value : typeof value");
    expect(code).not.toContain('String(value)');
  });

  it('runs the gate BEFORE otherFees is derived from those same values', () => {
    // Order is load-bearing: `(Infinity).toFixed(2)` is the string "Infinity",
    // which parseFloat turns back into Infinity, so a gate placed after the
    // derivation leaves otherFees poisoned even when it is tightened.
    const gateAt = SOURCE.indexOf('const unusable = amounts.filter');
    const deriveAt = SOURCE.indexOf('billData.otherFees = parseFloat(');
    expect(gateAt).toBeGreaterThan(-1);
    expect(deriveAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(deriveAt);
  });

  it('routes item prices through the shared predicate', () => {
    // The predicate's BEHAVIOUR is covered for real in the 'item price gate'
    // block above, which imports and calls it. All that is left to assert
    // structurally is that analyzeBill actually uses it rather than carrying a
    // second, drifting copy of the rule.
    const block = SOURCE.slice(
      SOURCE.indexOf('// Validate each item has required fields'),
      SOURCE.indexOf('// Normalize tip field'),
    );
    expect(block).toContain('isPersistableItemPrice(item.price)');
    expect(block).not.toContain('typeof item.price');
  });
});

describe('analyzeBill failure classification wiring', () => {
  it('classifies a non-ExtractionError throw by status instead of assuming transport', () => {
    // classifyThrownScanError itself is unit-tested in scanFailureStreak.test.ts.
    // What is only checkable here is that analyzeBill actually calls it: the old
    // code hardcoded 'infrastructure-failure', so a Gemini 400 about our own
    // image left the streak frozen and the photo guidance unreachable.
    expect(SOURCE).toMatch(
      /import \{[^}]*classifyThrownScanError[^}]*\}\s*from\s*'\.\.\/\.\.\/shared\/scanFailureStreak\.js'/,
    );
    expect(SOURCE).toContain(
      "error instanceof ExtractionError ? 'extraction-failure' : classifyThrownScanError(error)",
    );
    expect(SOURCE).not.toContain(
      "error instanceof ExtractionError ? 'extraction-failure' : 'infrastructure-failure'",
    );
  });
});

/**
 * The `details` payload on the two `resource-exhausted` throws in `index.ts`.
 *
 * Source-text assertions for the same reason as every other `wiring` block in
 * this file: `index.ts` calls `initializeApp()` at module load and cannot be
 * imported from any suite. What this proves is narrow but real — that both
 * throws pass a `details` argument and that the two carry DIFFERENT reasons.
 * What it cannot prove is the runtime shape; `shared/capErrors.ts` is unit
 * tested directly, and the group-cap equivalent is asserted for real (against a
 * thrown HttpsError) in `tests/integration/groupCapAndQuota.int.test.ts`.
 */
describe('cap error details wiring', () => {
  it('the monthly quota throw carries scan-quota details built from the decision', () => {
    expect(SOURCE).toMatch(/reason:\s*'scan-quota'/);
    // Built from the decision the gate actually made, never from module
    // constants — the same class of bug the rate-limiter message had, where the
    // sentence promised 30 while the limit in force was 10.
    expect(SOURCE).toMatch(/used:\s*decision\.used/);
    expect(SOURCE).toMatch(/limit:\s*decision\.limit/);
    expect(SOURCE).toMatch(/resetsAtMs:\s*decision\.resetsAtMs/);
  });

  it('the hourly limiter throw is tagged as a rate limit, NOT a quota', () => {
    // These three conditions share the `resource-exhausted` code. If the
    // limiter ever borrowed the quota's reason, every "slow down" would render
    // as an upgrade wall — shown to Pro subscribers, who are also rate limited.
    expect(SOURCE).toMatch(/reason:\s*'scan-rate-limit'/);
    expect(SOURCE).toMatch(/retryAfterMs:\s*rate\.retryAfterMs/);
  });

  it('every resource-exhausted throw in the file carries a details argument', () => {
    // Guards against a fourth cap being added later with no payload, which
    // would silently fall back to prose-parsing on the client.
    const throws = SOURCE.match(/new HttpsError\(\s*'resource-exhausted'/g) ?? [];
    expect(throws.length).toBeGreaterThanOrEqual(2);
    const reasons = SOURCE.match(/reason:\s*'[a-z-]+'/g) ?? [];
    expect(reasons.length).toBe(throws.length);
  });
});

/**
 * "A failed scan never consumes quota" (spec §4.3.1), pinned STRUCTURALLY.
 *
 * This is the property the two-step check/commit design exists to provide, and
 * it is entirely a matter of ORDERING inside `analyzeBill`: every route that
 * rejects a receipt must return or throw before `commitScanQuotaUsage` runs.
 * Nothing in the type system enforces that. A refactor that hoisted the commit
 * next to the check -- the obvious "tidy up" -- would charge users for failures
 * and no unit test would notice, because both halves would still work perfectly
 * in isolation.
 *
 * `tests/integration/groupCapAndQuota.int.test.ts` proves the MECHANISM against
 * a real Firestore (a checked-but-uncommitted scan costs nothing). This proves
 * the WIRING, which is the half that can rot.
 */
describe('scan quota is consumed on the success path only', () => {
  const idx = (needle: string) => SOURCE.indexOf(needle);

  it('commits exactly once, and only on the success path', () => {
    const commits = SOURCE.match(/await commitScanQuotaUsage\(/g) ?? [];
    expect(commits.length).toBe(1);
  });

  it('every receipt-validation rejection happens BEFORE the commit', () => {
    const commitAt = idx('await commitScanQuotaUsage(');
    expect(commitAt).toBeGreaterThan(-1);

    // Receipt validation rejects via ExtractionError, which the catch block
    // classifies. If any of these ever moved below the commit, the user would
    // pay a scan for a receipt the server itself judged unusable.
    const throws = [...SOURCE.matchAll(/throw new ExtractionError\(/g)].map((m) => m.index ?? -1);
    expect(throws.length).toBeGreaterThanOrEqual(7);
    for (const at of throws) {
      expect(at).toBeLessThan(commitAt);
    }
  });

  it('the commit is the last statement before the success return', () => {
    // Guards the other direction: work inserted between the commit and the
    // return could throw AFTER the scan was charged, producing the exact
    // "paid for nothing" outcome from the user's side.
    const commitAt = idx('await commitScanQuotaUsage(');
    const returnAt = SOURCE.indexOf('return billData;', commitAt);
    expect(returnAt).toBeGreaterThan(commitAt);

    const between = SOURCE.slice(commitAt, returnAt);
    expect(between).not.toMatch(/\bawait\s+(?!commitScanQuotaUsage)/);
  });

  it('the quota is skipped rather than committed when it was never checked', () => {
    // `quota` is null for unlimited plans and when the check failed open.
    // Committing a null decision would either throw or invent a period.
    expect(SOURCE).toMatch(/if \(quota\) \{\s*await commitScanQuotaUsage\(uid, quota\);/);
  });
});
