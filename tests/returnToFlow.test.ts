import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveReturnTo,
  chooseExitAction,
  hasRecordedOrigin,
  shouldDropInheritedOrigin,
  labelForPath,
  navigateWithOrigin,
  RETURN_TO_KEY,
  type ReturnToStorage,
  type InferredContext,
} from "@/hooks/useReturnTo";

/**
 * End-to-end flow tests for bill return navigation.
 *
 * These model the actual user journeys through a minimal fake router, rather
 * than testing resolveReturnTo in isolation. The point is to answer "does
 * leaving a bill land the user where they started", including the awkward
 * paths where the app wipes router state mid-flow.
 *
 * There is no jsdom in this project (vitest environment is 'node'), so the
 * React hook itself is not exercised — but every decision the hook makes is
 * delegated to the pure functions used here.
 */

interface Entry {
  pathname: string;
  search: string;
  state: Record<string, unknown> | null;
}

/** Minimal stand-in for the browser history + React Router's navigate. */
class FakeRouter {
  stack: Entry[] = [];

  constructor(start: string) {
    this.stack.push({ pathname: start, search: "", state: null });
  }

  get current(): Entry {
    return this.stack[this.stack.length - 1];
  }

  /** Mirrors react-router's navigate(path, { replace, state }) and navigate(-1). */
  navigate = (
    to: string | number,
    opts?: { replace?: boolean; state?: Record<string, unknown> },
  ) => {
    if (typeof to === "number") {
      if (to !== -1) throw new Error("only navigate(-1) is modelled");
      if (this.stack.length === 1) {
        // Nothing behind us: in a real app this leaves the site/app entirely.
        this.stack.pop();
        return;
      }
      this.stack.pop();
      return;
    }
    const entry: Entry = {
      pathname: to,
      search: "",
      state: opts?.state ?? null,
    };
    if (opts?.replace) this.stack[this.stack.length - 1] = entry;
    else this.stack.push(entry);
  };

  /** True when the current entry was pushed onto something (react-router PUSH). */
  get arrivedViaPush(): boolean {
    return this.lastWasPush;
  }
  lastWasPush = false;

  pushInto(path: string, state?: Record<string, unknown>) {
    this.navigate(path, { state });
    this.lastWasPush = true;
  }

  replaceInPlace(path: string, state?: Record<string, unknown>) {
    this.navigate(path, { replace: true, state });
    // A replace does not change whether the *entry* was originally pushed.
  }
}

function memStorage(): ReturnToStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/**
 * Simulates the wizard resolving its exit destination and the user pressing
 * Done. Returns the pathname the user ends up on.
 */
function pressDone(
  router: FakeRouter,
  storage: ReturnToStorage,
  inferred: InferredContext = {},
): { landedOn: string | undefined; label: string } {
  const returnTo = resolveReturnTo(
    router.current.state as { returnTo?: string } | null,
    inferred,
    storage,
  );
  const label = labelForPath(returnTo);
  const action = chooseExitAction(
    router.arrivedViaPush,
    returnTo,
    hasRecordedOrigin(router.current.state as { returnTo?: string } | null, storage),
  );
  if (action.type === "pop") router.navigate(-1);
  else router.navigate(action.to, { replace: true });
  return { landedOn: router.current?.pathname, label };
}

