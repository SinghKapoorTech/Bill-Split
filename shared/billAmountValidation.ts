/**
 * billAmountValidation.ts — numeric sanity gate for money-bearing bill fields.
 *
 * C-01: `item.price`, `subtotal`, `tax`, `tip`, `otherFees` and `total` flow
 * from client-written `billData` straight into ledger arithmetic. Firestore
 * stores `NaN` as a perfectly valid double, and once one reaches a balance doc
 * the pair is bricked permanently: every threshold check fails
 * (`Math.abs(NaN) < BALANCE_THRESHOLD` is false), so `processSettlement` never
 * treats the pair as settled and every later delta is `NaN - NaN = NaN`. Only
 * an admin `reconcileLedger` pass can repair it. `Infinity` and 1e308-scale
 * overflow behave identically.
 *
 * Until now the only thing keeping `NaN` out of a balance doc was the
 * `amountOwed >= 0` predicate in `calculateFriendFootprint` — false for `NaN`
 * purely by accident. D-03 replaces that predicate with a finiteness check, so
 * this validation MUST be in place alongside it.
 *
 * Pure — no Firestore, no browser APIs. Shared by client and Cloud Functions.
 */

import { BillData } from './types.js';

/**
 * Upper bound for any single money field. Well above any real bill, far below
 * the range where float64 addition starts losing cents (2^53 / 100).
 */
export const MAX_BILL_AMOUNT = 1e7;

/**
 * Validates one money field. Returns null when valid, else a human-readable
 * reason. Rejects non-numbers (a string "12.00" silently coerces in arithmetic
 * and corrupts sums), NaN/Infinity, and absurd magnitudes.
 *
 * `allowNegative` exists for LINE-ITEM PRICES ONLY, and it is not a loosening —
 * it is what the rest of the codebase already requires:
 *   - `receiptAmounts.ts:isPersistableItemPrice` is documented "Deliberately NOT
 *     non-negative: comped lines and discounts legitimately carry a negative
 *     price, and rejecting them would fail scans of real receipts."
 *   - `useReceiptAnalyzer.ts:44` filters `item.price !== 0` — NOT `> 0` — and
 *     its comment shows why dropping a discount OVER-COLLECTS: Burger $20,
 *     Burger $20, Promo -$10 against a $30 total would charge two diners $20.
 *   - commit 1dc5343 "stop dropping discount lines, which over-collected".
 *
 * An earlier revision of this file rejected every negative and claimed
 * "`useReceiptAnalyzer` keeps only `price > 0`". That claim was false, and the
 * effect was that any receipt carrying a promo line failed to save.
 *
 * AGGREGATES (subtotal/tax/tip/otherFees/total) stay strictly non-negative:
 * a discount belongs on a line, never on a total.
 *
 * The magnitude bound uses Math.abs so a huge NEGATIVE is still rejected.
 */
export function validateAmount(
  label: string,
  value: unknown,
  options: { allowNegative?: boolean } = {},
): string | null {
  if (typeof value !== 'number') {
    return `${label} must be a number (got ${typeof value})`;
  }
  if (!Number.isFinite(value)) {
    return `${label} must be finite (got ${value})`;
  }
  if (!options.allowNegative && value < 0) {
    return `${label} must not be negative (got ${value})`;
  }
  if (Math.abs(value) > MAX_BILL_AMOUNT) {
    return `${label} exceeds the maximum magnitude of ${MAX_BILL_AMOUNT} (got ${value})`;
  }
  return null;
}

/**
 * Validates every money field on a bill, including each item price.
 *
 * Missing `tax`/`tip`/`otherFees` are treated as 0 — `computeBillPersonTotals`
 * already tolerates sparse billData (`billData.tip || 0`), so requiring them
 * here would reject bills the calc engine handles fine. `subtotal` and `total`
 * are likewise optional-but-if-present-valid, since draft bills carry 0.
 *
 * @returns null when every field is sound, else the first failure reason.
 */
export function validateBillAmounts(billData: unknown): string | null {
  if (!billData || typeof billData !== 'object') {
    return 'billData is missing or not an object';
  }
  const bd = billData as Partial<BillData> & Record<string, unknown>;

  const items = bd.items;
  if (items !== undefined) {
    if (!Array.isArray(items)) return 'billData.items must be an array';
    for (let i = 0; i < items.length; i++) {
      // allowNegative: discounts and comped lines are legitimate line items.
      const reason = validateAmount(`items[${i}].price`, items[i]?.price, {
        allowNegative: true,
      });
      if (reason) return reason;
    }
  }

  for (const field of ['subtotal', 'tax', 'tip', 'otherFees', 'total'] as const) {
    if (bd[field] === undefined || bd[field] === null) continue;
    const reason = validateAmount(`billData.${field}`, bd[field]);
    if (reason) return reason;
  }

  return null;
}
