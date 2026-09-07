# Monetization Chunk 1 — Security Prerequisites Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it safe to store entitlement state and meter AI scans, by locking the entitlement/usage collections to Admin-SDK writes, adding a per-user rate limit to `analyzeBill`, and removing production console logging of user data from the guest screen.

**Architecture:** Two new Firestore collections (`entitlements/{userId}`, `usage/{userId}`) that are owner-readable and deny all client writes. A pure, unit-tested fixed-window rate limiter in `shared/` wrapped by a transactional Admin-SDK reservation in `functions/src/`, called by `analyzeBill` before the Gemini request. A dev-only logging helper replacing raw `console.log` in `GuestClaimView`.

**Tech Stack:** Firestore security rules + `@firebase/rules-unit-testing`, Firebase Cloud Functions v2 (`onCall`), Vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-06-monetization-design.md` §5.1, §6.1

---

## ⚠️ The working tree already contains unrelated work

At the time this plan was written, `main` had **382 uncommitted lines across 9 files** from a
separate ledger/validation workstream (`functions/src/ledgerProcessor.ts`,
`shared/calculations.ts`, `shared/reconcileBalances.ts`, `tests/billPersonTotals.test.ts`,
and others), plus untracked `shared/billAmountValidation.ts` and
`tests/integration/nanPoisoning.int.test.ts`.

**Every commit in this plan stages an explicit file list. Never run `git add -A`, `git add .`,
or `git commit -a`.** Doing so sweeps someone else's half-finished work into a security
commit.

**The Task 0 baseline is recorded WITH that work present** — it is the correct reference for
measuring this chunk's delta, not a pristine-tree baseline.

---

## Chunk roadmap — where this fits

This is **chunk 1 of 6**. Chunks 7–9 are fully independent and can run at any time.

| #     | Chunk                                                                       | Depends on | Ships alone?                          |
| ----- | --------------------------------------------------------------------------- | ---------- | ------------------------------------- |
| **1** | **Security prerequisites (this plan)**                                      | —          | Yes — no user-visible change          |
| 2     | Event archive (`archived` flag, archive/unarchive, Archived list, index)    | —          | Yes — useful feature on its own       |
| 3     | Entitlement + quota engine, enforcement dark behind Remote Config           | 1, 2       | Yes — limits set high, no user impact |
| 4     | RevenueCat subscriptions (SDK, products, webhook, restore)                  | 3          | No                                    |
| 5     | Trip Pass consumable (idempotent webhook, expiry extension, reconciliation) | 4          | No                                    |
| 6     | Paywall + progressive quota UI                                              | 3, 4, 5    | No                                    |
| 7     | Push notifications (`@capacitor/push-notifications` + FCM)                  | —          | Yes                                   |
| 8     | Analytics (`logEvent` instrumentation)                                      | —          | Yes                                   |
| 9     | Sign in with Apple (App Store Guideline 4.8)                                | —          | Yes                                   |

**Do not start chunk 3 before chunks 1 and 2 are merged.** Chunk 3 stores entitlements (needs 1's rules) and enforces a group cap (meaningless without 2's archive escape hatch).

---

## File structure

| File                                      | Responsibility                                        | Action |
| ----------------------------------------- | ----------------------------------------------------- | ------ |
| `firestore.rules`                         | Add `entitlements/` + `usage/` match blocks           | Modify |
| `tests/rules/entitlements.rules.test.ts`  | Prove clients cannot write entitlement state          | Create |
| `shared/scanRateLimit.ts`                 | Pure fixed-window rate decision. No Firebase imports. | Create |
| `tests/scanRateLimit.test.ts`             | Unit tests for the pure logic                         | Create |
| `functions/src/scanRateLimiter.ts`        | Transactional Admin-SDK wrapper around the pure logic | Create |
| `functions/src/index.ts`                  | Call `reserveScanSlot()` before the Gemini request    | Modify |
| `src/utils/debugLog.ts`                   | Dev-only logging helper                               | Create |
| `tests/debugLog.test.ts`                  | Unit tests for the helper                             | Create |
| `src/components/guest/GuestClaimView.tsx` | Replace raw `console.log` calls                       | Modify |

**Why the rate limiter is split across `shared/` and `functions/`:** the window arithmetic is pure and deserves fast Java-free unit tests; the transaction is not testable without an emulator. Per `CLAUDE.md`, tests must **not** live inside `shared/` — the Cloud Functions tsconfig compiles `../shared`, and a `vitest` import there breaks the functions build.

---

## Task 0: Establish the baseline

You cannot prove you broke nothing without knowing what was already broken.

- [ ] **Step 1: Record pre-change results on a clean tree**

```bash
git stash list && git status --short
npm test 2>&1 | tail -20
npm run typecheck 2>&1 | tail -20
npm run lint 2>&1 | tail -5
npm --prefix functions run build 2>&1 | tail -10
```

Write the **counts** (tests passed/failed, typecheck error count, lint error count) into a scratch note. Every later verification compares against these numbers, not against zero. The repo has known pre-existing lint errors — `ci.yml` runs lint with `continue-on-error`.

---

## Task 1: Lock down `entitlements/` and `usage/` collections

**Files:**

- Create: `tests/rules/entitlements.rules.test.ts`
- Modify: `firestore.rules` (insert before `match /balances/{balanceId}`)

**Security property being proven:** entitlement and consumption state must be unwritable by any client. If a client could write it, a user grants themselves Pro from the browser console.

Per `CLAUDE.md`, write the test that fails against current code first. Today there is **no** match block for these paths, so Firestore's default-deny makes the _owner read_ fail — that is the failing assertion.

- [ ] **Step 1: Write the failing test**

Create `tests/rules/entitlements.rules.test.ts`:

```typescript
/**
 * Security-rules tests for /entitlements and /usage.
 *
 * These collections hold plan state and consumption counters. They are written
 * EXCLUSIVELY by the Admin SDK (the RevenueCat webhook and analyzeBill). A
 * client that could write them could grant itself Pro for free, so every client
 * write must be denied — including the owner's own.
 *
 * Run: npm run test:rules
 */
