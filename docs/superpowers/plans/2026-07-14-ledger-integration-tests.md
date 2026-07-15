# Ledger Pipeline Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integration tests that exercise the full backend flows (bill → ledger pipeline → `balances`/`event_balances` → settlements → reversals) against the Firestore emulator, invoking Cloud Function logic in-process.

**Architecture:** Extract the three inline Firestore-trigger bodies into exported `process*` core functions (matching the existing `*Core` convention). A test harness (`triggerLoop.ts`) simulates the Firestore trigger runtime: after each write it invokes the core with (before, after) snapshots and re-fires on the pipeline's own follow-up writes until quiescent. Tests run under Vitest with `firebase-admin` pointed at the emulator via `firebase emulators:exec` under the offline-only project `demo-bill-split-test`.

**Tech Stack:** Vitest 4, firebase-admin 12 (from `functions/node_modules` — aliased), Firebase Firestore emulator (Java), Node 20 global `fetch`.

**Spec:** `docs/superpowers/specs/2026-07-14-ledger-integration-tests-design.md`

---

## ⚠️ Repo rules for the executor

1. **NEVER `git commit` or `git push` without the user's explicit approval.** Commit steps below are checkpoints: STOP and ask the user first. If the user declines, leave changes staged/unstaged and continue.
2. The working tree already has unrelated modified files (see `git status`). Only stage the files named in each task — never `git add -A`.
3. If an integration test FAILS, do **not** loosen the assertion. It is either (a) a real product bug — stop and report to the user; (b) a wrong expected value in this plan — recompute from `shared/calculations.ts` + `shared/ledgerCalculations.ts` semantics and show your math; or (c) a harness bug — fix the harness. Use superpowers:systematic-debugging.
4. Integration tests must only ever run via `npm run test:integration` (emulator). If any test errors with a network call to `firestore.googleapis.com`, STOP — the env guard failed; that is a blocking bug.

## Prerequisites (verify before Task 1)

```bash
java -version          # must succeed (Firestore emulator needs Java)
npx firebase --version # firebase-tools available
cd functions && npm run build   # baseline: functions build is green BEFORE refactors
```
If the baseline functions build fails, STOP and report — do not refactor on a broken baseline.

---

### Task 1: Extract `processLedgerWrite` from the `ledgerProcessor` trigger

**Files:**
- Modify: `functions/src/ledgerProcessor.ts` (lines ~540–672, the `onDocumentWritten` block)

This is a pure mechanical extraction — the body of the trigger handler moves verbatim into an exported function. No logic changes.

- [ ] **Step 1: Perform the extraction**

Current shape (end of file):

```typescript
export const ledgerProcessor = onDocumentWritten(
  { document: 'bills/{billId}', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    const billId = event.params.billId;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // ── DELETE ────────── ... ~120 lines ...
  }
);
```

New shape — add `DocumentData` to the existing `firebase-admin/firestore` import, then:

