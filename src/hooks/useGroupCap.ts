import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMonetizationConfig } from '@/hooks/useMonetizationConfig';
import { useEntitlement } from '@/hooks/useEntitlement';
import { isEventArchived, type ArchivableEvent } from '@shared/eventArchive';
import { groupDisclosure } from '@/utils/quotaDisclosure';

/** The only shape this hook needs — deliberately not `TripEvent`. */
export interface CappableEvent extends ArchivableEvent {
  ownerId?: string;
}

export interface GroupCapSnapshot {
  /** Active events the signed-in user OWNS. */
  activeCount: number;
  /** The cap in force, from Remote Config. */
  limit: number;
  /**
   * True only when a FREE user has genuinely reached the limit, enforcement is
   * ON, and everything has settled. See the docblock: this is the field a
   * "disable Create group" check reaches for, so every mute has to be in it.
   */
  atCap: boolean;
  /** Ready-to-render copy for the cap, or '' when nothing should be shown. */
  text: string;
  /** True when the plan lifts the cap entirely. */
  unlimited: boolean;
  /** True while the event list, the config, or auth is still resolving. */
  loading: boolean;
}

/**
 * The active owned-group cap.
 *
 * Takes the events array the caller already subscribes to (`useEventManager`)
 * rather than opening a second listener — the list is per-user and small, and a
 * duplicate subscription would just be another thing to keep in sync.
 *
 * ⚠️ COUNT BY SUBTRACTION, NEVER `archived === false`. Every event created
 * before the archive feature shipped has NO `archived` field, and an equality
 * filter does not match a document that is missing it. Counting that way
 * silently UNDER-counts and lets a user past the cap — `shared/eventArchive.ts`
 * documents the same trap for the server-side count. `isEventArchived` is the
 * single predicate both sides share: absence means active, and only a literal
 * `true` archives.
 *
 * Ownership matters too: being a member of someone else's group costs nothing.
 * The cap is on groups you CREATE.
 *
 * THE DECISION IS DELEGATED TO `groupDisclosure`, NOT RE-IMPLEMENTED. That is
 * the point: `atCap` is the field a Phase 3 "disable Create group" check will
 * reach for, so every mute the pure evaluator applies has to be inside it.
 *
 * This hook previously open-coded `activeCount >= limit` and lost a term each
 * time one was added. The version before this one honoured `unlimited` but not
 * `paywall_enabled` — so while the kill switch was OFF (the dark-launch state
 * prod is in RIGHT NOW, and the documented rollback in plan step 8.5) a free
 * user at two groups got a dead Create button with NO explanatory copy, because
 * `groupDisclosure` correctly muted the text while the hook's own boolean did
 * not. Broken with no explanation, and the server would have served the request:
 * `functions/src/eventFunctions.ts:118` is `allowed: !wouldBlock ||
 * !paywallEnabled`. Flipping the switch off would not have made the wall go
 * away, which is the one emergency control this feature has.
 *
 * Calling the shared evaluator is also what makes the plan's acceptance
 * criterion literally true — the client renders from the SAME pure function the
 * server's decision is derived from, rather than a lookalike.
 *
 * `atCap` IS FALSE WHILE ANYTHING IS LOADING. This is a pre-action courtesy,
 * not the gate — the server refuses over-cap creation regardless, and the cap
 * error carries the payload that draws the wall. Blocking the create button for
 * a user whose event list simply has not arrived yet is the unrecoverable
 * direction; letting one extra request reach a server that will refuse it is
 * not.
 */
export function useGroupCap(
  events: readonly CappableEvent[] | null | undefined,
  eventsLoading = false,
): GroupCapSnapshot {
  const { user } = useAuth();
  const uid = user?.uid;
  const { freeActiveGroups, paywallEnabled, loading: configLoading } = useMonetizationConfig();
  const { unlimited, loading: entitlementLoading } = useEntitlement();

  const activeCount = useMemo(() => {
    if (!uid || !events) return 0;
    return events.filter((e) => e.ownerId === uid && !isEventArchived(e)).length;
  }, [events, uid]);

  // `undefined` = auth unresolved; `null` = resolved and signed out. Only the
  // first is still loading.
  const loading = user === undefined || eventsLoading || configLoading || entitlementLoading;

  const disclosure = groupDisclosure({
    unlimited,
    paywallEnabled,
    activeCount,
    limit: freeActiveGroups,
    loading,
  });

  return {
    activeCount,
    limit: freeActiveGroups,
    atCap: disclosure.atCap,
    text: disclosure.text,
    unlimited,
    loading,
  };
}
