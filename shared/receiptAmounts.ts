/**
 * Sanity bounds for amounts extracted from a scanned receipt.
 *
 * Pure and import-free: this file is compiled into the Cloud Functions build
 * via the functions tsconfig, and is unit-tested from `tests/` (never from
 * `shared/` — a vitest import here would break that build).
 */

/**
 * Ceiling on any single amount extracted from a receipt, in dollars.
 *
 * Not a business rule — a sanity bound. It exists so a hallucinated or
 * misparsed magnitude is rejected AS AN EXTRACTION FAILURE, where it counts
 * toward the photo guidance, instead of sailing through as a "successful" scan
 * and being refused later at bill creation with an error the user cannot act
 * on. A million-dollar restaurant bill is a misread, not a meal.
 */
export const MAX_RECEIPT_AMOUNT = 1_000_000;

/**
 * True when `value` is an amount that can actually be persisted and rendered.
 *
 * `typeof value === 'number'` was the whole gate, and it is not enough:
 * `JSON.parse('{"total":1e400}')` yields Infinity, which passes that check,
 * cannot be written to Firestore, and poisons every downstream sum. NaN,
 * negatives and absurd magnitudes are the same class of problem.
 *
 * Deliberately duplicated rather than shared with the bill-amount validator
 * landing on a parallel branch (`shared/billAmountValidation.ts`): coupling
 * this gate to code that is not on `main` yet would be the worse trade.
 * Consolidate the two once that work lands.
 */
export function isPersistableAmount(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_RECEIPT_AMOUNT
  );
}

/**
 * True when `value` is a usable line-item price.
 *
 * Deliberately NOT non-negative: comped lines and discounts legitimately carry
 * a negative price, and rejecting them would fail scans of real receipts.
 */
export function isPersistableItemPrice(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_RECEIPT_AMOUNT
  );
}

/**
 * How far the summed item prices may exceed the printed total before the
 * extraction is treated as broken.
 *
 * Deliberately loose. Items normally sum to roughly the subtotal, which is at
 * or below the total, so a coherent receipt sits far under this bound even when
 * the model misses lines or a discount was applied at the total rather than as
 * a line item. The bound exists only to catch a hallucinated magnitude, which
 * misses it by orders of magnitude rather than a few percent.
 */
export const ITEM_SUM_MULTIPLIER = 2;
export const ITEM_SUM_FLOOR = 100;

/**
 * True when the item prices are consistent with the printed total.
 *
 * Per-field bounds are not enough on their own: every amount can sit under
 * MAX_RECEIPT_AMOUNT while one hallucinated item price still dominates the
 * bill. That matters because person totals are derived from the ITEM LIST, not
 * from `total` (see shared/calculations.ts) — so a single bogus item is the
 * number a user actually gets charged, and nothing downstream re-checks it
 * against the receipt.
 */
export function itemSumIsCoherent(itemsSum: number, total: number): boolean {
  if (!Number.isFinite(itemsSum) || !Number.isFinite(total)) return false;
  return itemsSum <= total * ITEM_SUM_MULTIPLIER + ITEM_SUM_FLOOR;
}