import { readFileSync } from 'fs';
import path from 'path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../..');

const OWNER = 'uid_owner';
const ATTACKER = 'uid_attacker';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-bill-split-rules',
    firestore: {
      rules: readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8081,
    },
  });
});

afterAll(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'entitlements', OWNER), {
      plan: 'free',
      source: 'revenuecat',
      productId: '',
      inGracePeriod: false,
    });
    await setDoc(doc(db, 'usage', OWNER), {
      scansThisPeriod: 0,
      rateCount: 0,
    });
  });
});

const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asAttacker = () => testEnv.authenticatedContext(ATTACKER).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

describe('entitlements — plan state is Admin-SDK-only', () => {
  it('BLOCKS the owner granting themselves Pro', async () => {
    // The hole this closes: if this succeeded, Pro is free for anyone with devtools.
    await assertFails(updateDoc(doc(asOwner(), 'entitlements', OWNER), { plan: 'pro' }));
  });

  it('BLOCKS the owner creating an entitlement doc from scratch', async () => {
    await assertFails(setDoc(doc(asOwner(), 'entitlements', 'uid_fresh'), { plan: 'pro' }));
  });

  it('BLOCKS the owner deleting their entitlement doc', async () => {
    await assertFails(deleteDoc(doc(asOwner(), 'entitlements', OWNER)));
  });

  it("BLOCKS an attacker writing someone else's entitlement", async () => {
    await assertFails(updateDoc(doc(asAttacker(), 'entitlements', OWNER), { plan: 'pro' }));
  });

  it("BLOCKS an attacker reading someone else's entitlement", async () => {
    await assertFails(getDoc(doc(asAttacker(), 'entitlements', OWNER)));
  });

  it('BLOCKS an anonymous read', async () => {
    await assertFails(getDoc(doc(asAnon(), 'entitlements', OWNER)));
  });

  it('ALLOWS the owner to READ their own entitlement (paywall UI needs this)', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'entitlements', OWNER)));
  });
});

