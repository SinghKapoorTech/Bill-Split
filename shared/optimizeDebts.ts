/**
 * Shared debt optimization algorithms.
 * Single source of truth used by both the client app and Cloud Functions.
 * Pure functions — no Firebase, no browser APIs.
 */

export interface OptimizedDebt {
  fromUserId: string;
  toUserId: string;
  amount: number;
}

/**
 * Greedy debt simplification algorithm (net-balance based).
 * Minimizes the number of payment transactions needed to settle all debts.
 *
 * WARNING: This collapses all debts into net positions and redistributes,
 * which can reassign debts to uninvolved parties. Use `simplifyDebts` for
 * event balances where pair-level accuracy matters.
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

/**
 * Cycle-elimination debt simplification.
 * Preserves pair-level accuracy: only removes debts when a true cycle exists
 * (e.g. A→B→C→A all cancel out). Never reassigns debts to uninvolved parties.
 *
 * Takes an array of directed debts and returns a simplified list.
 */
export function simplifyDebts(debts: OptimizedDebt[]): OptimizedDebt[] {
  // Step 1: Build adjacency map, netting opposing directions.
  // Key: "fromUserId -> toUserId", always stored with the net direction.
  const edgeMap = new Map<string, Map<string, number>>();

  const getOrCreate = (from: string): Map<string, number> => {
    let m = edgeMap.get(from);
    if (!m) { m = new Map(); edgeMap.set(from, m); }
    return m;
  };

  for (const { fromUserId, toUserId, amount } of debts) {
    if (amount < 0.01 || fromUserId === toUserId) continue;

    // Check if there's an opposing edge
    const reverseAmount = edgeMap.get(toUserId)?.get(fromUserId) ?? 0;

    if (reverseAmount > 0.01) {
      // Net opposing edges
      if (reverseAmount > amount + 0.01) {
        // Reverse edge is larger — reduce it
        getOrCreate(toUserId).set(fromUserId, parseFloat((reverseAmount - amount).toFixed(2)));
      } else if (amount > reverseAmount + 0.01) {
        // Forward edge is larger — remove reverse, add net forward
        edgeMap.get(toUserId)!.delete(fromUserId);
        getOrCreate(fromUserId).set(toUserId, parseFloat((amount - reverseAmount).toFixed(2)));
      } else {
        // Equal — both cancel out
        edgeMap.get(toUserId)!.delete(fromUserId);
      }
    } else {
      // No opposing edge — add or accumulate
      const existing = edgeMap.get(fromUserId)?.get(toUserId) ?? 0;
      getOrCreate(fromUserId).set(toUserId, parseFloat((existing + amount).toFixed(2)));
    }
  }

  // Step 2: Eliminate cycles using DFS.
  // Repeat until no cycles remain.
  let foundCycle = true;
  while (foundCycle) {
    foundCycle = false;

    // Get all nodes that have outgoing edges
    const nodes = new Set<string>();
    for (const [from, targets] of edgeMap) {
      for (const [to, amt] of targets) {
        if (amt > 0.01) {
          nodes.add(from);
          nodes.add(to);
        }
      }
    }

    // DFS to find a cycle
    for (const startNode of nodes) {
      const path: string[] = [];
      const visited = new Set<string>();

      const cycle = findCycle(startNode, startNode, path, visited, edgeMap);
      if (cycle) {
        // Find minimum edge in cycle
        let minAmount = Infinity;
        for (let k = 0; k < cycle.length - 1; k++) {
          const amt = edgeMap.get(cycle[k])?.get(cycle[k + 1]) ?? 0;
          if (amt < minAmount) minAmount = amt;
        }

        // Subtract min from all edges in cycle, remove zero edges
        for (let k = 0; k < cycle.length - 1; k++) {
          const from = cycle[k];
          const to = cycle[k + 1];
          const current = edgeMap.get(from)?.get(to) ?? 0;
          const newAmt = parseFloat((current - minAmount).toFixed(2));
          if (newAmt < 0.01) {
            edgeMap.get(from)?.delete(to);
          } else {
            edgeMap.get(from)!.set(to, newAmt);
          }
        }

        foundCycle = true;
        break; // Restart search after eliminating one cycle
      }
    }
  }

  // Step 3: Collect remaining edges
  const result: OptimizedDebt[] = [];
  for (const [from, targets] of edgeMap) {
    for (const [to, amount] of targets) {
      if (amount > 0.01) {
        result.push({ fromUserId: from, toUserId: to, amount: parseFloat(amount.toFixed(2)) });
      }
    }
  }

  // Sort by amount descending for consistent display
  result.sort((a, b) => b.amount - a.amount);
  return result;
}

/**
 * DFS helper to find a cycle starting and ending at `target`.
 * Returns the cycle path (including start and end node) or null.
 */
function findCycle(
  current: string,
  target: string,
  path: string[],
  visited: Set<string>,
  edgeMap: Map<string, Map<string, number>>
): string[] | null {
  path.push(current);
  visited.add(current);

  const neighbors = edgeMap.get(current);
  if (neighbors) {
    for (const [next, amt] of neighbors) {
      if (amt < 0.01) continue;

      if (next === target && path.length > 1) {
        // Found a cycle back to start
        return [...path, target];
      }

      if (!visited.has(next)) {
        const result = findCycle(next, target, path, visited, edgeMap);
        if (result) return result;
      }
    }
  }

  path.pop();
  visited.delete(current);
  return null;
}
