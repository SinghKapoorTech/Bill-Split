import type { Bill } from '@/types/bill.types';

/** Why a bill URL failed to load. `not-found` comes from a null fetch, the rest from a rejection. */
export type BillLoadFailure = 'not-found' | 'denied' | 'offline' | 'error';

export type BillLoadResult = { status: 'loaded'; bill: Bill } | { status: BillLoadFailure };

function errorCode(err: unknown): unknown {
  return typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : undefined;
}

/** Classifies a rejected bill fetch (FirestoreError-like `{ code }` or anything else). */
export function classifyBillLoadError(err: unknown): BillLoadFailure {
  const code = errorCode(err);
  if (code === 'permission-denied') return 'denied';
  if (code === 'unavailable') return 'offline';
  if (typeof navigator !== 'undefined' && navigator?.onLine === false) return 'offline';
  return 'error';
}

/** Which error screen to show: retrying can't fix not-found/denied, it might fix the rest. */
export function billLoadErrorVariant(f: BillLoadFailure): 'unavailable' | 'offline' {
  return f === 'not-found' || f === 'denied' ? 'unavailable' : 'offline';
}
