import { useCallback, useMemo, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useNavigationType,
  type NavigateFunction,
  type Location,
} from "react-router-dom";

/**
 * Where to send the user when they leave a screen they navigated into.
 *
 * A bill is reachable from the bills list, a friend's balances page, an event,
 * a squad, and the global create dialog — but every wizard used to exit to a
 * hardcoded destination, so entering from /balances/:uid and pressing Done
 * dumped you on /bills. This hook resolves the real origin instead.
 *
 * Also used by event detail, squad detail and shared sessions, which had the
 * same hardcoded-back problem.
 */

export const RETURN_TO_KEY = "billReturnTo";

/** Minimal slice of the Storage API we depend on, so it can be faked in tests. */
export interface ReturnToStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Router state read on the way into a bill. */
export interface ReturnToState {
  returnTo?: string;
  [key: string]: unknown;
}

/** Context inferred from the loaded bill when no origin was recorded. */
export interface InferredContext {
  eventId?: string | null;
  squadId?: string | null;
}

const NOOP_STORAGE: ReturnToStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

function defaultStorage(): ReturnToStorage {
  try {
    return typeof sessionStorage !== "undefined"
      ? sessionStorage
      : NOOP_STORAGE;
  } catch {
    return NOOP_STORAGE;
  }
}

/**
 * Human label for the exit control, derived from the resolved destination.
 *
 * Deriving it rather than passing it separately is what keeps the button
 * honest — the previous code labelled the button "Dashboard" while navigating
 * to /bills.
 */
export function labelForPath(path: string): string {
  // /events/:id/balances/:uid matches only the /events/ prefix, so it reads as
  // "Event" — the user is inside the event. The prefixes are disjoint, so the
  // order of these checks does not matter.
  if (path.startsWith("/events/")) return "Event";
  if (path.startsWith("/balances/")) return "Balances";
  if (path.startsWith("/squads/")) return "Squad";
  if (path.startsWith("/bills")) return "Bills";
  return "Home";
}

/**
 * Resolution ladder: explicit origin → persisted origin → inferred → dashboard.
 *
 * Pure: this runs inside a useMemo (during render), so it only reads. The write
 * lives in rememberOrigin, called from navigateWithOrigin in an event handler.
 *
 * The persisted tier is load-bearing, not an optimization. AIScanView runs
 * `navigate('.', { replace: true, state: {} })` and swaps `/bill/new` for
 * `/bill/{realId}` with `{ replace: true }` and no state, both of which wipe
 * the origin from router state mid-flow. The stored copy survives that, and a
 * page reload.
 *
 * The storage key is deliberately NOT per-bill: the id changes from "new" to
 * the real Firestore id during that same swap, so a per-bill key would be
 * written and read under different names. Every entry point stamps the key on
 * the way in, and shouldDropInheritedOrigin discards it on any entry we did
 * not stamp, so a stale value cannot leak between flows.
 */
export function resolveReturnTo(
  state: ReturnToState | null | undefined,
  inferred: InferredContext,
  storage: ReturnToStorage = defaultStorage(),
  currentPath?: string,
): string {
  // A candidate equal to where we already are is not an exit — navigating to
  // it is a no-op, which leaves the user stuck on a control that appears
  // broken. This is reachable: open a bill from /events/e1 (stamping
  // "/events/e1"), leave via hardware back so goBack never clears the key, and
  // /events/e1 would otherwise resolve its own origin to itself.
  const usable = (candidate: string | null | undefined): candidate is string =>
    typeof candidate === "string" &&
    candidate.length > 0 &&
    candidate !== currentPath;

  const explicit = state?.returnTo;
  if (usable(explicit)) return explicit;

  try {
    const stored = storage.getItem(RETURN_TO_KEY);
    if (usable(stored)) return stored;
  } catch {
    // ignore — fall through to inference
  }

  const event = inferred.eventId ? `/events/${inferred.eventId}` : null;
  if (usable(event)) return event;

  const squad = inferred.squadId ? `/squads/${inferred.squadId}` : null;
  if (usable(squad)) return squad;

  return currentPath === "/dashboard" ? "/" : "/dashboard";
}

/**
 * Whether an origin left in storage by an earlier bill must be discarded.
 *
 * True for a push that carries no origin — an entry point we don't control,
 * such as the Capacitor deep-link handler's bare navigate(path). goBack clears
 * the key on a normal exit, but leaving via hardware back does not, so without
 * this the next deep-linked bill would adopt a stale origin.
 *
 * Deliberately false for REPLACE and POP: the JIT bill-id swap and page
 * reloads arrive that way and genuinely depend on the stored origin.
 */
export function shouldDropInheritedOrigin(
  navigationType: string,
  state: ReturnToState | null | undefined,
): boolean {
  return navigationType === "PUSH" && !state?.returnTo;
}

/** What leaving a bill should do. */
export type ExitAction =
  /** Pop the stack — the origin really is the previous entry. */
  | { type: "pop" }
  /** Nothing to pop to (cold deep link, reload): go there directly. */
  | { type: "replace"; to: string };

/**
 * Wraps an action so it runs at most once.
 *
 * Exiting must be one-shot. Done handlers await a Firestore write before
 * leaving, and the button is not disabled during that window in every wizard,
 * so a double-tap fires the handler twice. That was harmless when exits were
 * absolute paths (navigating to the same place twice), but a second pop
 * discards an EXTRA history entry and on Android can back the user clean out
 * of the app.
 *
 * Extracted from the hook so the guard can be tested without a DOM.
 */
export function createOneShot(): (action: () => void) => void {
  let spent = false;
  return (action: () => void) => {
    if (spent) return;
    spent = true;
    action();
  };
}

