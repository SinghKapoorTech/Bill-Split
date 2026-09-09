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
/**
 * Slices out the full argument list of each `new HttpsError('<code>'` call, by
 * balancing parentheses from the opening one.
 *
 * WHY NOT A WHOLE-FILE REGEX: the first version of this block asserted
 * `SOURCE).toMatch(/reason: 'scan-quota'/)` and counted `reason:` occurrences
 * across the entire file. An adversarial review deleted the ENTIRE details
 * argument from the monthly-quota throw, left the object literal behind as dead
 * code, and all 31 tests still passed -- the product's single most important
 * paywall trigger would have shipped with no payload. The same global count
 * also broke CI when an unrelated `logger.debug(..., { reason: ... })` line was
 * added, with a failure message that named the wrong subject entirely.
 *
 * Positional slicing fixes both: an assertion about a throw now reads only that
 * throw.
 */
function httpsErrorCalls(code: string): string[] {
  const out: string[] = [];
  const marker = 'new HttpsError(';
  let from = 0;
  for (;;) {
    const at = SOURCE.indexOf(marker, from);
    if (at === -1) break;
    from = at + marker.length;

    const open = at + marker.length - 1;
    let depth = 0;
    for (let i = open; i < SOURCE.length; i++) {
      if (SOURCE[i] === '(') depth++;
      else if (SOURCE[i] === ')') {
        depth--;
        if (depth === 0) {
          const call = SOURCE.slice(open, i + 1);
          // The code is the first argument, so it sits at the head of the slice.
          // No regex here: escaping a backslash through this file reliably is
          // not worth it, and startsWith says exactly what is meant.
          if (call.slice(1).trimStart().startsWith("'" + code + "'")) out.push(call);
          break;
        }
      }
    }
  }
  return out;
}

describe('cap error details wiring', () => {
  it('finds both resource-exhausted throws', () => {
    // A sanity check on the slicer itself: if this regex ever stops matching,
    // every assertion below would pass vacuously over an empty array.
    expect(httpsErrorCalls('resource-exhausted')).toHaveLength(2);
  });

  it('the monthly quota throw carries scan-quota details built from the decision', () => {
    const call = httpsErrorCalls('resource-exhausted').find((c) => c.includes('scan-quota'));
    expect(call).toBeDefined();
    // Built from the decision the gate actually made, never from module
    // constants -- the same class of bug the rate-limiter message had, where the
    // sentence promised 30 while the limit in force was 10.
    expect(call).toMatch(/used:\s*decision\.used/);
    expect(call).toMatch(/limit:\s*decision\.limit/);
    expect(call).toMatch(/resetsAtMs:\s*decision\.resetsAtMs/);
  });

  it('the hourly limiter throw is tagged as a rate limit, NOT a quota', () => {
    const call = httpsErrorCalls('resource-exhausted').find((c) => c.includes('scan-rate-limit'));
    expect(call).toBeDefined();
    expect(call).toMatch(/retryAfterMs:\s*rate\.retryAfterMs/);
    // The distinction that matters: these two share an error code. If the
    // limiter ever borrowed the quota's reason, every "slow down" would render
    // as an upgrade wall -- shown to Pro subscribers, who are also rate limited.
    expect(call).not.toMatch(/scan-quota/);
  });

  it('EVERY resource-exhausted throw carries its own details argument', () => {
    // Guards a fourth cap being added later with no payload, which would
    // silently fall back to prose-parsing on the client. Asserted per call, so
    // an unrelated `reason:` key elsewhere in the file cannot satisfy it.
    for (const call of httpsErrorCalls('resource-exhausted')) {
      expect(call).toMatch(/reason:\s*'[a-z-]+'/);
      expect(call).toMatch(/satisfies CapErrorDetails/);
    }
  });
});

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
    // EXACT, not >=. A floor lets a validation gate be deleted outright without
    // this test noticing. Update this number deliberately when adding or
    // removing a gate — that edit is itself the review prompt.
    expect(throws.length).toBe(8);
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

    // ANY rejection here — not only an awaited one, and not only an
    // ExtractionError. An adversarial review inserted a plain synchronous
    // `throw new HttpsError('invalid-argument', ...)` immediately after the
    // commit and every test in this file still passed. What that bug does to a
    // user: on 1 of 2 scans they submit a receipt, Gemini succeeds,
    // scansThisPeriod increments to 2, the new guard throws, and they are left
    // with an error toast and no scans for the month, having received nothing.
    expect(between).not.toMatch(/\bthrow\b/);
  });

  it('the quota is skipped rather than committed when it was never checked', () => {
    // `quota` is null for unlimited plans and when the check failed open.
    // Committing a null decision would either throw or invent a period.
    expect(SOURCE).toMatch(/if \(quota\) \{\s*await commitScanQuotaUsage\(uid, quota\);/);
  });
});
