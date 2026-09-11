import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useMonetizationConfig } from '@/hooks/useMonetizationConfig';
import { evaluateScanQuota, type ScanQuotaState } from '@shared/scanQuota';

export interface ScanQuotaSnapshot {
  /** Scans consumed in the CURRENT period — 0 immediately after a roll. */
  used: number;
  /** Never negative, even if a stored count exceeds a tightened limit. */
  remaining: number;
  /** The limit this was evaluated against, from Remote Config. */
  limit: number;
  /** Start of the next UTC month — the "resets Oct 1" instant. */
  resetsAtMs: number;
  /** True until BOTH the config and the first snapshot have settled. */
  loading: boolean;
}

/**
 * Firestore `Timestamp` → millis. Duck-typed on `toMillis` rather than
 * `instanceof`, and tolerant of a raw number; anything else is `undefined`,
 * which `evaluateScanQuota` reads as "no period open" and therefore a fresh
 * allowance.
 */
function toMillis(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (value && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const ms = (value as { toMillis: () => unknown }).toMillis();
    return typeof ms === 'number' && Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

/**
 * Live monthly scan quota for the signed-in user.
 *
 * ⚠️ `usage/{uid}` IS SHARED WITH THE HOURLY RATE LIMITER, in disjoint fields.
 * This hook reads ONLY `scanPeriodStart` / `scansThisPeriod`. The limiter's
 * `scanWindowStart` / `scansThisWindow` are a different mechanism entirely —
 * anti-abuse, applies to every plan, consumes a slot even on failure — and
 * mixing them would show a Pro subscriber a free-tier wall. See the table at
 * the top of `shared/scanQuota.ts`.
 *
 * READ-ONLY: the rules block every client write to this document. The count is
 * committed server-side, after a scan genuinely succeeds.
 *
 * UNUSABLE DATA GRANTS A FRESH PERIOD rather than a lockout — the direction is
 * fixed by `shared/scanQuota.ts`. The worst case is a user getting a couple of
 * extra scans in a month; failing closed would deny the product over a
 * bookkeeping glitch, and the server is still the real gate either way.
 *
 * TIME SKEW: the server evaluates the same document against SERVER time, this
 * against `Date.now()`. Only the month boundary matters and the window of
 * disagreement is minutes a year; accepted deliberately (plan, Phase 2).
 */
export function useScanQuota(): ScanQuotaSnapshot {
  const { user } = useAuth();
  const uid = user?.uid;
  const { freeScansPerMonth, loading: configLoading } = useMonetizationConfig();

  const [state, setState] = useState<ScanQuotaState | null>(null);
  // ALWAYS starts true, and only ever settles DOWN — see the same note in
  // useEntitlement. Initializing from `user === undefined` was inert AND pointed
  // the wrong way: a signed-in user got `loading: false` on the first committed
  // render, which is long enough to paint a chip reading "2 scans left" at
  // someone who has none.
  const [snapshotLoading, setSnapshotLoading] = useState(true);

  useEffect(() => {
    if (user === undefined) {
      setState(null);
      setSnapshotLoading(true);
      return;
    }

    if (!uid) {
      setState(null);
      setSnapshotLoading(false);
      return;
    }

    setSnapshotLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, 'usage', uid),
      (snap) => {
        const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : null;
        const periodStartMs = toMillis(raw?.scanPeriodStart);
        const count = raw?.scansThisPeriod;

        // Both fields must be usable together. A document carrying only one of
        // them is not a partially-used period, it is an unreadable one — and
        // `evaluateScanQuota(null, …)` is exactly the fresh-period answer.
        //
        // This is the TYPE boundary, not an extra safety net: `ScanQuotaState`
        // requires real numbers, and constructing one from unknown Firestore
        // data needs the check. `sanitize()` inside `evaluateScanQuota` rejects
        // the same values independently, so loosening this changes no
        // behaviour — mutation-testing confirms it is an equivalent mutant, and
        // no test here pretends otherwise.
        setState(
          periodStartMs !== undefined && typeof count === 'number' && Number.isFinite(count)
            ? { periodStartMs, count }
            : null,
        );
        setSnapshotLoading(false);
      },
      () => {
        setState(null);
        setSnapshotLoading(false);
      },
    );

    return unsubscribe;
  }, [uid, user]);

  // Forces a re-evaluation when the UTC month rolls. See below.
  const [tick, setTick] = useState(0);

  const decision = evaluateScanQuota(state, Date.now(), freeScansPerMonth);

  /**
   * THE WALL MUST NOT OUTLIVE ITS OWN EXPIRY.
   *
   * The decision above is computed in the render body from `Date.now()`, so it
   * only refreshes when something else re-renders. At a month boundary nothing
   * does: the `usage` document is unchanged, so no snapshot fires, and
   * `useMonetizationConfig`'s poll returns an equal config that React bails out
   * of. So without this timer the period never rolls for a mounted screen.
   *
   * That matters because the stale direction here is RESTRICTIVE, unlike
   * `useEntitlement` (whose staleness is generous and is deliberately accepted).
   * Concretely: a user in UTC-7 at 17:02 local on Sep 30 is already at 00:02 UTC
   * on Oct 1. The server has rolled their quota and will happily serve the scan,
   * while the uploader they are sitting in still reads "You've used your 2 free
   * scans this month". This is a different and much larger problem than the
   * client-vs-server clock skew noted above.
   */
  useEffect(() => {
    const msUntilReset = decision.resetsAtMs - Date.now();

    // The boundary can pass BETWEEN the render that computed `decision` and this
    // effect running. Returning bare would arm nothing and force no
    // re-evaluation, leaving the pre-roll wall up until some unrelated render.
    // Bump instead: the next pass recomputes against the new month and arms the
    // timer for it.
    //
    // UNCOVERED, and honestly so: reproducing this needs the boundary to fall
    // between a render and its own effect — a window of a few milliseconds once
    // a month. Every way of forcing it in a test ends up stubbing the clock the
    // branch reads, which proves the stub rather than the branch. Mutation-
    // testing confirms no test fails if this is reverted to a bare `return`.
    if (msUntilReset <= 0) {
      setTick((t) => t + 1);
      return;
    }

    // setTimeout overflows past ~24.8 days and fires IMMEDIATELY, which for a
    // calendar month would be a hot re-render loop rather than a late one. Clamp
    // and re-arm: each firing bumps `tick`, which re-runs this effect.
    const delay = Math.min(msUntilReset, 2_147_483_647);
    const id = setTimeout(() => setTick((t) => t + 1), delay);
    return () => clearTimeout(id);
  }, [decision.resetsAtMs, tick]);

  return {
    used: decision.used,
    remaining: decision.remaining,
    limit: decision.limit,
    resetsAtMs: decision.resetsAtMs,
    // BOTH must settle. With only the snapshot considered, a wall could be
    // drawn against the fallback limit before the real one arrives and name a
    // number the server does not enforce.
    loading: snapshotLoading || configLoading,
  };
}
