import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuth } from '@/contexts/AuthContext';
import {
  resolveEffectivePlan,
  hasUnlimitedUsage,
  type EntitlementState,
  type Plan,
} from '@shared/entitlements';

export interface EntitlementSnapshot {
  /** The plan actually in force right now. */
  plan: Plan;
  /** True when the plan lifts the free-tier caps. */
  unlimited: boolean;
  /**
   * When the plan ACTUALLY IN FORCE ends, in epoch millis — not the raw document
   * field. Undefined on `free`.
   *
   * The distinction is not pedantic. Emitting `entitlement.expiresAt` verbatim
   * gets both interesting cases wrong: a trip pass resolved from
   * `tripPassExpiresAt` would report the (possibly stale) SUBSCRIPTION date, and
   * a lapsed Pro document resolves to `plan: 'free'` while still carrying a past
   * timestamp. A "Pro until {date}" line built on that is wrong in both.
   */
  expiresAt?: number;
  /** True until the first snapshot (or a definite "signed out") settles. */
  loading: boolean;
}

const FREE: Omit<EntitlementSnapshot, 'loading'> = { plan: 'free', unlimited: false };

/**
 * The expiry belonging to the plan `resolveEffectivePlan` actually chose.
 *
 * Mirrors that function's priority order deliberately: a trip pass prefers
 * `tripPassExpiresAt` when it is the field that made the pass active, and falls
 * back to `expiresAt` for the `plan: 'trip_pass'` shape.
 */
function effectiveExpiry(
  plan: Plan,
  entitlement: EntitlementState | null,
  nowMs: number,
): number | undefined {
  if (!entitlement || plan === 'free') return undefined;
  if (plan === 'pro') return entitlement.expiresAt;

  const pass = entitlement.tripPassExpiresAt;
  if (typeof pass === 'number' && pass > nowMs) return pass;
  return entitlement.expiresAt;
}

/**
 * Firestore `Timestamp` → millis, defensively.
 *
 * Duck-typed on `toMillis` rather than `instanceof Timestamp` because the value
 * crosses an SDK boundary and may also legitimately arrive as a raw number (a
 * migration, a seeded test document, a future writer). Anything else — a
 * string, null, a Timestamp whose millis are NaN — yields `undefined`, which
 * `resolveEffectivePlan` treats as "no date" and therefore as NOT active.
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
 * Live entitlement for the signed-in user.
 *
 * READ-ONLY. `entitlements/{uid}` is written exclusively by the RevenueCat
 * webhook through the Admin SDK; the security rules block every client write.
 * Nothing here should ever try to correct the document — the recovery path for
 * a lost webhook is the Phase 5 reconcile callable, not a client write.
 *
 * EVERY UNKNOWN RESOLVES TO `free`, NEVER TO A PAID PLAN — an absent document
 * (the steady state for anyone who has never purchased), a malformed one, a
 * permission error, a signed-out user. `free` is a fully working app, so this
 * direction degrades entitlement without breaking anything, while the opposite
 * would hand out the product.
 *
 * KNOWN LIMITATION — the plan is resolved against `Date.now()` at snapshot
 * time, so a subscription that expires DURING a session is not re-evaluated
 * until the next snapshot. In practice the webhook writes on expiry and that
 * write re-fires this listener. If it is ever lost, the stale value is
 * `unlimited: true`, which merely hides the quota chip: the server is still the
 * gate and refuses the scan, and the cap error carries the payload that draws
 * the wall. Deliberately not papered over with a timer here.
 *
 * TIME IS THE CLIENT'S CLOCK, unlike the server's resolution of the same
 * document. A device with its date rolled back could show itself Pro after
 * expiry; it still cannot USE anything, for the reason above.
 */
export function useEntitlement(): EntitlementSnapshot {
  const { user } = useAuth();
  const uid = user?.uid;

  const [state, setState] = useState<Omit<EntitlementSnapshot, 'loading'>>(FREE);
  // ALWAYS starts true, and only ever settles DOWN.
  //
  // It used to initialize to `user === undefined`, which is FALSE for a user who
  // is already signed in at mount — so the first committed render was
  // `{plan: free, unlimited: false, loading: false}` and a wall could paint for
  // one commit in front of a Pro subscriber. That is precisely the flash this is
  // supposed to prevent, and the effect below (which runs AFTER commit) cannot
  // get there first. Mutation-testing found the line inert: both `true` and
  // `false` passed every test.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user === undefined) {
      setState(FREE);
      setLoading(true);
      return;
    }

    if (!uid) {
      setState(FREE);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      doc(db, 'entitlements', uid),
      (snap) => {
        const raw = snap.exists() ? (snap.data() as Record<string, unknown>) : null;

        const entitlement: EntitlementState | null = raw
          ? {
              plan: typeof raw.plan === 'string' ? raw.plan : undefined,
              expiresAt: toMillis(raw.expiresAt),
              inGracePeriod: raw.inGracePeriod === true,
              tripPassExpiresAt: toMillis(raw.tripPassExpiresAt),
            }
          : null;

        const nowMs = Date.now();
        const plan = resolveEffectivePlan(entitlement, nowMs);
        setState({
          plan,
          unlimited: hasUnlimitedUsage(plan),
          expiresAt: effectiveExpiry(plan, entitlement, nowMs),
        });
        setLoading(false);
      },
      // A permission error or a dropped listener must not throw out of a render
      // tree — but it must not ASSERT `free` either.
      //
      // `onSnapshot`'s error callback is TERMINAL: the listener is gone and this
      // effect only re-runs on [uid, user]. Settling to `{free, loading: false}`
      // would therefore be durable, not a flash — and the well-known
      // permission-denied race (a listener attaching before a freshly minted ID
      // token propagates) would leave a PAYING subscriber pinned to free for the
      // rest of the session, behind a wall, with no retry.
      //
      // So we reset the value but stay LOADING, which mutes every disclosure
      // rather than making a claim we could not verify. The cost is that a free
      // user at their cap sees no chip; the server is still the gate and refuses
      // the scan, and the cap error draws the wall. Muting beats accusing.
      () => {
        setState(FREE);
      },
    );

    return unsubscribe;
  }, [uid, user]);

  return { ...state, loading };
}