```typescript
import { getFirestore, FieldValue, Timestamp, type DocumentData } from 'firebase-admin/firestore';

/**
 * Core pipeline logic for a bills/{billId} write. Extracted from the trigger
 * so integration tests can invoke it in-process (same pattern as
 * processSettlementCore etc.). MUST stay behavior-identical to the trigger.
 */
export async function processLedgerWrite(
  billId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined
): Promise<void> {
  // ── DELETE ────────── <the ENTIRE former handler body, verbatim,
  //                       starting at `if (before && !after) {`
  //                       and ending at the end of the Stage 3 block> ──
}

export const ledgerProcessor = onDocumentWritten(
  { document: 'bills/{billId}', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    await processLedgerWrite(
      event.params.billId,
      event.data?.before?.data(),
      event.data?.after?.data()
    );
  }
);
```

The three `const billId/before/after = event...` lines are deleted (they become parameters). Everything else in the body is untouched.

- [ ] **Step 2: Verify the functions build**

Run: `cd functions && npm run build`
Expected: exit 0, no TypeScript errors.

- [ ] **Step 3: Verify no behavior drift**

Run: `git diff functions/src/ledgerProcessor.ts`
Confirm the diff is ONLY: import addition, function wrapper lines, indentation. No statement inside the body changed.

- [ ] **Step 4: Checkpoint** — ask the user before committing (`refactor(functions): extract processLedgerWrite core from ledgerProcessor trigger`).

---

### Task 2: Extract `processFriendAdd` from the `friendAddProcessor` trigger

**Files:**
- Modify: `functions/src/friendAddProcessor.ts` (lines 52–122)

- [ ] **Step 1: Perform the extraction**

Add to imports: `import { getFirestore, Timestamp, type DocumentData } from 'firebase-admin/firestore';`

```typescript
/**
 * Core retro-scan logic for a users/{userId} update. Extracted for
 * in-process integration testing.
 */
export async function processFriendAdd(
  userId: string,
  before: DocumentData | undefined,
  after: DocumentData | undefined
): Promise<void> {
  if (!before || !after) return;

  // <former handler body from `const beforeFriends = ...` onward, verbatim>
}

export const friendAddProcessor = onDocumentUpdated(
  { document: 'users/{userId}', timeoutSeconds: 60, memory: '256MiB' },
  async (event) => {
    await processFriendAdd(
      event.params.userId,
      event.data?.before?.data(),
      event.data?.after?.data()
    );
  }
);
```

- [ ] **Step 2: Verify build** — `cd functions && npm run build` → exit 0.
- [ ] **Step 3: Verify diff is extraction-only** — `git diff functions/src/friendAddProcessor.ts`.
- [ ] **Step 4: Checkpoint** — ask user (`refactor(functions): extract processFriendAdd core`).

---

### Task 3: Extract `processEventDelete` from the `eventDeleteProcessor` trigger

**Files:**
- Modify: `functions/src/eventDeleteProcessor.ts` (lines 68–135)

- [ ] **Step 1: Perform the extraction**

```typescript
/**
 * Core cascade-cleanup logic for an events/{eventId} delete. Extracted for
 * in-process integration testing.
 */
export async function processEventDelete(eventId: string): Promise<void> {
  logger.info('Event deleted, starting cascade cleanup', { eventId });

  // <former handler body from step "1. Read all bills..." onward, verbatim>
}

export const eventDeleteProcessor = onDocumentDeleted(
  { document: 'events/{eventId}', timeoutSeconds: 120, memory: '256MiB' },
  async (event) => {
    await processEventDelete(event.params.eventId);
  }
);
```

- [ ] **Step 2: Verify build** — `cd functions && npm run build` → exit 0.
- [ ] **Step 3: Verify diff is extraction-only** — `git diff functions/src/eventDeleteProcessor.ts`.
- [ ] **Step 4: Checkpoint** — ask user (`refactor(functions): extract processEventDelete core`).

---

### Task 4: Integration test plumbing — config, scripts, env guard, smoke test

**Files:**
- Create: `vitest.integration.config.ts`
- Create: `tests/integration/helpers/env.ts`
- Create: `tests/integration/plumbing.int.test.ts`
- Modify: `vitest.config.ts` (exclude integration dir)
- Modify: `package.json` (add script)

- [ ] **Step 1: Create `vitest.integration.config.ts`**

The alias block is load-bearing: `firebase-admin` exists ONLY in `functions/node_modules`. Every import of it — from test helpers AND from `functions/src` — must resolve to that single copy so `initializeApp()` in tests and `getFirestore()` inside the pipeline share one app instance.

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve firebase packages from functions/node_modules — the only copy in the
// repo. Single resolved path == single module instance == shared admin app.
const functionsRequire = createRequire(path.resolve(__dirname, 'functions/package.json'));

export default defineConfig({
  resolve: {
    alias: [
      { find: '@shared', replacement: path.resolve(__dirname, './shared') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
      {
        find: /^(firebase-admin|firebase-functions)(\/.+)?$/,
        replacement: '$1$2',
        customResolver(source: string) {
          return functionsRequire.resolve(source);
        },
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.int.test.ts'],
    setupFiles: ['tests/integration/helpers/env.ts'],
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Suites share one emulator instance; run files sequentially so
    // clearFirestore() in one file can't wipe another file's data mid-test.
    fileParallelism: false,
  },
});
```

> **Contingency (only if imports of `functions/src/*.ts` fail to resolve their internal `../../shared/*.js` specifiers):** Vite ≥4.2 resolves TS-style `.js` specifiers to `.ts` sources natively. If a run errors with `Failed to resolve import "../../shared/calculations.js"`, add this plugin to the config above:
> ```typescript
> plugins: [{
>   name: 'ts-js-extension',
>   enforce: 'pre' as const,
>   async resolveId(source: string, importer: string | undefined) {
>     if (importer && /\.(ts|tsx)$/.test(importer) && /^\.\.?\//.test(source) && source.endsWith('.js')) {
>       const resolved = await (this as any).resolve(source.replace(/\.js$/, '.ts'), importer, { skipSelf: true });
>       if (resolved) return resolved;
>     }
>     return null;
>   },
> }],
> ```

- [ ] **Step 2: Create `tests/integration/helpers/env.ts`**

```typescript
/**
 * Integration-test environment guard + firebase-admin bootstrap.
 *
 * SAFETY INVARIANT: these tests may ONLY run against the Firestore emulator.
 * The guard below throws before any Firebase initialization if the emulator
 * env var is missing, and the project ID is a `demo-*` ID, which the Firebase
 * CLI treats as offline-only (no cloud project can ever be reached).
 */
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT_ID = 'demo-bill-split-test';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error(
    'FIRESTORE_EMULATOR_HOST is not set — refusing to run integration tests ' +
    'against a real Firebase project. Run them via: npm run test:integration'
  );
}

if (getApps().length === 0) {
  initializeApp({ projectId: PROJECT_ID });
}

export const db = getFirestore();

/** Wipes all emulator data. Call in beforeEach of every suite. */
export async function clearFirestore(): Promise<void> {
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) {
    throw new Error(`clearFirestore failed: ${res.status} ${await res.text()}`);
  }
}
```

- [ ] **Step 3: Create `tests/integration/plumbing.int.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';

describe('integration plumbing', () => {
  beforeEach(clearFirestore);

  it('round-trips a document through the Firestore emulator', async () => {
    await db.collection('smoke').doc('x').set({ ok: true, n: 42 });
    const snap = await db.collection('smoke').doc('x').get();
    expect(snap.data()).toEqual({ ok: true, n: 42 });
  });

  it('clearFirestore wipes previously written data', async () => {
    await db.collection('smoke').doc('y').set({ ok: true });
    await clearFirestore();
    const snap = await db.collection('smoke').doc('y').get();
    expect(snap.exists).toBe(false);
  });
});
```

- [ ] **Step 4: Exclude integration tests from the unit config**

In `vitest.config.ts`, the `.int.test.ts` files would otherwise match `tests/**/*.{test,spec}.ts`. Change the `test` block to:

```typescript
import { defineConfig, configDefaults } from 'vitest/config';
// ...
  test: {
    environment: 'node',
    include: ['tests/**/*.{test,spec}.ts'],
    exclude: [...configDefaults.exclude, 'tests/integration/**'],
  },
```

- [ ] **Step 5: Add the npm script**

In root `package.json` `scripts`, after `"test:watch"`:

```json
"test:integration": "firebase emulators:exec --only firestore --project demo-bill-split-test \"vitest run --config vitest.integration.config.ts\"",
```

- [ ] **Step 6: Verify unit tests still green and Java-free**

Run: `npm test`
Expected: PASS; the run lists NO files from `tests/integration/`.

- [ ] **Step 7: Verify the integration plumbing**

Run: `npm run test:integration`
Expected: emulator starts on port 8081 (from `firebase.json`), both plumbing tests PASS, emulator shuts down.
If "port 8081 is not open": another emulator is running — `npx kill-port 8081` (or per CLAUDE.md, kill the listed PIDs) and retry.

- [ ] **Step 8: Verify the env guard actually guards**

Run: `npx vitest run --config vitest.integration.config.ts 2>&1 | head -30` (deliberately WITHOUT the emulator wrapper)
Expected: suite FAILS immediately with `FIRESTORE_EMULATOR_HOST is not set`. No test may pass, and no request may go to any `googleapis.com` host.

- [ ] **Step 9: Checkpoint** — ask user (`test: add Firestore-emulator integration test plumbing (guarded, demo project)`).

---

### Task 5: Test harness — builders + simulated trigger loop

**Files:**
- Create: `tests/integration/helpers/builders.ts`
- Create: `tests/integration/helpers/triggerLoop.ts`

- [ ] **Step 1: Create `tests/integration/helpers/builders.ts`**

```typescript
/**
 * Minimal-valid Firestore document builders for integration tests.
 * Conventions (mirror production):
 *   - linked person id  = `user-<uid>`  (raw uid in participantIds)
 *   - unlinked/guest id = `person-<name>`
 *   - paidById / ownerId = raw Firebase UID
 */
import { Timestamp, type DocumentData } from 'firebase-admin/firestore';

export interface TestPerson {
  name: string;
  uid?: string;      // linked Firebase user
  localId?: string;  // explicit unlinked id (defaults to person-<name>)
}

export function personId(p: TestPerson): string {
  return p.uid ? `user-${p.uid}` : (p.localId ?? `person-${p.name.toLowerCase()}`);
}

export interface MakeBillOptions {
  ownerId: string;
  people: TestPerson[];
  items: Array<{ name: string; price: number }>;
  /** itemId ('item-1', 'item-2', …) → array of person ids (use personId()) */
  itemAssignments?: Record<string, string[]>;
  splitEvenly?: boolean;
  tax?: number;
  tip?: number;
  paidById?: string;   // raw uid
  eventId?: string;
  settledPersonIds?: string[];
}

export function makeBill(opts: MakeBillOptions): DocumentData {
  const people = opts.people.map(p => ({ id: personId(p), name: p.name }));
  const items = opts.items.map((it, i) => ({ id: `item-${i + 1}`, name: it.name, price: it.price }));
  const subtotal = opts.items.reduce((s, it) => s + it.price, 0);
  const tax = opts.tax ?? 0;
  const tip = opts.tip ?? 0;
  const participantIds = opts.people.flatMap(p => (p.uid ? [p.uid] : []));
  const now = Timestamp.now();
  return {
    billType: opts.eventId ? 'event' : 'private',
    ownerId: opts.ownerId,
    ...(opts.paidById && { paidById: opts.paidById }),
    ...(opts.eventId && { eventId: opts.eventId }),
    billData: {
      items,
      subtotal,
      tax,
      tip,
      total: subtotal + tax + tip,
      restaurantName: 'Test Diner',
    },
    people,
    itemAssignments: opts.itemAssignments ?? {},
    splitEvenly: opts.splitEvenly ?? false,
    settledPersonIds: opts.settledPersonIds ?? [],
    participantIds,
    createdAt: now,
    updatedAt: now,
    lastActivity: now,
  };
}

export function makeUser(opts: { friends?: string[]; venmoId?: string } = {}): DocumentData {
  return { friends: opts.friends ?? [], ...(opts.venmoId && { venmoId: opts.venmoId }) };
}

export function makeEvent(opts: { ownerId: string; memberIds: string[]; name?: string }): DocumentData {
  const now = Timestamp.now();
  return {
    name: opts.name ?? 'Test Trip',
    ownerId: opts.ownerId,
    memberIds: opts.memberIds,
    createdAt: now,
    updatedAt: now,
  };
}
```

- [ ] **Step 2: Create `tests/integration/helpers/triggerLoop.ts`**

```typescript
/**
 * Simulated Firestore trigger runtime.
 *
 * Production: every bills/{billId} write fires ledgerProcessor with
 * (before, after) snapshots; the pipeline's own writes (processedBalances,
 * _ledgerVersion, …) re-fire it, and hasRelevantChange() terminates the loop.
 *
 * Here: after each write we invoke processLedgerWrite directly and re-fire
 * while the pipeline keeps writing to the bill — capped at MAX_PASSES, so a
 * pipeline that never quiesces fails the test instead of hanging.
 */
import type { DocumentData, Timestamp } from 'firebase-admin/firestore';
import { db } from './env';
import { processLedgerWrite } from '../../../functions/src/ledgerProcessor';
import { processFriendAdd } from '../../../functions/src/friendAddProcessor';
import { processEventDelete } from '../../../functions/src/eventDeleteProcessor';

const MAX_PASSES = 10;
const BILLS = 'bills';

async function runBillTriggerLoop(billId: string, before: DocumentData | undefined): Promise<void> {
  const ref = db.collection(BILLS).doc(billId);
  let prevData = before;

  for (let pass = 1; pass <= MAX_PASSES; pass++) {
    const currSnap = await ref.get();
    const currData = currSnap.exists ? currSnap.data() : undefined;

    await processLedgerWrite(billId, prevData, currData);

    const nextSnap = await ref.get();
    const changed =
      nextSnap.exists !== currSnap.exists ||
      (nextSnap.exists && currSnap.exists && !nextSnap.updateTime.isEqual(currSnap.updateTime));
    if (!changed) return; // quiescent — pipeline made no further writes

    prevData = currData;
  }
  throw new Error(
    `Trigger loop for bill ${billId} did not quiesce within ${MAX_PASSES} passes — possible infinite pipeline loop`
  );
}

/** Create or overwrite a bill, then run the pipeline to quiescence. */
export async function writeBill(billId: string, data: DocumentData): Promise<void> {
  const ref = db.collection(BILLS).doc(billId);
  const beforeSnap = await ref.get();
  await ref.set(data);
  await runBillTriggerLoop(billId, beforeSnap.exists ? beforeSnap.data() : undefined);
}

/** Partial-update a bill, then run the pipeline to quiescence. */
export async function updateBill(billId: string, updates: Record<string, unknown>): Promise<void> {
  const ref = db.collection(BILLS).doc(billId);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) throw new Error(`updateBill: bill ${billId} does not exist`);
  await ref.update(updates);
  await runBillTriggerLoop(billId, beforeSnap.data());
}

/** Delete a bill and fire the pipeline's DELETE path. */
export async function deleteBill(billId: string): Promise<void> {
  const ref = db.collection(BILLS).doc(billId);
  const beforeSnap = await ref.get();
  if (!beforeSnap.exists) throw new Error(`deleteBill: bill ${billId} does not exist`);
  await ref.delete();
  await processLedgerWrite(billId, beforeSnap.data(), undefined);
}

// ── Fan-out: run an action, then fire triggers for every bill it touched ────

interface BillState { data: DocumentData; updateTime: Timestamp; }

async function snapshotAllBills(): Promise<Map<string, BillState>> {
  const snap = await db.collection(BILLS).get();
  return new Map(snap.docs.map(d => [d.id, { data: d.data(), updateTime: d.updateTime }]));
}

/**
 * Runs `action` (a settlement core, recurring generation, friend-add scan, …),
 * then fires bill trigger events exactly as production Firestore would:
 * created bills → CREATE, changed bills → UPDATE, missing bills → DELETE.
 */
export async function withBillTriggers<T>(action: () => Promise<T>): Promise<T> {
  const beforeMap = await snapshotAllBills();
  const result = await action();

  const afterSnap = await db.collection(BILLS).get();
  const seen = new Set<string>();
  for (const doc of afterSnap.docs) {
    seen.add(doc.id);
    const prior = beforeMap.get(doc.id);
    if (!prior) {
      await runBillTriggerLoop(doc.id, undefined);                 // CREATE
    } else if (!doc.updateTime.isEqual(prior.updateTime)) {
      await runBillTriggerLoop(doc.id, prior.data);                // UPDATE
    }
  }
  for (const [billId, prior] of beforeMap) {
    if (!seen.has(billId)) await processLedgerWrite(billId, prior.data, undefined); // DELETE
  }
  return result;
}

/** Update a users/{userId} doc and run the friend-add retro-scan + fan-out. */
export async function updateUser(userId: string, updates: Record<string, unknown>): Promise<void> {
  const ref = db.collection('users').doc(userId);
  const beforeSnap = await ref.get();
  const before = beforeSnap.exists ? beforeSnap.data() : undefined;
  await ref.set(updates, { merge: true });
  const after = (await ref.get()).data();
  await withBillTriggers(() => processFriendAdd(userId, before, after));
}

/** Delete an events/{eventId} doc and run the cascade + bill DELETE fan-out. */
export async function deleteEvent(eventId: string): Promise<void> {
  await db.collection('events').doc(eventId).delete();
  await withBillTriggers(() => processEventDelete(eventId));
}
```

- [ ] **Step 3: Type-check the harness compiles under Vitest**

Run: `npm run test:integration` (plumbing tests still pass; the new helper files are only compiled when imported — force it by running Task 6's first test next, or temporarily: `npx tsc --noEmit -p .` is NOT wired for these files, so rely on Task 6).
Expected: no change — PASS. (The harness gets its real verification in Task 6 Step 2.)

- [ ] **Step 4: Checkpoint** — ask user (`test: add integration harness — doc builders + simulated trigger loop`).

---

### Task 6: Core ledger flow tests

**Files:**
- Create: `tests/integration/ledgerPipeline.int.test.ts`

Fixture used throughout (recompute if you change it): Alice + Bob linked; item Pizza $20 assigned to both; tax $2, tip $2 → each owes subtotal 10 + tax 1 + tip 1 = **$12**. Alice is owner and (by default) creditor. `'alice' < 'bob'` so `participants = ['alice','bob']` and positive balance ⇒ Alice is owed.

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { makeBill } from './helpers/builders';
import { writeBill, updateBill, deleteBill } from './helpers/triggerLoop';

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = 'alice_bob'; // getFriendBalanceId(alice, bob)

function standardBill(overrides: Partial<Parameters<typeof makeBill>[0]> = {}) {
  return makeBill({
    ownerId: ALICE,
    people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
    items: [{ name: 'Pizza', price: 20 }],
    itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
    tax: 2,
    tip: 2,
    ...overrides,
  });
}

async function getBalance(id: string) {
  const snap = await db.collection('balances').doc(id).get();
  return snap.exists ? snap.data()! : null;
}

async function getBill(id: string) {
  return (await db.collection('bills').doc(id).get()).data()!;
}

describe('ledger pipeline — core flows', () => {
  beforeEach(clearFirestore);

  it('bill create writes the friend balance and footprint', async () => {
    await writeBill('bill-1', standardBill());

    const bal = await getBalance(PAIR_ID);
    expect(bal).not.toBeNull();
    expect(bal!.participants).toEqual(['alice', 'bob']);
    expect(bal!.balance).toBeCloseTo(12, 2);            // Bob owes Alice 12
    expect(bal!.unsettledBillIds).toContain('bill-1');

    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [BOB]: expect.closeTo(12, 2) });
    expect(bill._ledgerVersion).toBeGreaterThanOrEqual(1);
  });

  it('re-processing an unchanged bill does not double-count (idempotent delta)', async () => {
    await writeBill('bill-1', standardBill());
    // _friendScanTrigger IS a relevant field → forces a full pipeline re-run
    await updateBill('bill-1', { _friendScanTrigger: Timestamp.now() });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(12, 2);
    expect(bal!.unsettledBillIds).toEqual(['bill-1']);
  });

  it('editing an item price applies the delta exactly once', async () => {
    await writeBill('bill-1', standardBill());
    // Pizza 20 → 30: subtotal 30, total 34; each share 15 + 1 tax + 1 tip = 17
    await updateBill('bill-1', {
      billData: {
        items: [{ id: 'item-1', name: 'Pizza', price: 30 }],
        subtotal: 30,
        tax: 2,
        tip: 2,
        total: 34,
        restaurantName: 'Test Diner',
      },
    });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(17, 2);
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [BOB]: expect.closeTo(17, 2) });
  });

  it('changing paidById reverses the old anchor and applies the new one', async () => {
    await writeBill('bill-1', standardBill());          // Alice creditor: +12
    await updateBill('bill-1', { paidById: BOB });      // now Alice owes Bob 12

    const bal = await getBalance(PAIR_ID);
    // anchor bob, debtor alice → toSingleBalance('bob','alice',12) = -12
    expect(bal!.balance).toBeCloseTo(-12, 2);
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({ [ALICE]: expect.closeTo(12, 2) });
  });

  it('deleting a bill reverses its footprint to zero', async () => {
    await writeBill('bill-1', standardBill());
    await deleteBill('bill-1');

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(0, 2);
    expect(bal!.unsettledBillIds).not.toContain('bill-1');
  });

  it('marking the debtor settled flows through to a zero balance', async () => {
    await writeBill('bill-1', standardBill());
    await updateBill('bill-1', { settledPersonIds: ['user-bob'] });

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(0, 2);
    expect(bal!.unsettledBillIds).not.toContain('bill-1');
    const bill = await getBill('bill-1');
    expect(bill.processedBalances).toEqual({});          // stripZeros removed bob
  });

  it('unlinked guests are excluded from balances', async () => {
    await writeBill('bill-1', makeBill({
      ownerId: ALICE,
      people: [
        { uid: ALICE, name: 'Alice' },
        { uid: BOB, name: 'Bob' },
        { name: 'Carol' },                               // guest: person-carol
      ],
      items: [{ name: 'Sushi', price: 30 }],
      itemAssignments: { 'item-1': ['user-alice', 'user-bob', 'person-carol'] },
    }));

    const bal = await getBalance(PAIR_ID);
    expect(bal!.balance).toBeCloseTo(10, 2);             // only Bob's 30/3 share
    const bill = await getBill('bill-1');
    expect(Object.keys(bill.processedBalances)).toEqual([BOB]); // no carol entry
  });
});
```

- [ ] **Step 2: Run the suite**

Run: `npm run test:integration`
Expected: plumbing + all 7 tests PASS, every trigger loop quiesces (no MAX_PASSES error). On failure, follow repo rule 3 (bug vs plan-math vs harness) — do not weaken assertions.

- [ ] **Step 3: Checkpoint** — ask user (`test: integration coverage for core ledger pipeline flows`).

---

### Task 7: Event pair-ledger flow tests

**Files:**
- Create: `tests/integration/eventLedger.int.test.ts`

Note: all event bills here keep `paidById === ownerId` (or unset). `processEventDelete` reverses with `ownerId` as anchor while the bill-delete path uses `paidById || ownerId` — testing a payer≠owner event deletion is a known follow-up (see "Deferred scenarios" at the bottom), not part of this suite.

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, deleteEvent } from './helpers/triggerLoop';