describe("bill return navigation — user journeys", () => {
  let storage: ReturnToStorage;
  beforeEach(() => {
    storage = memStorage();
  });

  it("returns to the balances page it was opened from (the reported bug)", () => {
    // Previously this landed on /bills regardless of origin.
    const router = new FakeRouter("/balances/acfpmOnKZThGQyPX2elo9lirRgD2");
    navigateWithOrigin(router.navigate, router.current, "/bill/b1", undefined, storage);
    router.lastWasPush = true;

    const { landedOn, label } = pressDone(router, storage);

    expect(landedOn).toBe("/balances/acfpmOnKZThGQyPX2elo9lirRgD2");
    expect(label).toBe("Balances");
  });

  it("returns to the event it was opened from", () => {
    const router = new FakeRouter("/events/e1");
    navigateWithOrigin(router.navigate, router.current, "/bill/b1", {
      targetEventId: "e1",
      targetEventName: "Vegas",
    });
    router.lastWasPush = true;

    const { landedOn, label } = pressDone(router, storage, { eventId: "e1" });

    expect(landedOn).toBe("/events/e1");
    expect(label).toBe("Event");
  });

  it("returns to the bills list it was opened from", () => {
    const router = new FakeRouter("/bills");
    navigateWithOrigin(router.navigate, router.current, "/bill/b1", undefined, storage);
    router.lastWasPush = true;

    expect(pressDone(router, storage).landedOn).toBe("/bills");
  });

  it("returns to the squad it was opened from", () => {
    const router = new FakeRouter("/squads/s1");
    navigateWithOrigin(router.navigate, router.current, "/bill/b1", {
      targetSquadId: "s1",
    });
    router.lastWasPush = true;

    const { landedOn, label } = pressDone(router, storage, { squadId: "s1" });
    expect(landedOn).toBe("/squads/s1");
    expect(label).toBe("Squad");
  });

  it("survives the JIT bill-creation swap that wipes router state", () => {
    // The hard path: AIScanView replaces /bill/new with /bill/{realId} and
    // clears state, and separately runs navigate('.', { state: {} }).
    // Without the sessionStorage persist, the origin is lost here.
    const router = new FakeRouter("/events/e1");
    navigateWithOrigin(
      router.navigate,
      router.current,
      "/bill/new",
      { targetEventId: "e1", targetEventName: "Vegas" },
      storage,
    );
    router.lastWasPush = true;

    // AIScanView clears nav state, then swaps in the real bill id.
    router.replaceInPlace("/bill/new", {});
    router.replaceInPlace("/bill/realBillId123", undefined);

    expect(router.current.state).toBeFalsy(); // state really is gone

    // Assert the RESOLUTION, not just where the pop happens to land. A pop
    // reaches /events/e1 even with the origin lost, which would let a broken
    // persistence layer pass unnoticed.
    expect(resolveReturnTo(null, {}, storage)).toBe("/events/e1");

    expect(pressDone(router, storage, {}).landedOn).toBe("/events/e1");
  });

  it("still returns to the event after a reload following the JIT swap", () => {
    // Where persistence is genuinely load-bearing: after a reload there is
    // nothing to pop to, so the stored origin is the only surviving record.
    const router = new FakeRouter("/events/e1");
    navigateWithOrigin(
      router.navigate,
      router.current,
      "/bill/new",
      { targetEventId: "e1" },
      storage,
    );
    router.lastWasPush = true;
    router.replaceInPlace("/bill/realBillId123", undefined);

    // Reload: fresh history, no push, no router state — only sessionStorage.
    const reloaded = new FakeRouter("/bill/realBillId123");
    reloaded.lastWasPush = false;

    expect(pressDone(reloaded, storage, {}).landedOn).toBe("/events/e1");
  });

  it("falls back to the bill's own event on a cold deep link", () => {
    // Fresh app launch straight into a bill: no push, no stored origin.
    const router = new FakeRouter("/bill/b1");
    router.lastWasPush = false;

    const { landedOn } = pressDone(router, storage, { eventId: "e1" });
    expect(landedOn).toBe("/events/e1");
  });

  it("falls back to the dashboard on a cold deep link with no context", () => {
    const router = new FakeRouter("/bill/b1");
    router.lastWasPush = false;

    const { landedOn } = pressDone(router, storage, {});
    expect(landedOn).toBe("/dashboard");
  });

  it("does not exit the app when there is nothing to pop to", () => {
    // A cold link must never call navigate(-1), which would leave the app.
    const router = new FakeRouter("/bill/b1");
    router.lastWasPush = false;

    const action = chooseExitAction(router.arrivedViaPush, "/dashboard");
    expect(action).toEqual({ type: "replace", to: "/dashboard" });

    pressDone(router, storage, {});
    expect(router.stack.length).toBeGreaterThan(0); // still inside the app
  });

  it("pops rather than pushing, so Done matches hardware back", () => {
    // Done must not grow the stack — otherwise hardware back after Done
    // would walk the user back into the bill they just left.
    const router = new FakeRouter("/events/e1");
    navigateWithOrigin(router.navigate, router.current, "/bill/b1", undefined, storage);
    router.lastWasPush = true;
    const depthInBill = router.stack.length;

    pressDone(router, storage, { eventId: "e1" });

    expect(router.stack.length).toBe(depthInBill - 1);
    expect(router.current.pathname).toBe("/events/e1");
  });

  it("does not inherit a stale origin on a deep link into a bill", () => {
    // App.tsx's DeepLinkHandler does a bare navigate(path) with no origin.
    // If an earlier bill left a key behind (user exited via hardware back, so
    // goBack never ran), the deep-linked bill must not adopt it — otherwise
    // the exit label names a screen the user never came from.
    storage.setItem(RETURN_TO_KEY, "/balances/staleUser");

    // Exercise the real predicate the hook uses.
    expect(shouldDropInheritedOrigin("PUSH", null)).toBe(true);
    if (shouldDropInheritedOrigin("PUSH", null))
      storage.removeItem(RETURN_TO_KEY);

    const resolved = resolveReturnTo(null, { eventId: "e1" }, storage);
    expect(resolved).toBe("/events/e1");
    expect(labelForPath(resolved)).toBe("Event");
  });

  it("keeps the stored origin on a reload, which is not a push", () => {
    // The guard above must not fire here, or reload-after-JIT-swap breaks.
    storage.setItem(RETURN_TO_KEY, "/events/e1");

    expect(shouldDropInheritedOrigin("POP", null)).toBe(false);
    expect(shouldDropInheritedOrigin("REPLACE", null)).toBe(false);
    if (shouldDropInheritedOrigin("POP", null))
      storage.removeItem(RETURN_TO_KEY);

    expect(resolveReturnTo(null, {}, storage)).toBe("/events/e1");
  });

  it("keeps the origin on a push that we stamped ourselves", () => {
    expect(
      shouldDropInheritedOrigin("PUSH", { returnTo: "/balances/u1" }),
    ).toBe(false);
  });


  it("returns a shared bill to the balances page it was opened from", () => {
    // /shared/:id is reached via navigateWithOrigin from BillsView, EventDetailView
    // and BalanceDetailView when the viewer is not the bill owner.
    const router = new FakeRouter("/balances/u1");
    navigateWithOrigin(
      router.navigate,
      router.current,
      "/shared/EnCgYHPMFUCdh9xKmBru",
      undefined,
      storage,
    );
    router.lastWasPush = true;

    expect(pressDone(router, storage).landedOn).toBe("/balances/u1");
  });

  it("does not pop into a redirector when the origin was never recorded", () => {
    // JoinSession pushes to /shared/:id with no origin, then auto-redirects
    // members back to it. Popping would bounce the user and trap them.
    const router = new FakeRouter("/join/EnCgYHPMFUCdh9xKmBru");
    router.navigate("/shared/EnCgYHPMFUCdh9xKmBru");
    router.lastWasPush = true;

    expect(hasRecordedOrigin(null, storage)).toBe(false);

    const { landedOn } = pressDone(router, storage, {});
    expect(landedOn).toBe("/dashboard");
    expect(landedOn).not.toBe("/join/EnCgYHPMFUCdh9xKmBru");
  });

  it("still pops when the origin WAS recorded", () => {
    // The guard must not disable popping for genuine in-app navigation.
    const router = new FakeRouter("/events/e1");
    navigateWithOrigin(router.navigate, router.current, "/bill/b1", undefined, storage);
    router.lastWasPush = true;
    const depth = router.stack.length;

    pressDone(router, storage, {});
    expect(router.stack.length).toBe(depth - 1);
  });


  it("returns an event to the dashboard it was opened from", () => {
    // Previously EventDetailView's back was hardcoded to /events, so reaching
    // an event from anywhere else and pressing back lost your place.
    const router = new FakeRouter("/dashboard");
    navigateWithOrigin(router.navigate, router.current, "/events/e1", undefined, storage);
    router.lastWasPush = true;

    expect(pressDone(router, storage).landedOn).toBe("/dashboard");
  });

  it("returns an event to the events list when that is where you came from", () => {
    const router = new FakeRouter("/events");
    navigateWithOrigin(router.navigate, router.current, "/events/e1", undefined, storage);
    router.lastWasPush = true;

    expect(pressDone(router, storage).landedOn).toBe("/events");
  });

  it("returns a squad to where it was opened from", () => {
    const router = new FakeRouter("/dashboard");
    navigateWithOrigin(router.navigate, router.current, "/squads/s1", undefined, storage);
    router.lastWasPush = true;

    expect(pressDone(router, storage).landedOn).toBe("/dashboard");
  });


  it("never resolves to the page the user is already on", () => {
    // SHIP-BLOCKER regression: open a bill from /events/e1 (stamping
    // "/events/e1"), leave via hardware back so goBack never clears the key,
    // and /events/e1 would resolve its own origin to itself. The resulting
    // replace is a no-op, the route never changes so the component never
    // unmounts, and the one-shot exit is spent — the back arrow dies.
    const storageWithSelf = memStorage();
    storageWithSelf.setItem(RETURN_TO_KEY, "/events/e1");

    const resolved = resolveReturnTo(null, {}, storageWithSelf, "/events/e1");
    expect(resolved).not.toBe("/events/e1");
    expect(resolved).toBe("/dashboard");
  });

  it("skips a self-referential inferred origin too", () => {
    const resolved = resolveReturnTo(null, { eventId: "e1" }, memStorage(), "/events/e1");
    expect(resolved).not.toBe("/events/e1");
  });

  it("does not treat a self-referential origin as recorded", () => {
    // Otherwise chooseExitAction would pop on a push, which is equally wrong.
    const st = memStorage();
    st.setItem(RETURN_TO_KEY, "/events/e1");
    expect(hasRecordedOrigin(null, st, "/events/e1")).toBe(false);
    expect(hasRecordedOrigin(null, st, "/dashboard")).toBe(true);
  });

  it("avoids a no-op even when the fallback is the current page", () => {
    expect(resolveReturnTo(null, {}, memStorage(), "/dashboard")).toBe("/");
  });

  it("still honours a genuine origin that differs from the current page", () => {
    const st = memStorage();
    st.setItem(RETURN_TO_KEY, "/events/e1");
    expect(resolveReturnTo(null, {}, st, "/bill/b1")).toBe("/events/e1");
  });

  it("preserves query strings on the origin", () => {
    const router = new FakeRouter("/balances/u1");
    router.current.search = "?tab=settled";
    navigateWithOrigin(router.navigate, router.current, "/bill/b1", undefined, storage);

    expect((router.current.state as { returnTo: string }).returnTo).toBe(
      "/balances/u1?tab=settled",
    );
  });

  it("a later bill from a different origin overwrites the stored one", () => {
    // Guards against a stale key sending the user to the wrong place.
    const first = new FakeRouter("/balances/u1");
    navigateWithOrigin(
      first.navigate,
      first.current,
      "/bill/b1",
      undefined,
      storage,
    );
    expect(storage.getItem(RETURN_TO_KEY)).toBe("/balances/u1");

    // User leaves via hardware back (goBack never runs, key is NOT cleared),
    // then opens a different bill from the events page.
    const second = new FakeRouter("/events/e9");
    navigateWithOrigin(second.navigate, second.current, "/bill/b2", undefined, storage);
    second.lastWasPush = true;

    const { landedOn } = pressDone(second, storage, {});
    expect(landedOn).toBe("/events/e9");
  });
});
