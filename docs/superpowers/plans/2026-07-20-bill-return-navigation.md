# Bill Return Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exiting a bill returns the user to the screen they entered from (event detail, balances page, squad, bills list, or dashboard) instead of a hardcoded destination.

**Architecture:** A `useReturnTo` hook resolves an exit destination from router state → sessionStorage → bill-inferred context → `/dashboard`, and exposes `goBack()` which pops history when the origin is genuinely behind us and navigates explicitly otherwise. A `navigateToBill` helper stamps the origin at every entry point so no call site can forget it.

**Tech Stack:** React 18, React Router v6 (`useLocation`, `useNavigationType`, `useNavigate`), TypeScript, Vitest.

---

## Spec

`docs/superpowers/specs/2026-07-20-bill-return-navigation-design.md`

## Deviation from spec (discovered while reading code)

The spec called for a sessionStorage key of `returnTo:{billId}`. That is **wrong** and must not be implemented:

- `AIScanView.tsx:259,269` run `navigate(`/bill/${newBillId}`, { replace: true })` with no state after JIT bill creation, wiping `returnTo` from router state.
- The same swap changes `billId` from `new` to the real Firestore ID, so a write under `returnTo:new` would be read back under `returnTo:{realId}` and miss.

**Use a single key, `billReturnTo`.** One bill flow is active at a time, and every entry point overwrites it on push.

## File Structure

| File                                                                                                    | Responsibility                                                        |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `src/hooks/useReturnTo.ts` (create)                                                                     | Resolution ladder, `goBack`, `label`, and the `navigateToBill` helper |
| `tests/useReturnTo.test.ts` (create)                                                                    | Unit tests for resolution, persistence, label derivation              |
| `src/components/shared/StepFooter.tsx` (modify)                                                         | Add optional `onExit` / `exitLabel` for desktop step 0                |
| `src/components/bill-wizard/WizardNavigation.tsx:106` (modify)                                          | Icon selection driven by label, not `=== 'Event'`                     |
| `src/components/bill-wizard/BillWizard.tsx:632-651` (modify)                                            | `handleDone` → `goBack()`                                             |
| `src/pages/AIScanView.tsx:173` (modify)                                                                 | Timeout escape → `goBack()`                                           |
| `src/components/simple-transaction-wizard/SimpleTransactionWizard.tsx:422-428,467-472,581-591` (modify) | Three hardcoded branches → `goBack()`                                 |
| `src/components/airbnb-wizard/AirbnbWizard.tsx:326-329,485-486` (modify)                                | → `goBack()`                                                          |
| `src/pages/BillsView.tsx:158-163` (modify)                                                              | Entry point stamps origin                                             |
| `src/pages/BalanceDetailView.tsx:113-136` (modify)                                                      | Entry point stamps origin (both handlers)                             |
| `src/pages/EventDetailView.tsx:265-274,317-322,438` (modify)                                            | Entry point stamps origin                                             |
| `src/pages/SquadDetailView.tsx:75-84` (modify)                                                          | Entry point stamps origin                                             |
| `src/components/layout/CreateOptionsDialog.tsx:60-63` (modify)                                          | Entry point stamps origin                                             |

---

### Task 1: `useReturnTo` hook — resolution and label

**Files:**

- Create: `src/hooks/useReturnTo.ts`
- Test: `tests/useReturnTo.test.ts`

The pure parts (`resolveReturnTo`, `labelForPath`) are exported separately from the hook so they can be unit-tested without a router.

- [ ] **Step 1: Write the failing test**

