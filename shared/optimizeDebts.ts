/**
 * Shared debt optimization algorithm.
 * Single source of truth used by both the client app and Cloud Functions.
 * Pure function — no Firebase, no browser APIs.
 */

export interface OptimizedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/**
 * Greedy debt simplification algorithm.
 * Minimizes the number of payment transactions needed to settle all debts.
 *
 * Takes a map of net balances (positive = owed money, negative = owes money)
 * and returns a minimal list of directed payments.
 */
export function optimizeDebts(netBalances: Record<string, number>): OptimizedDebt[] {
  const debtors: { userId: string; amount: number }[] = [];
  const creditors: { userId: string; amount: number }[] = [];

  // Separate into debtors (negative balance) and creditors (positive balance)
  for (const [userId, balance] of Object.entries(netBalances)) {
    if (balance < -0.01) {
      debtors.push({ userId, amount: Math.abs(balance) });
    } else if (balance > 0.01) {
      creditors.push({ userId, amount: balance });
    }
  }

  // Sort descending by amount to minimize transactions
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const result: OptimizedDebt[] = [];
  let i = 0; // debtor index
  let j = 0; // creditor index

  while (i < debtors.length && j < creditors.length) {
    const settleAmount = Math.min(debtors[i].amount, creditors[j].amount);

    if (settleAmount > 0.01) {
      result.push({
        fromUserId: debtors[i].userId,
        toUserId: creditors[j].userId,
        amount: parseFloat(settleAmount.toFixed(2)),
      });
    }

    debtors[i].amount -= settleAmount;
    creditors[j].amount -= settleAmount;

    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }

  return result;
}