describe('usage — consumption counters are Admin-SDK-only', () => {
  it('BLOCKS the owner resetting their own scan counter', async () => {
    // The hole this closes: reset scansThisPeriod to 0 and the monthly cap never fires.
    await assertFails(updateDoc(doc(asOwner(), 'usage', OWNER), { scansThisPeriod: 0 }));
  });

  it('BLOCKS the owner resetting their rate-limit counter', async () => {
    await assertFails(updateDoc(doc(asOwner(), 'usage', OWNER), { rateCount: 0 }));
  });

  it("BLOCKS an attacker reading someone else's usage", async () => {
    await assertFails(getDoc(doc(asAttacker(), 'usage', OWNER)));
  });

  it('ALLOWS the owner to READ their own usage (quota indicator needs this)', async () => {
    await assertSucceeds(getDoc(doc(asOwner(), 'usage', OWNER)));
  });
});

describe('users — documents why entitlements do NOT live on the profile', () => {
  it('CONFIRMS a user can still write arbitrary fields to their own profile', async () => {
    // Not a bug to fix here — `allow update: if request.auth.uid == userId`
    // (firestore.rules:40) is whole-document by design for profile fields.
    // This test exists so that if anyone ever moves `plan` onto users/{userId},
    // this passing assertion shows exactly why that grants free Pro.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', OWNER), { uid: OWNER, friends: [], squadIds: [] });
    });
    await assertSucceeds(updateDoc(doc(asOwner(), 'users', OWNER), { plan: 'pro' }));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:rules
```

Expected: the two `ALLOWS the owner to READ...` tests **FAIL** (no match block exists, so default-deny blocks the read). The `BLOCKS` tests already pass via default-deny — that is correct and expected; they are regression guards for after the rule is added.

- [ ] **Step 3: Add the rules**

In `firestore.rules`, insert immediately **before** the line `match /balances/{balanceId} {`:

```
    // ========== Entitlements & Usage (Admin SDK only) ==========
    // Plan state and consumption counters. Written EXCLUSIVELY by the Admin SDK
    // (the RevenueCat webhook and analyzeBill). A client that could write these
    // could grant itself Pro or reset its own scan quota, so ALL client writes
    // are denied — including the owner's own.
    //
    // Reads are owner-only so the app can render the quota indicator and paywall
    // state. Client reads are a RENDERING HINT ONLY; every limit is enforced
    // server-side. See docs/superpowers/specs/2026-09-06-monetization-design.md
    // §5.1 and §4.3.1.
    match /entitlements/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }

    match /usage/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if false;
    }

```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npm run test:rules
```

Expected: all tests in `entitlements.rules.test.ts` PASS, and `users.rules.test.ts` / `legacy.rules.test.ts` still pass at the Task 0 baseline count.

- [ ] **Step 5: Commit**

```bash
git add firestore.rules tests/rules/entitlements.rules.test.ts
git commit -m "feat(security): lock entitlements and usage to Admin SDK writes"
```

---

## Task 2: Pure fixed-window scan rate limiter

**Files:**

- Create: `shared/scanRateLimit.ts`
- Test: `tests/scanRateLimit.test.ts`

**Why this exists:** `analyzeBill` currently has no per-user usage limit at all (`functions/src/index.ts:90-127` checks only auth, MIME prefix, and an 8MB ceiling). `maxInstances: 10` is a _concurrency_ cap, not a usage cap. An authenticated user can loop the function indefinitely.

**This is a rate limit, not the monthly quota.** It is plan-agnostic (Pro users are limited too), it exists purely to stop scripted abuse, and — unlike the quota in chunk 3 — it **reserves the slot before the work happens**. A limiter that only counted successes would be bypassable by deliberately triggering errors.

- [ ] **Step 1: Write the failing test**

Create `tests/scanRateLimit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { evaluateScanRate, SCAN_RATE_LIMIT, SCAN_RATE_WINDOW_MS } from '@shared/scanRateLimit';

const T0 = 1_700_000_000_000;

describe('evaluateScanRate', () => {
  it('allows the first scan and opens a window', () => {
    const d = evaluateScanRate(null, T0);
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0, count: 1 });
    expect(d.retryAfterMs).toBe(0);
  });

  it('increments within an open window without moving the window start', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: 3 }, T0 + 60_000);
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0, count: 4 });
  });

  it('blocks once the limit is reached', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 + 60_000);
    expect(d.allowed).toBe(false);
    expect(d.next).toEqual({ windowStartMs: T0, count: SCAN_RATE_LIMIT });
  });

  it('does not increment the counter when blocked', () => {
    // A blocked caller hammering the endpoint must not extend their own lockout.
    const state = { windowStartMs: T0, count: SCAN_RATE_LIMIT };
    const first = evaluateScanRate(state, T0 + 1_000);
    const second = evaluateScanRate(first.next, T0 + 2_000);
    expect(second.next.count).toBe(SCAN_RATE_LIMIT);
  });

  it('reports how long until the window reopens', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 + 60_000);
    expect(d.retryAfterMs).toBe(SCAN_RATE_WINDOW_MS - 60_000);
  });

  it('opens a fresh window once the old one expires', () => {
    const d = evaluateScanRate(
      { windowStartMs: T0, count: SCAN_RATE_LIMIT },
      T0 + SCAN_RATE_WINDOW_MS,
    );
    expect(d.allowed).toBe(true);
    expect(d.next).toEqual({ windowStartMs: T0 + SCAN_RATE_WINDOW_MS, count: 1 });
  });

  it('treats a clock that went backwards as a fresh window rather than a free pass', () => {
    // nowMs < windowStartMs would make the elapsed check negative. It must not
    // read as "window still open with room", nor grant unlimited scans.
    const d = evaluateScanRate({ windowStartMs: T0, count: SCAN_RATE_LIMIT }, T0 - 5_000);
    expect(d.allowed).toBe(false);
  });

  it('honours an explicitly supplied limit and window', () => {
    const d = evaluateScanRate({ windowStartMs: T0, count: 2 }, T0 + 10, 2, 1_000);
    expect(d.allowed).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/scanRateLimit.test.ts
```

Expected: FAIL — `Failed to resolve import "@shared/scanRateLimit"`.

- [ ] **Step 3: Write the implementation**

Create `shared/scanRateLimit.ts`:

```typescript
/**
 * Pure fixed-window rate limiting for AI receipt scans.
 *
 * This is an ABUSE limiter, not the business quota. It applies to every plan
 * including Pro, and it reserves a slot BEFORE the Gemini call — a limiter that
 * only counted successes would be bypassable by deliberately erroring.
 *
 * No Firebase imports: this file is compiled into the Cloud Functions build via
 * the functions tsconfig, and is unit-tested from tests/ (never from shared/).
 */

/** Maximum scans one user may start per window. Generous for humans, fatal to scripts. */
export const SCAN_RATE_LIMIT = 30;

/** Window length in milliseconds. */
export const SCAN_RATE_WINDOW_MS = 60 * 60 * 1000;

export interface ScanRateState {
  windowStartMs: number;
  count: number;
}

export interface ScanRateDecision {
  allowed: boolean;
  /** State to persist. Unchanged from the input when the call is blocked. */
  next: ScanRateState;
  /** Milliseconds until the window reopens. Zero when allowed. */
  retryAfterMs: number;
}

export function evaluateScanRate(
  current: ScanRateState | null,
  nowMs: number,
  limit: number = SCAN_RATE_LIMIT,
  windowMs: number = SCAN_RATE_WINDOW_MS,
): ScanRateDecision {
  if (!current) {
    return { allowed: true, next: { windowStartMs: nowMs, count: 1 }, retryAfterMs: 0 };
  }

  const elapsed = nowMs - current.windowStartMs;

  // Only a forward-elapsed window expires. A backwards clock (elapsed < 0) must
  // NOT reopen the window, or moving a device clock back grants free scans.
  if (elapsed >= windowMs) {
    return { allowed: true, next: { windowStartMs: nowMs, count: 1 }, retryAfterMs: 0 };
  }

  if (current.count >= limit) {
    return {
      allowed: false,
      next: current,
      retryAfterMs: Math.max(0, current.windowStartMs + windowMs - nowMs),
    };
  }

  return {
    allowed: true,
    next: { windowStartMs: current.windowStartMs, count: current.count + 1 },
    retryAfterMs: 0,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/scanRateLimit.test.ts
```

Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add shared/scanRateLimit.ts tests/scanRateLimit.test.ts
git commit -m "feat(security): add pure fixed-window scan rate limiter"
```

---

## Task 3: Wire the rate limiter into `analyzeBill`

**ESM import extensions are mandatory in `functions/`.** `functions/package.json` is
`"type": "module"` on Node 20, and `functions/tsconfig.json` uses
`moduleResolution: "bundler"` — which accepts extensionless specifiers, compiles green, and
emits them unchanged. The result is a passing build and `ERR_MODULE_NOT_FOUND` at cold start
in production. Every relative import inside `functions/src/` must end in `.js`, matching the
12 existing `../../shared/*.js` imports. A green `tsc` does not prove the module loads.

**Files:**

- Create: `functions/src/scanRateLimiter.ts`
- Modify: `functions/src/index.ts` (inside the `analyzeBill` handler, after the size check, before the `try` block that calls Gemini)

- [ ] **Step 1: Write the transactional wrapper**

Create `functions/src/scanRateLimiter.ts`:

```typescript
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { evaluateScanRate, SCAN_RATE_LIMIT, type ScanRateState } from '../../shared/scanRateLimit.js';

/**
 * Reserves one scan slot for `uid`, or reports that the window is exhausted.
 *
 * Writes to usage/{userId}, which denies all client writes (firestore.rules).
 * The decision is returned rather than thrown from inside the transaction so a
 * rejection can never be mistaken for transaction contention and retried.
 */
export async function reserveScanSlot(
  uid: string,
): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const db = getFirestore();
  const ref = db.collection('usage').doc(uid);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();

    const current: ScanRateState | null =
      data?.rateWindowStart instanceof Timestamp && typeof data.rateCount === 'number'
        ? { windowStartMs: data.rateWindowStart.toMillis(), count: data.rateCount }
        : null;

    const decision = evaluateScanRate(current, Date.now());

    if (decision.allowed) {
      tx.set(
        ref,
        {
          rateWindowStart: Timestamp.fromMillis(decision.next.windowStartMs),
          rateCount: decision.next.count,
        },
        { merge: true },
      );
    }

    return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs };
  });
}

