import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveReturnTo,
  createOneShot,
  rememberOrigin,
  clearOrigin,
  labelForPath,
  RETURN_TO_KEY,
  type ReturnToStorage,
} from "@/hooks/useReturnTo";

/**
 * In-memory stand-in for sessionStorage. The vitest environment is 'node'
 * (see vitest.config.ts — these tests are deliberately DOM-free), so storage
 * is injected rather than global.
 */
function fakeStorage(initial: Record<string, string> = {}): ReturnToStorage & {
  dump: () => Record<string, string>;
} {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    dump: () => Object.fromEntries(map),
  };
}

describe("labelForPath", () => {
  it("names each known origin", () => {
    expect(labelForPath("/events/abc")).toBe("Event");
    expect(labelForPath("/balances/xyz")).toBe("Balances");
    expect(labelForPath("/squads/s1")).toBe("Squad");
    expect(labelForPath("/bills")).toBe("Bills");
    expect(labelForPath("/dashboard")).toBe("Home");
  });

  it("falls back to Home for anything unrecognized", () => {
    expect(labelForPath("/something-else")).toBe("Home");
    expect(labelForPath("")).toBe("Home");
  });

  it("labels an event-scoped balances page as Event", () => {
    // /events/:id/balances/:uid is a real route (App.tsx:129). It only ever
    // matches the /events/ prefix, so check-order is irrelevant here — this
    // pins the resulting label, not a precedence rule.
    expect(labelForPath("/events/e1/balances/u1")).toBe("Event");
  });

  it("distinguishes a top-level balances page from an event-scoped one", () => {
    expect(labelForPath("/balances/u1")).toBe("Balances");
    expect(labelForPath("/events/e1/balances/u1")).toBe("Event");
  });
});