```ts
// tests/useReturnTo.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  resolveReturnTo,
  labelForPath,
  RETURN_TO_KEY,
} from "@/hooks/useReturnTo";

describe("labelForPath", () => {
  it("names each known origin", () => {
    expect(labelForPath("/events/abc")).toBe("Event");
    expect(labelForPath("/events/abc/balances/xyz")).toBe("Event");
    expect(labelForPath("/balances/xyz")).toBe("Balances");
    expect(labelForPath("/squads/s1")).toBe("Squad");
    expect(labelForPath("/bills")).toBe("Bills");
    expect(labelForPath("/dashboard")).toBe("Home");
    expect(labelForPath("/something-else")).toBe("Home");
  });
});

describe("resolveReturnTo", () => {
  beforeEach(() => sessionStorage.clear());

  it("prefers explicit router state and persists it", () => {
    const result = resolveReturnTo({ returnTo: "/balances/u1" }, {});
    expect(result).toBe("/balances/u1");
    expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe("/balances/u1");
  });

  it("falls back to sessionStorage when router state was wiped", () => {
    sessionStorage.setItem(RETURN_TO_KEY, "/balances/u1");
    expect(resolveReturnTo(null, {})).toBe("/balances/u1");
  });

  it("infers the event when nothing was recorded", () => {
    expect(resolveReturnTo(null, { eventId: "e1" })).toBe("/events/e1");
  });

  it("infers the squad when nothing was recorded", () => {
    expect(resolveReturnTo(null, { squadId: "s1" })).toBe("/squads/s1");
  });

  it("falls back to the dashboard", () => {
    expect(resolveReturnTo(null, {})).toBe("/dashboard");
  });

  it("prefers a recorded origin over inferred context", () => {
    expect(
      resolveReturnTo({ returnTo: "/balances/u1" }, { eventId: "e1" }),
    ).toBe("/balances/u1");
  });
});
```

- [ ] **Step 2: Run and confirm it fails**

Run: `npx vitest run tests/useReturnTo.test.ts`
Expected: FAIL — cannot resolve `@/hooks/useReturnTo`.

- [ ] **Step 3: Implement the pure functions plus the hook**

```ts
// src/hooks/useReturnTo.ts
import { useCallback, useMemo, useRef } from "react";
import {
  useLocation,
  useNavigate,
  useNavigationType,
  type NavigateFunction,
  type Location,
} from "react-router-dom";

export const RETURN_TO_KEY = "billReturnTo";

/** Router state we read on the way in. */
export interface ReturnToState {
  returnTo?: string;
  [key: string]: unknown;
}

/** Context inferred from the loaded bill when no origin was recorded. */
export interface InferredContext {
  eventId?: string | null;
  squadId?: string | null;
}

/** Human label for the exit control, derived from the resolved destination. */
export function labelForPath(path: string): string {
  if (path.startsWith("/events/")) return "Event";
  if (path.startsWith("/balances/")) return "Balances";
  if (path.startsWith("/squads/")) return "Squad";
  if (path.startsWith("/bills")) return "Bills";
  return "Home";
}

/**
 * Resolution ladder: explicit origin → persisted origin → inferred → dashboard.
 *
 * The persist-on-read is load-bearing. AIScanView swaps `/bill/new` for
 * `/bill/{realId}` with `{ replace: true }` and no state, which wipes the
 * router state mid-flow. Persisting on first sight is what survives that.
 * The key is deliberately NOT per-bill: the id changes during that same swap.
 */
export function resolveReturnTo(
  state: ReturnToState | null | undefined,
  inferred: InferredContext,
): string {
  const explicit = state?.returnTo;
  if (typeof explicit === "string" && explicit.length > 0) {
    try {
      sessionStorage.setItem(RETURN_TO_KEY, explicit);
    } catch {
      // Private-mode / quota failures are non-fatal; we still return the origin.
    }
    return explicit;
  }

  try {
    const stored = sessionStorage.getItem(RETURN_TO_KEY);
    if (stored) return stored;
  } catch {
    // ignore
  }

  if (inferred.eventId) return `/events/${inferred.eventId}`;
  if (inferred.squadId) return `/squads/${inferred.squadId}`;
  return "/dashboard";
}

/** Stamps the current location as the origin when navigating into a bill. */
export function navigateToBill(
  navigate: NavigateFunction,
  location: Location,
  path: string,
  extraState?: Record<string, unknown>,
): void {
  navigate(path, {
    state: {
      ...extraState,
      returnTo: `${location.pathname}${location.search}`,
    },
  });
}

export function useReturnTo(inferred: InferredContext = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  // Captured once: whether THIS mount arrived via a push. Ref, not state, so a
  // later re-render (React Router reports POP after any in-place replace)
  // cannot flip it and strand us on the wrong strategy.
  const arrivedViaPush = useRef(navigationType === "PUSH");

  const returnTo = useMemo(
    () => resolveReturnTo(location.state as ReturnToState | null, inferred),
    [location.state, inferred.eventId, inferred.squadId],
  );

  const label = useMemo(() => labelForPath(returnTo), [returnTo]);

  const goBack = useCallback(() => {
    try {
      sessionStorage.removeItem(RETURN_TO_KEY);
    } catch {
      // ignore
    }
    if (arrivedViaPush.current) {
      navigate(-1);
    } else {
      navigate(returnTo, { replace: true });
    }
  }, [navigate, returnTo]);

  return { returnTo, label, goBack };
}
```

