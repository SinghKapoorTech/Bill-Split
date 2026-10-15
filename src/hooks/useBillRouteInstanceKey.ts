import { useState } from 'react';
import { useLocation, useNavigationType, useParams } from 'react-router-dom';

/**
 * A React `key` for a `<prefix>/:billId` page, so every bill gets a fresh
 * page + wizard instance.
 *
 * Each `bill/:billId`, `airbnb/:billId` and `transaction/:billId` route is ONE
 * element, so moving between bills (e.g. /airbnb/X -> /airbnb/new) re-renders
 * the SAME instance — and the wizards seed their editor state only at mount
 * (`useState(initial…)`). A "new" bill therefore kept the previous bill's data.
 *
 * The key changes when:
 * - the bill id changes, or
 * - a new (PUSH) navigation lands on `new` while already on `new`. SimpleTransaction
 *   saves its draft with `history.replaceState`, which the router never sees,
 *   so its route stays `/transaction/new` even after the draft exists.
 *
 * It does NOT change when a draft is JIT-created and the URL swaps
 * `new -> <id>` with DRAFT_CREATED_NAV_STATE: a remount there would discard an
 * in-progress scan / entry. Detect that by the flag, never by `replace` —
 * `useReturnTo.goBack()` also replaces.
 *
 * Adjust-state-during-render: React re-renders before committing children, so
 * the old instance never renders against the new route.
 */
export function useBillRouteInstanceKey(): number {
  const { billId: routeBillId } = useParams<{ billId: string }>();
  const location = useLocation();
  const navigationType = useNavigationType();
  const billId = routeBillId === 'new' ? undefined : routeBillId;
  const [prev, setPrev] = useState({ billId, locationKey: location.key });
  const [instanceKey, setInstanceKey] = useState(0);

  const billChanged = billId !== prev.billId;
  // PUSH only: a same-URL REPLACE on `new` (e.g. clearing nav state) is not
  // a new bill and must not wipe in-progress entry.
  const newToNew =
    billId === undefined &&
    prev.billId === undefined &&
    location.key !== prev.locationKey &&
    navigationType === 'PUSH';

  if (billChanged || location.key !== prev.locationKey) {
    setPrev({ billId, locationKey: location.key });
    const isDraftBeingCreated =
      prev.billId === undefined &&
      billId !== undefined &&
      (location.state as { draftCreated?: boolean } | null)?.draftCreated === true;
    if ((billChanged && !isDraftBeingCreated) || newToNew) {
      setInstanceKey((k) => k + 1);
    }
  }

  return instanceKey;
}