describe("resolveReturnTo", () => {
  let storage: ReturnType<typeof fakeStorage>;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("prefers an explicit origin", () => {
    const result = resolveReturnTo({ returnTo: "/balances/u1" }, {}, storage);
    expect(result).toBe("/balances/u1");
  });

  it("does not write storage during resolution", () => {
    // Resolution runs inside a useMemo (i.e. during render), so it must stay
    // side-effect free. Persistence belongs to rememberOrigin/navigateWithOrigin,
    // which run in event handlers.
    resolveReturnTo({ returnTo: "/balances/u1" }, {}, storage);
    expect(storage.dump()[RETURN_TO_KEY]).toBeUndefined();
  });

  it("rememberOrigin persists the origin for later reads", () => {
    rememberOrigin("/balances/u1", storage);
    expect(storage.dump()[RETURN_TO_KEY]).toBe("/balances/u1");
    expect(resolveReturnTo(null, {}, storage)).toBe("/balances/u1");
  });

  it("rememberOrigin overwrites a previous origin", () => {
    // Load-bearing: the key is global, so entering a new flow MUST replace the
    // old origin rather than leave a stale one behind. Read directly from
    // storage — asserting via resolveReturnTo would pass on explicit router
    // state and never exercise the write.
    rememberOrigin("/balances/u1", storage);
    rememberOrigin("/events/e9", storage);
    expect(storage.dump()[RETURN_TO_KEY]).toBe("/events/e9");
    expect(resolveReturnTo(null, {}, storage)).toBe("/events/e9");
  });

  it("clearOrigin forgets a recorded origin", () => {
    rememberOrigin("/balances/u1", storage);
    clearOrigin(storage);
    expect(storage.dump()[RETURN_TO_KEY]).toBeUndefined();
    expect(resolveReturnTo(null, { eventId: "e1" }, storage)).toBe("/events/e1");
  });

  it("rememberOrigin survives a hostile storage", () => {
    expect(() =>
      rememberOrigin("/x", {
        getItem: () => { throw new Error("denied"); },
        setItem: () => { throw new Error("denied"); },
        removeItem: () => { throw new Error("denied"); },
      }),
    ).not.toThrow();
  });

  it("falls back to storage when router state was wiped", () => {
    // This is the AIScanView case: navigate('.', { replace: true, state: {} })
    // and the /bill/new -> /bill/{realId} swap both drop router state.
    storage.setItem(RETURN_TO_KEY, "/balances/u1");
    expect(resolveReturnTo(null, {}, storage)).toBe("/balances/u1");
    expect(resolveReturnTo({}, {}, storage)).toBe("/balances/u1");
  });

  it("infers the event when nothing was recorded", () => {
    expect(resolveReturnTo(null, { eventId: "e1" }, storage)).toBe(
      "/events/e1",
    );
  });

  it("infers the squad when nothing was recorded", () => {
    expect(resolveReturnTo(null, { squadId: "s1" }, storage)).toBe(
      "/squads/s1",
    );
  });

  it("prefers the event over the squad when a bill somehow has both", () => {
    expect(
      resolveReturnTo(null, { eventId: "e1", squadId: "s1" }, storage),
    ).toBe("/events/e1");
  });

  it("falls back to the dashboard", () => {
    expect(resolveReturnTo(null, {}, storage)).toBe("/dashboard");
  });

  it("prefers a recorded origin over inferred context", () => {
    expect(
      resolveReturnTo({ returnTo: "/balances/u1" }, { eventId: "e1" }, storage),
    ).toBe("/balances/u1");
  });

  it("prefers a persisted origin over inferred context", () => {
    storage.setItem(RETURN_TO_KEY, "/balances/u1");
    expect(resolveReturnTo(null, { eventId: "e1" }, storage)).toBe(
      "/balances/u1",
    );
  });

  it("ignores an empty or non-string returnTo", () => {
    expect(resolveReturnTo({ returnTo: "" }, { eventId: "e1" }, storage)).toBe(
      "/events/e1",
    );
    expect(
      resolveReturnTo(
        { returnTo: 42 as unknown as string },
        { eventId: "e1" },
        storage,
      ),
    ).toBe("/events/e1");
  });

  it("ignores null/undefined inferred ids rather than building a bad path", () => {
    expect(
      resolveReturnTo(null, { eventId: null, squadId: undefined }, storage),
    ).toBe("/dashboard");
  });

  it("survives a storage that throws (private mode / quota)", () => {
    const hostile: ReturnToStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(resolveReturnTo({ returnTo: "/balances/u1" }, {}, hostile)).toBe(
      "/balances/u1",
    );
    expect(resolveReturnTo(null, { eventId: "e1" }, hostile)).toBe(
      "/events/e1",
    );
    expect(resolveReturnTo(null, {}, hostile)).toBe("/dashboard");
  });
});

describe("createOneShot", () => {
  it("runs the action exactly once no matter how many taps land", () => {
    // Double-tapping Done during the await before navigation must not fire a
    // second pop — that would discard an extra history entry and on Android
    // can back the user out of the app entirely.
    let calls = 0;
    const once = createOneShot();
    once(() => calls++);
    once(() => calls++);
    once(() => calls++);
    expect(calls).toBe(1);
  });

  it("runs the FIRST action, not a later one", () => {
    const seen: string[] = [];
    const once = createOneShot();
    once(() => seen.push("first"));
    once(() => seen.push("second"));
    expect(seen).toEqual(["first"]);
  });

  it("gives each instance its own budget", () => {
    // Two mounted wizards must not consume each other's single exit.
    let a = 0;
    let b = 0;
    const onceA = createOneShot();
    const onceB = createOneShot();
    onceA(() => a++);
    onceB(() => b++);
    onceA(() => a++);
    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it("stays spent even if the action throws", () => {
    const once = createOneShot();
    expect(() =>
      once(() => {
        throw new Error("navigation blew up");
      }),
    ).toThrow("navigation blew up");
    let ran = false;
    once(() => {
      ran = true;
    });
    expect(ran).toBe(false);
  });
});