- [ ] **Step 4: Run and confirm it passes**

Run: `npx vitest run tests/useReturnTo.test.ts`
Expected: PASS, 7 tests.

---

### Task 2: Entry points stamp the origin

**Files:** `BillsView.tsx:158-163`, `BalanceDetailView.tsx:113-136`, `EventDetailView.tsx:265-274,317-322,438`, `SquadDetailView.tsx:75-84`, `CreateOptionsDialog.tsx:60-63`

Each file already has `useNavigate`; add `useLocation` where missing and route every bill-bound `navigate` through `navigateToBill`. Existing `targetEventId` / `targetSquadId` state is passed as `extraState` so forward-context behavior is unchanged.

- [ ] **Step 1: `BillsView.tsx`**

```tsx
const handleNavigateToBill = (
  billId: string,
  isSimpleTransaction?: boolean,
  isAirbnb?: boolean,
  isOwner = true,
) => {
  const path = !isOwner
    ? `/shared/${billId}`
    : isSimpleTransaction
      ? `/transaction/${billId}`
      : isAirbnb
        ? `/airbnb/${billId}`
        : `/bill/${billId}`;
  navigateToBill(navigate, location, path);
};
```

- [ ] **Step 2: `BalanceDetailView.tsx` — both handlers**

```tsx
const billPath = (
  billId: string,
  isSimpleTransaction?: boolean,
  isAirbnb?: boolean,
  isOwner = true,
) =>
  !isOwner
    ? `/shared/${billId}`
    : isSimpleTransaction
      ? `/transaction/${billId}`
      : isAirbnb
        ? `/airbnb/${billId}`
        : `/bill/${billId}`;

const handleResumeBill = async (
  billId: string,
  isSimpleTransaction?: boolean,
  isAirbnb?: boolean,
  isOwner: boolean = true,
) => {
  await resumeSession(billId);
  navigateToBill(
    navigate,
    location,
    billPath(billId, isSimpleTransaction, isAirbnb, isOwner),
  );
};

const handleViewBill = (
  billId: string,
  isSimpleTransaction?: boolean,
  isAirbnb?: boolean,
  isOwner: boolean = true,
) => {
  navigateToBill(
    navigate,
    location,
    billPath(billId, isSimpleTransaction, isAirbnb, isOwner),
  );
};
```

- [ ] **Step 3: `EventDetailView.tsx` — pass event context as extraState**

```tsx
navigateToBill(navigate, location, path, {
  targetEventId: event.id,
  targetEventName: event.name,
});
```

Apply to `handleViewBill`, `handleResumeBill`, `handleCreateEventBill` (`/bill/new`), and the `/transaction/new` call at `:438`.

- [ ] **Step 4: `SquadDetailView.tsx`**

```tsx
navigateToBill(navigate, location, path, {
  targetSquadId: squad.id,
  targetSquadName: squad.name,
});
```

- [ ] **Step 5: `CreateOptionsDialog.tsx`**

```tsx
const handleAction = (path: string) => {
  navigateToBill(navigate, location, path, activeEventContext);
  onOpenChange(false);
};
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

---

### Task 3: Wizard exits call `goBack()`

**Files:** `BillWizard.tsx:632-651`, `AIScanView.tsx:173`, `SimpleTransactionWizard.tsx:422-428,467-472,581-591`, `AirbnbWizard.tsx:326-329,485-486`

- [ ] **Step 1: `BillWizard.tsx` — replace the branch, keep the status promotion**

```tsx
const { label: exitLabel, goBack } = useReturnTo({
  eventId: targetEventId,
  squadId: routerState?.targetSquadId,
});