const ALICE = 'alice';
const BOB = 'bob';
const EVENT_ID = 'trip1';
const PAIR_ID = 'alice_bob';
const EVENT_PAIR_ID = 'trip1_alice_bob'; // getEventBalanceId(trip1, alice, bob)

async function getDoc(col: string, id: string) {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? snap.data()! : null;
}

function eventBill(opts: { ownerId: string; price: number }) {
  return makeBill({
    ownerId: opts.ownerId,
    eventId: EVENT_ID,
    people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
    items: [{ name: 'Meal', price: opts.price }],
    itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
  });
}

describe('event pair ledger', () => {
  beforeEach(async () => {
    await clearFirestore();
    await db.collection('events').doc(EVENT_ID).set(
      makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] })
    );
  });

  it('an event bill writes both the event pair doc and the global balance', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // Bob owes 10

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal).not.toBeNull();
    expect(eventBal!.eventId).toBe(EVENT_ID);
    expect(eventBal!.participants).toEqual(['alice', 'bob']);
    expect(eventBal!.balance).toBeCloseTo(10, 2);
    expect(eventBal!.unsettledBillIds).toContain('bill-1');

    const globalBal = await getDoc('balances', PAIR_ID);
    expect(globalBal!.balance).toBeCloseTo(10, 2);

    const bill = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(bill.processedEventBalances).toEqual({ [BOB]: expect.closeTo(10, 2) });
  });

  it('multiple bills with different payers aggregate into one pair doc', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 })); // +10 (bob owes)
    await writeBill('bill-2', eventBill({ ownerId: BOB, price: 30 }));   // -15 (alice owes)

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(-5, 2);        // net: Bob is owed 5
    expect(eventBal!.unsettledBillIds).toEqual(expect.arrayContaining(['bill-1', 'bill-2']));

    const globalBal = await getDoc('balances', PAIR_ID);
    expect(globalBal!.balance).toBeCloseTo(-5, 2);
  });

  it('deleting an event cascades: bills, pair docs, invitations gone; global balances reversed once', async () => {
    await writeBill('bill-1', eventBill({ ownerId: ALICE, price: 20 }));
    await writeBill('bill-2', eventBill({ ownerId: BOB, price: 30 }));
    await db.collection('eventInvitations').doc('inv-1').set({
      email: 'x@example.com', eventId: EVENT_ID, invitedBy: ALICE, status: 'pending',
    });

    await deleteEvent(EVENT_ID);

    expect((await db.collection('bills').doc('bill-1').get()).exists).toBe(false);
    expect((await db.collection('bills').doc('bill-2').get()).exists).toBe(false);
    expect(await getDoc('event_balances', EVENT_PAIR_ID)).toBeNull();
    expect((await db.collection('eventInvitations').doc('inv-1').get()).exists).toBe(false);

    // Reversed exactly once — the cascade's explicit reversal plus the
    // simulated bill-DELETE triggers must not double-reverse (idempotency).
    const globalBal = await getDoc('balances', PAIR_ID);
    expect(globalBal!.balance).toBeCloseTo(0, 2);
    expect(globalBal!.unsettledBillIds ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run** — `npm run test:integration` → all suites PASS.
- [ ] **Step 3: Checkpoint** — ask user (`test: integration coverage for event pair ledger + delete cascade`).

---

### Task 8: Settlement flow tests

**Files:**
- Create: `tests/integration/settlement.int.test.ts`

Fixtures: B1 private $24 (Bob owes 12), B2 private $16 (Bob owes 8), B3 in event `trip1` $20 (Bob owes 10). Global balance 12+8+10 = **30**; event pair = **10**.

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeEvent } from './helpers/builders';
import { writeBill, withBillTriggers } from './helpers/triggerLoop';
import { processSettlementCore } from '../../functions/src/settlementProcessor';
import { processEventSettlementCore } from '../../functions/src/eventSettlementProcessor';
import { processSettlementReversalCore } from '../../functions/src/settlementReversal';

const ALICE = 'alice';
const BOB = 'bob';
const EVENT_ID = 'trip1';
const PAIR_ID = 'alice_bob';
const EVENT_PAIR_ID = 'trip1_alice_bob';

async function getDoc(col: string, id: string) {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? snap.data()! : null;
}

function bill(price: number, eventId?: string) {
  return makeBill({
    ownerId: ALICE,
    ...(eventId && { eventId }),
    people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
    items: [{ name: 'Meal', price }],
    itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
  });
}

async function seedThreeBills() {
  await db.collection('events').doc(EVENT_ID).set(makeEvent({ ownerId: ALICE, memberIds: [ALICE, BOB] }));
  await writeBill('b1', bill(24));            // bob owes 12
  await writeBill('b2', bill(16));            // bob owes 8
  await writeBill('b3', bill(20, EVENT_ID));  // bob owes 10
}

describe('settlement flows', () => {
  beforeEach(async () => {
    await clearFirestore();
    await seedThreeBills();
    // sanity: seed state
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(30, 2);
    expect((await getDoc('event_balances', EVENT_PAIR_ID))!.balance).toBeCloseTo(10, 2);
  });

  it('global settlement zeros the balance, records it, and flows through to event pairs', async () => {
    const result = await withBillTriggers(() =>
      processSettlementCore(ALICE, { friendUserId: BOB })
    );

    expect(result.amountSettled).toBeCloseTo(30, 2);
    expect(result.billsSettled).toBe(3);

    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(0, 2);
    expect(bal!.unsettledBillIds ?? []).toEqual([]);

    // Flow-through: pipeline re-fired from settledPersonIds → event pair zeroed
    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(0, 2);

    const settlement = await getDoc('settlements', result.settlementId);
    expect(settlement!.fromUserId).toBe(BOB);            // debtor
    expect(settlement!.toUserId).toBe(ALICE);            // creditor
    expect(settlement!.amount).toBeCloseTo(30, 2);
    expect(settlement!.settledBillIds).toEqual(expect.arrayContaining(['b1', 'b2', 'b3']));

    for (const id of ['b1', 'b2', 'b3']) {
      const b = (await db.collection('bills').doc(id).get()).data()!;
      expect(b.settledPersonIds).toContain('user-bob');
    }
  });

  it('event settlement settles only event bills and flows through to the global balance', async () => {
    const result = await withBillTriggers(() =>
      processEventSettlementCore(ALICE, { eventId: EVENT_ID, friendUserId: BOB })
    );

    expect(result.amountSettled).toBeCloseTo(10, 2);
    expect(result.billsSettled).toBe(1);

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(0, 2);

    // Flow-through reduced global by exactly the event amount: 30 - 10 = 20
    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(20, 2);
    expect(bal!.unsettledBillIds).toEqual(expect.arrayContaining(['b1', 'b2']));
    expect(bal!.unsettledBillIds).not.toContain('b3');

    // Non-event bills untouched
    const b1 = (await db.collection('bills').doc('b1').get()).data()!;
    expect(b1.settledPersonIds ?? []).not.toContain('user-bob');

    const settlement = await getDoc('settlements', result.settlementId);
    expect(settlement!.eventId).toBe(EVENT_ID);
  });

  it('reversing a global settlement restores both ledgers', async () => {
    const settled = await withBillTriggers(() =>
      processSettlementCore(ALICE, { friendUserId: BOB })
    );
    expect((await getDoc('balances', PAIR_ID))!.balance).toBeCloseTo(0, 2);

    const reversed = await withBillTriggers(() =>
      processSettlementReversalCore(ALICE, { settlementId: settled.settlementId })
    );
    expect(reversed.reversed).toBe(true);
    expect(reversed.billsReversed).toBe(3);

    const bal = await getDoc('balances', PAIR_ID);
    expect(bal!.balance).toBeCloseTo(30, 2);
    expect(bal!.unsettledBillIds).toEqual(expect.arrayContaining(['b1', 'b2', 'b3']));

    const eventBal = await getDoc('event_balances', EVENT_PAIR_ID);
    expect(eventBal!.balance).toBeCloseTo(10, 2);

    for (const id of ['b1', 'b2', 'b3']) {
      const b = (await db.collection('bills').doc(id).get()).data()!;
      expect(b.settledPersonIds ?? []).not.toContain('user-bob');
    }
  });
});
```

- [ ] **Step 2: Run** — `npm run test:integration` → all suites PASS.

Note: the `beforeEach` sanity `expect`s guard fixture drift — if THEY fail, the problem is in Task 6/7 territory (pipeline or fixture), not settlement.

- [ ] **Step 3: Checkpoint** — ask user (`test: integration coverage for settlement, event settlement, and reversal flows`).

---

### Task 9: Recurring bills + friend-add retro-scan tests

**Files:**
- Create: `tests/integration/recurringAndFriends.int.test.ts`

Note on the friend-add scenario: `resolveEligibleFriends` links people via `participantIds`/`user-` ids (not via friendship), so the retro-scan's observable contract today is *touch shared bills → idempotent re-process* (no balance change), not *create a missing balance*. The test asserts that contract.

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { db, clearFirestore } from './helpers/env';
import { makeBill, makeUser } from './helpers/builders';
import { writeBill, updateUser, withBillTriggers } from './helpers/triggerLoop';
import { generateDueRecurringBills } from '../../functions/src/recurringBillProcessor';

const ALICE = 'alice';
const BOB = 'bob';
const PAIR_ID = 'alice_bob';

async function getBalance() {
  const snap = await db.collection('balances').doc(PAIR_ID).get();
  return snap.exists ? snap.data()! : null;
}

describe('recurring bill generation', () => {
  beforeEach(clearFirestore);

  const template = {
    id: 'rec1',
    ownerId: ALICE,
    ownerName: 'Alice',
    title: 'Rent',
    amount: 100,
    paidById: ALICE,
    people: [
      { id: `user-${ALICE}`, name: 'Alice' },
      { id: `user-${BOB}`, name: 'Bob' },
    ],
    splitEvenly: true,
    schedule: { frequency: 'monthly', dayOfMonth: 1, startDate: '2026-01-01' },
    status: 'active',
    nextRunDate: '2026-07-01',
    lastRunDate: '2026-06-01',
    generatedBillIds: [],
  };

  it('generates a due bill and the pipeline picks it up', async () => {
    await db.collection('recurring_bills').doc('rec1').set(template);

    const result = await withBillTriggers(() => generateDueRecurringBills(db, '2026-07-01'));
    expect(result.created).toBe(1);

    const bills = await db.collection('bills')
      .where('recurringBillId', '==', 'rec1').get();
    expect(bills.size).toBe(1);

    // $100 split evenly between 2 → Bob owes Alice 50
    const bal = await getBalance();
    expect(bal!.balance).toBeCloseTo(50, 2);
  });

  it('running the same generation pass twice is idempotent', async () => {
    await db.collection('recurring_bills').doc('rec1').set(template);

    await withBillTriggers(() => generateDueRecurringBills(db, '2026-07-01'));
    const second = await withBillTriggers(() => generateDueRecurringBills(db, '2026-07-01'));
    expect(second.created).toBe(0);

    const bills = await db.collection('bills')
      .where('recurringBillId', '==', 'rec1').get();
    expect(bills.size).toBe(1);

    const bal = await getBalance();
    expect(bal!.balance).toBeCloseTo(50, 2);              // not 100
  });
});

describe('friend-add retroactive scan', () => {
  beforeEach(clearFirestore);

  async function seedSharedBill() {
    await db.collection('users').doc(ALICE).set(makeUser({ friends: [] }));
    await writeBill('bill-1', makeBill({
      ownerId: ALICE,
      people: [{ uid: ALICE, name: 'Alice' }, { uid: BOB, name: 'Bob' }],
      items: [{ name: 'Pizza', price: 24 }],
      itemAssignments: { 'item-1': ['user-alice', 'user-bob'] },
    }));
    expect((await getBalance())!.balance).toBeCloseTo(12, 2);
  }

  it('adding a friend touches shared bills and re-processes them idempotently', async () => {
    await seedSharedBill();

    await updateUser(ALICE, { friends: [BOB] });

    const bill = (await db.collection('bills').doc('bill-1').get()).data()!;
    expect(bill._friendScanTrigger).toBeDefined();        // scan touched the bill

    const bal = await getBalance();
    expect(bal!.balance).toBeCloseTo(12, 2);              // no double-count
    expect(bal!.unsettledBillIds).toEqual(['bill-1']);
  });

  it('a user update that adds no friends touches nothing', async () => {
    await seedSharedBill();
    const before = (await db.collection('bills').doc('bill-1').get()).updateTime;

    await updateUser(ALICE, { venmoId: 'alice-venmo' });

    const after = (await db.collection('bills').doc('bill-1').get()).updateTime;
    expect(after.isEqual(before)).toBe(true);             // bill untouched
    expect((await getBalance())!.balance).toBeCloseTo(12, 2);
  });
});
```

- [ ] **Step 2: Run** — `npm run test:integration` → all suites PASS.

If the recurring test fails on the generated bill's shape (e.g. `paidById` format), read `functions/src/recurringBillProcessor.ts` `buildBillPayload` + the doc-construction block (lines ~160–230) and fix the *template fixture* to match what the wizard writes (`src/components/recurring-wizard/`), not the assertion style.

- [ ] **Step 3: Checkpoint** — ask user (`test: integration coverage for recurring generation and friend-add retro-scan`).

---

### Task 10: Final verification + docs

**Files:**
- Modify: `CLAUDE.md` (Unit tests section — add integration test paragraph)

- [ ] **Step 1: Full verification matrix — run all three, paste outputs**

```bash
npm test                      # unit tests: PASS, no tests/integration files listed
npm run test:integration      # all integration suites PASS
cd functions && npm run build # tsc exit 0
```

- [ ] **Step 2: Confirm the safety guard one last time**

Run: `npx vitest run --config vitest.integration.config.ts 2>&1 | head -20`
Expected: immediate failure with `FIRESTORE_EMULATOR_HOST is not set`.

- [ ] **Step 3: Document in CLAUDE.md**

Append to the "Unit tests (Vitest)" section:

```markdown
### Integration tests (Firestore emulator)

Full backend flows (ledger pipeline, settlements, event cascade, recurring
generation) are integration-tested in `tests/integration/*.int.test.ts`:

\```bash
npm run test:integration   # starts the Firestore emulator (Java required), runs, tears down
\```

- Runs under the offline-only project `demo-bill-split-test` — can never touch
  prod or beta. The setup guard throws if `FIRESTORE_EMULATOR_HOST` is unset.
- Cloud Function logic is invoked in-process via the exported `process*` cores;
  `tests/integration/helpers/triggerLoop.ts` simulates Firestore trigger re-fires.
- Excluded from `npm test` (units stay Java-free) and not wired into CI (local-only).
\```
(remove the backslashes — they only escape this plan's code fence)

- [ ] **Step 4: Final checkpoint** — ask the user whether to commit everything (suggest one commit per task as staged above, or a single `test: add ledger pipeline integration test suite (Firestore emulator)`).

---

## Deferred scenarios (surfaced during planning — NOT in this batch)

Flag these to the user at the end; each may expose a real product bug:

1. **Event delete with `paidById !== ownerId`:** `processEventDelete` reverses footprints with `ownerId` as anchor; the bill-delete pipeline path uses `paidById || ownerId`. If a payer≠owner event bill is deleted via event cascade, the reversal may target the wrong balance doc. Worth a dedicated failing-test investigation.
2. **Retro-scan creating missing balances:** the friend-add scan can only re-touch bills already carrying the friend's UID in `participantIds`; it cannot link a guest (`person-*`) person. If the product expects "add friend → historical guest bills produce balances", that path has no mechanism today.
3. **Concurrent pipeline runs:** the emulator supports transaction contention; a test firing two `processLedgerWrite` calls concurrently would exercise retry behavior. Skipped as flaky-prone; revisit if production shows contention bugs.
