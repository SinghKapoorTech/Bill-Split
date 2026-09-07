import { useEffect, useState } from 'react';
import { checkMinimumVersion } from '@/services/minimumVersionService';
import { shouldWallNow } from '@shared/versionGate';

/**
 * How long the app will wait for the version check before rendering anyway.
 *
 * This exists to bound TWO opposite failure modes, both of which are real:
 *
 *  - Blocking indefinitely puts a network round-trip in front of every cold
 *    start. On a first launch with no cached Remote Config and a bad connection
 *    that is an unbounded white screen, to guard a condition that is false for
 *    virtually every launch.
 *  - Not waiting at all means a user on a too-old build starts using the app and
 *    gets YANKED into the wall mid-action, possibly mid-bill.
 *
 * A short wait collapses both: the check almost always resolves inside it (the
 * Remote Config value is cached locally after the first fetch, so there is no
 * network at all on later launches), and when it does not, we fail open exactly
 * as everything else in this feature does.
 */
const CHECK_TIMEOUT_MS = 1500;

export interface MinimumVersionState {
  /** True only on positive evidence the build is too old. */
  updateRequired: boolean;
  /** True while the check is still in flight AND inside the timeout budget. */
  checking: boolean;
}

/**
 * Evaluates the update wall once, at mount.
 *
 * A LATE ANSWER IS DELIBERATELY DROPPED. If the timeout wins the race, the app
 * is already on screen and the wall is no longer allowed to go up in this
 * session — see `shouldWallNow`. Honouring it would unmount the entire tree
 * under someone who had started working, and `useBillSession` clears its pending
 * debounce timer on unmount without flushing, so an in-flight bill edit would be
 * silently lost. The build is still too old; the next cold start walls it, and
 * by then nothing is in progress.
 */
export function useMinimumVersion(): MinimumVersionState {
  const [updateRequired, setUpdateRequired] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Render anyway once the budget is spent. Fail-open, like every other
    // ambiguity in this feature. `renderedRef` latches here so a late answer can
    // no longer raise the wall — a ref, not state, because the `.then` below
    // closes over this scope and must see the CURRENT value, not the value at
    // render time.
    const renderedRef = { current: false };
    const timer = setTimeout(() => {
      renderedRef.current = true;
      if (!cancelled) setChecking(false);
    }, CHECK_TIMEOUT_MS);

    checkMinimumVersion()
      .then((decision) => {
        if (cancelled) return;
        if (shouldWallNow(decision.updateRequired, renderedRef.current)) {
          setUpdateRequired(true);
        }
      })
      .catch(() => {
        // `checkMinimumVersion` is documented never to throw; this is belt and
        // braces, and it fails in the same direction as everything else — an
        // unexpected error must never wall someone out of the whole product.
        if (!cancelled) setUpdateRequired(false);
      })
      .finally(() => {
        if (!cancelled) {
          clearTimeout(timer);
          setChecking(false);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return { updateRequired, checking };
}