const handleDone = async () => {
  // Only promote to 'active' when the user finishes the wizard (last step).
  // Early exits (step 0) should keep the bill as draft.
  if (wizard.currentStep === STEPS.length - 1) {
    const id = billId || activeSession?.id;
    if (id) {
      try {
        await billService.updateBill(id, { status: "active" });
      } catch (e) {
        console.error("Failed to mark bill as active", e);
      }
    }
  }
  goBack();
};
```

Then replace `exitLabel={targetEventId ? "Event" : "Dashboard"}` at `:846` with `exitLabel={exitLabel}`. This is what fixes the existing label/destination lie.

- [ ] **Step 2: `SimpleTransactionWizard.tsx` — all three branches**

Replace each of the three copies (`:422-428`, `:467-472`, `:581-591`) with `goBack()`, and `exitLabel={...}` at `:591` with the hook's `label`. Hook wiring:

```tsx
const { label: exitLabel, goBack } = useReturnTo({
  eventId: existingEventId ?? routerState?.targetEventId,
  squadId: existingSquadId ?? routerState?.targetSquadId,
});
```

- [ ] **Step 3: `AirbnbWizard.tsx`**

```tsx
const { label: exitLabel, goBack } = useReturnTo({ eventId: targetEventId });
```

`handleDone`'s trailing branch becomes `goBack()`; `exitLabel={targetEventId ? 'Event' : 'Dashboard'}` at `:486` becomes `exitLabel={exitLabel}`.

- [ ] **Step 4: `AIScanView.tsx:173` — timeout escape**

```tsx
onTimeout: () => goBack(),
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors.

---

### Task 4: Label-driven icon + desktop step-0 exit

**Files:** `WizardNavigation.tsx:106`, `StepFooter.tsx`

- [ ] **Step 1: `WizardNavigation.tsx` — icon follows the label**

`exitLabel === 'Event' ? <Calendar/> : <Home/>` cannot represent Balances or Squad. Replace with a lookup:

```tsx
import {
  ChevronLeft,
  ChevronRight,
  Share2,
  Check,
  Home,
  Calendar,
  Users,
  Receipt,
} from "lucide-react";

const EXIT_ICONS: Record<string, typeof Home> = {
  Event: Calendar,
  Squad: Users,
  Balances: Users,
  Bills: Receipt,
  Home: Home,
};
const ExitIcon = EXIT_ICONS[exitLabel] ?? Home;
```

and render `<ExitIcon className="w-5 h-5" />` at `:106`.

- [ ] **Step 2: `StepFooter.tsx` — add the missing desktop exit**

```tsx
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface StepFooterProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  onExit?: () => void;
  exitLabel?: string;
  completeLabel?: string;
  nextDisabled?: boolean;
}
```

In the left slot, mirror the mobile rule — exit on step 0, back thereafter:

```tsx
<div className="flex-1">
  {isFirstStep && onExit && (
    <Button variant="outline" onClick={onExit} className="gap-2">
      <ChevronLeft className="w-4 h-4" />
      <span className="hidden sm:inline">{exitLabel ?? "Back"}</span>
    </Button>
  )}
  {!isFirstStep && onBack && (
    <Button
      variant="outline"
      onClick={onBack}
      disabled={nextDisabled}
      className="gap-2"
    >
      <ChevronLeft className="w-4 h-4" />
      <span className="hidden sm:inline">Back</span>
    </Button>
  )}
</div>
```

- [ ] **Step 3: Pass `onExit` from the wizards' desktop footers**

`ReviewStep.tsx:141-147` and `DetailsStep.tsx:97` render `StepFooter`; thread `onExit={handleDone}` and `exitLabel={exitLabel}` through the same props path already used for `onComplete`.

- [ ] **Step 4: Typecheck and full unit suite**

Run: `npm run typecheck && npm test`
Expected: no new errors; all tests pass.

---

### Task 5: Verification

- [ ] **Step 1: Full check**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass.

- [ ] **Step 2: Manual QA at mobile viewport** (`npm run dev`, 390×844)

- [ ] event → bill → Done returns to that event
- [ ] `/balances/:uid` → bill → Done returns to that balances page
- [ ] dashboard → bill → Done returns to dashboard
- [ ] squad → bill → Done returns to that squad
- [ ] `/bill/new` from an event, add an item (triggers the JIT id swap), Done → returns to the event (this is the `AIScanView` state-wipe path)
- [ ] hard reload mid-bill, then Done → still returns to origin
- [ ] hardware/swipe back agrees with Done in every case above
- [ ] exit button label matches where it actually goes
- [ ] desktop step 0 now has an exit control

- [ ] **Step 3: Check the stale-render risk**

Complete a bill from `/balances/:uid` and from an event; confirm the origin page shows the updated bill after `navigate(-1)`. If either renders stale, switch that exit to `navigate(returnTo, { replace: true })`.