/**
 * Whether an origin was actually recorded for this visit, as opposed to being
 * guessed from the bill or defaulted to the dashboard.
 */
export function hasRecordedOrigin(
  state: ReturnToState | null | undefined,
  storage: ReturnToStorage = defaultStorage(),
  currentPath?: string,
): boolean {
  const usable = (c: string | null | undefined) =>
    typeof c === "string" && c.length > 0 && c !== currentPath;
  if (usable(state?.returnTo)) return true;
  try {
    return usable(storage.getItem(RETURN_TO_KEY));
  } catch {
    return false;
  }
}

/**
 * Pure exit decision, extracted so it can be tested without a DOM.
 *
 * Popping keeps the history stack clean and makes an in-app back button behave
 * identically to hardware/swipe back — but it is only safe when we RECORDED
 * the origin. If the origin was merely inferred, we don't know what is actually
 * behind us, and it may be a screen that redirects straight back here:
 * JoinSession pushes to /shared/:id and then auto-redirects members back to it,
 * so popping there traps the user in a bounce loop.
 *
 * Hence: pop only for a recorded origin reached by a push; otherwise navigate
 * to the resolved destination explicitly.
 */
export function chooseExitAction(
  arrivedViaPush: boolean,
  returnTo: string,
  originIsRecorded = true,
): ExitAction {
  return arrivedViaPush && originIsRecorded
    ? { type: "pop" }
    : { type: "replace", to: returnTo };
}

/**
 * Stamps the current location as the origin before navigating.
 *
 * Entry points call this instead of `navigate` so a new one can't silently
 * forget to record where the user came from. Used for bills, recurring bills,
 * shared sessions, events and squads — anywhere the destination has a back or
 * done control wired to useReturnTo.
 */
export function rememberOrigin(
  origin: string,
  storage: ReturnToStorage = defaultStorage(),
): void {
  try {
    storage.setItem(RETURN_TO_KEY, origin);
  } catch {
    // Private mode / quota failures are non-fatal: the origin still rides
    // along in router state, we just lose it across a reload.
  }
}

/**
 * Forget any recorded origin.
 *
 * For flows that leave a screen WITHOUT going through goBack — a save that
 * navigates somewhere specific, or an external redirect. Without this the key
 * outlives its flow and a later screen inherits an origin that was never its own.
 */
export function clearOrigin(storage: ReturnToStorage = defaultStorage()): void {
  try {
    storage.removeItem(RETURN_TO_KEY);
  } catch {
    // ignore
  }
}

export function navigateWithOrigin(
  navigate: NavigateFunction,
  location: Pick<Location, "pathname" | "search">,
  path: string,
  extraState?: Record<string, unknown>,
  storage: ReturnToStorage = defaultStorage(),
): void {
  const origin = `${location.pathname}${location.search}`;
  // Persist here, in an event handler, rather than during the destination's
  // render. The stored copy is what survives the JIT bill-id swap and reloads,
  // which wipe router state.
  rememberOrigin(origin, storage);
  navigate(path, {
    state: { ...extraState, returnTo: origin },
  });
}

export function useReturnTo(inferred: InferredContext = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  const { eventId, squadId } = inferred;

  // Captured once per mount: whether we arrived via a push, meaning the origin
  // is genuinely the previous history entry. A ref, not state — React Router
  // reports POP after the in-place `replace` navigations the bill flow does,
  // which would otherwise flip this mid-session and strand us on the wrong
  // strategy.
  const arrivedViaPush = useRef(navigationType === "PUSH");

  // A push that carries no origin is an entry point we don't control — the
  // Capacitor deep-link handler (App.tsx) does a bare navigate(path) into a
  // bill. Any origin still in storage belongs to an *earlier* bill (goBack
  // clears the key, but leaving via hardware back does not), so inheriting it
  // would resolve, and label, the wrong destination. Drop it once per mount,
  // before the resolve below reads storage.
  //
  // Deliberately scoped to PUSH: the JIT id swap and a page reload arrive as
  // REPLACE/POP, and those genuinely do need the stored origin.
  // Exiting is one-shot per mount — see createOneShot for why.
  const exitOnce = useRef(createOneShot()).current;

  const staleOriginChecked = useRef(false);
  if (!staleOriginChecked.current) {
    staleOriginChecked.current = true;
    if (
      shouldDropInheritedOrigin(
        navigationType,
        location.state as ReturnToState | null,
      )
    ) {
      try {
        defaultStorage().removeItem(RETURN_TO_KEY);
      } catch {
        // ignore
      }
    }
  }

  const currentPath = `${location.pathname}${location.search}`;

  const returnTo = useMemo(
    () =>
      resolveReturnTo(
        location.state as ReturnToState | null,
        { eventId, squadId },
        defaultStorage(),
        currentPath,
      ),
    [location.state, eventId, squadId, currentPath],
  );

  const label = useMemo(() => labelForPath(returnTo), [returnTo]);

  // Whether the origin was recorded rather than guessed. Recomputed alongside
  // returnTo so the two can never disagree about which value is in play.
  const originIsRecorded = useMemo(
    () =>
      hasRecordedOrigin(
        location.state as ReturnToState | null,
        defaultStorage(),
        currentPath,
      ),
    [location.state, currentPath],
  );

  const goBack = useCallback(() => {
    exitOnce(() => {
      try {
        defaultStorage().removeItem(RETURN_TO_KEY);
      } catch {
        // ignore
      }
      const action = chooseExitAction(
        arrivedViaPush.current,
        returnTo,
        originIsRecorded,
      );
      if (action.type === "pop") {
        navigate(-1);
      } else {
        navigate(action.to, { replace: true });
      }
    });
  }, [exitOnce, navigate, returnTo, originIsRecorded]);

  return { returnTo, label, goBack };
}