export { SCAN_RATE_LIMIT };
```

- [ ] **Step 2: Call it from `analyzeBill`**

In `functions/src/index.ts`, add to the imports at the top of the file:

```typescript
import { reserveScanSlot, SCAN_RATE_LIMIT } from './scanRateLimiter.js';
```

Then, in the `analyzeBill` handler, insert **immediately after** the oversized-payload `throw new HttpsError(...)` block closes and **immediately before** the `try {` that initializes Gemini:

```typescript
// Per-user abuse limit. Applies to every plan — this is not the business
// quota (see chunk 3), it is the backstop that stops a script looping the
// endpoint. The slot is reserved BEFORE the Gemini call so that a caller
// who deliberately errors cannot bypass it.
const rate = await reserveScanSlot(request.auth.uid);
if (!rate.allowed) {
  const retryMinutes = Math.ceil(rate.retryAfterMs / 60_000);
  logger.warn('analyzeBill: rate limit exceeded', {
    uid: request.auth.uid,
    limit: SCAN_RATE_LIMIT,
    retryAfterMs: rate.retryAfterMs,
  });
  throw new HttpsError(
    'resource-exhausted',
    `Too many scans. You can scan up to ${SCAN_RATE_LIMIT} receipts per hour. Try again in ${retryMinutes} minute${retryMinutes === 1 ? '' : 's'}.`,
  );
}
```

- [ ] **Step 3: Verify the functions build compiles**

```bash
npm --prefix functions run build
```

Expected: success, and no new errors versus the Task 0 baseline.

- [ ] **Step 4: Verify the client surfaces the error — DO NOT EDIT THIS FILE**

`src/hooks/useReceiptAnalyzer.ts` already routes failures to a toast that prefers
`error.message`:

```typescript
description: error instanceof Error ? error.message : 'Could not analyze receipt. Please try again.',
```

So the `resource-exhausted` text reaches the user verbatim. **No change is required.**

**This file currently holds uncommitted work belonging to another workstream** (a
zero-item-receipt guard). Do not edit it, do not stage it, do not commit it. Confirm only:

```bash
grep -n "error.message" src/hooks/useReceiptAnalyzer.ts
```

Expected: a match on the toast `description` line.

- [ ] **Step 5: Commit**

```bash
git add functions/src/scanRateLimiter.ts functions/src/index.ts
git commit -m "feat(security): rate limit analyzeBill to 30 scans per hour per user"
```

---

## Task 4: Stop logging user data to the production console

**Files:**

- Create: `src/utils/debugLog.ts`
- Test: `tests/debugLog.test.ts`
- Modify: `src/components/guest/GuestClaimView.tsx:70-113`

**The problem:** the `currentPerson` `useMemo` logs UIDs, display names, the full `people` array, `participantIds`, and the `members` array to the console on every render. This runs in production, on the **guest screen** — the one page shown to people who are not users of the app and never agreed to anything.

- [ ] **Step 1: Write the failing test**

Create `tests/debugLog.test.ts`:

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDebugLog } from '@/utils/debugLog';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createDebugLog', () => {
  it('forwards to console.log when enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createDebugLog(true)('[Test]', { uid: 'abc' });
    expect(spy).toHaveBeenCalledWith('[Test]', { uid: 'abc' });
  });

  it('logs NOTHING when disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    createDebugLog(false)('[Test]', { uid: 'abc' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does not evaluate a thunk argument when disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const expensive = vi.fn(() => 'serialized');
    createDebugLog(false)('[Test]', expensive);
    expect(spy).not.toHaveBeenCalled();
    expect(expensive).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npx vitest run tests/debugLog.test.ts
```

Expected: FAIL — `Failed to resolve import "@/utils/debugLog"`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/debugLog.ts`:

```typescript
/**
 * Development-only logging.
 *
 * Use this instead of console.log for any diagnostic that touches user data.
 * Production console output is visible to anyone who opens devtools — including,
 * on the guest claim screen, people who are not users of this app at all.
 *
 * `createDebugLog` takes the flag explicitly so it is unit-testable without
 * stubbing import.meta.env.
 */
export function createDebugLog(enabled: boolean) {
  return (...args: unknown[]): void => {
    if (!enabled) return;
    console.log(...args);
  };
}

// `?? false` is fail-closed on purpose: if import.meta.env is ever absent (a
// non-Vite consumer, an SSR pass, a test runner without the Vite transform),
// the correct behaviour for a privacy control is to log NOTHING, not to log
// everything.
export const debugLog = createDebugLog(import.meta.env?.DEV ?? false);
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
npx vitest run tests/debugLog.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Replace the calls in `GuestClaimView`**

Add to the imports at the top of `src/components/guest/GuestClaimView.tsx`:

```typescript
import { debugLog } from '@/utils/debugLog';
```

Then replace **every** `console.log(` inside the `currentPerson` `useMemo` (lines ~70–113) with `debugLog(`. Do not change the arguments, the control flow, or any `return` — this is a mechanical substitution.

Verify none were missed:

```bash
grep -n "console\.log" src/components/guest/GuestClaimView.tsx
```

Expected: **no output.**

- [ ] **Step 6: Confirm no other production surface leaks user data**

```bash
grep -rn "console\.log" src/components/guest/ src/pages/CollaborativeSessionView.tsx
```

Expected: no output. If any remain, replace them with `debugLog` the same way.

- [ ] **Step 7: Commit**

```bash
git add src/utils/debugLog.ts tests/debugLog.test.ts src/components/guest/GuestClaimView.tsx
git commit -m "fix(privacy): stop logging user identifiers to the production console"
```

---

## Task 5: Full gate run and handoff

- [ ] **Step 1: Run every gate the change touches**

Per `CLAUDE.md`, this change touches `src/`, `functions/`, `shared/`, and `firestore.rules`, so all of these apply:

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm --prefix functions run build
npm run test:rules
```

- [ ] **Step 2: Compare against the Task 0 baseline**

Report **deltas, not exit codes**. Lint has known pre-existing errors; the bar is "no more than baseline", not zero.

- [ ] **Step 3: Adversarial review**

Per `CLAUDE.md` step 3, dispatch a `self-reviewer` subagent against the diff. Specifically ask it to try to: bypass the rate limiter (concurrent calls racing the transaction, clock manipulation, a fresh account per scan), write `entitlements/` or `usage/` from a client by any path, and find a legitimate flow the new `resource-exhausted` error breaks.

- [ ] **Step 4: Confirm what a push deploys**

`firestore.rules` and `functions/` both match the `deploy-backend.yml` path filter, so **pushing this to `main` auto-deploys rules and functions to PROD**. It also always builds and uploads a draft AAB to Play.

**Backward compatibility check before pushing:** `usage/{userId}` documents do not exist for any current user. `reserveScanSlot` handles this — `snap.data()` is `undefined`, `current` is `null`, and the first scan opens a fresh window. Confirm the rules change denies nothing that previously succeeded: no client code writes to `entitlements/` or `usage/` today, because neither collection exists.

- [ ] **Step 5: Manual QA checklist (needs your eyes — not automated)**

| #   | Route              | Steps                                                      | Expected                                                                                                              |
| --- | ------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `/bill/:id`        | Scan a receipt normally                                    | Works exactly as before. No visible change.                                                                           |
| 2   | `/bill/:id`        | Scan 31 receipts within an hour                            | Scan 31 is refused with "Too many scans… try again in N minutes", shown as a toast — not a crash or a silent failure. |
| 3   | `/join/:shareCode` | Open as a guest in a private window, devtools console open | Claim items and reach the Venmo handoff. **Console shows no UIDs, names, or participant arrays.**                     |
| 4   | `/join/:shareCode` | Same flow in `npm run dev`                                 | Debug logs **do** appear, so local debugging still works.                                                             |

**Do not report this chunk as verified on the strength of the automated gates alone.** Items 2 and 3 are the actual security properties and only you can confirm them in a real browser.

---

## Self-review notes

- **Spec coverage:** this plan implements §6.1 rows 1 (entitlement storage lockdown, via a separate collection rather than tightening `users/`), 3 (per-user rate limit), and 4 (strip production logging). §6.1 row 2 (**App Check**) and row 5 (**hardcoded maintainer UIDs**, `functions/src/index.ts:568-572`) are **deliberately not in this chunk** — App Check needs native attestation config for iOS and Android and is its own piece of work; the hardcoded UIDs are an ops concern with no bearing on billing. Both remain open in the spec.
- **Not a regression:** Task 1 does **not** tighten `users/{userId}` writes. The spec's §5.1 conclusion is that entitlement state must live _elsewhere_, which this plan implements. The `users` rule stays permissive for profile fields by design, and the final test in Task 1 documents exactly why that makes `users/` an unsafe home for `plan`.
- **Type consistency:** `ScanRateState` (`windowStartMs`, `count`) is used identically in `shared/scanRateLimit.ts`, `tests/scanRateLimit.test.ts`, and `functions/src/scanRateLimiter.ts`. Firestore field names are `rateWindowStart` / `rateCount` and appear identically in the rules test seed, the wrapper, and the manual QA notes.
