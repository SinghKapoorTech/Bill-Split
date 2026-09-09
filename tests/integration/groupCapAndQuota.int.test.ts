import { describe, it, expect, beforeEach } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { db, clearFirestore } from './helpers/env';
import { countOwnedActiveEvents, decideGroupCap, capMessage } from '../../functions/src/eventFunctions';
import { checkScanQuota, commitScanQuotaUsage } from '../../functions/src/scanQuotaLimiter';
import { getEffectiveEntitlement } from '../../functions/src/entitlementService';
import { isPersistableItemPrice, itemSumIsCoherent } from '../../shared/receiptAmounts';

/**
 * Free-tier cap plumbing against a real Firestore.
 *
 * The pure arithmetic is unit-tested (tests/scanQuota, tests/monetizationLimits,
 * tests/entitlements). What can ONLY be proven against a real database is here:
 *
 *  - that the active-group count survives documents with no `archived` field,
 *    which is the specific way a naive `where('archived','==',false)` silently
 *    under-counts and lets a user sail past the cap;
 *  - that the quota shares `usage/{uid}` with the hourly rate limiter WITHOUT
 *    clobbering it;
 *  - that a failed scan leaves the quota untouched.
 */

const ALICE = 'alice';
const BOB = 'bob';

async function seedEvent(id: string, ownerId: string, archived?: boolean): Promise<void> {
  await db.doc(`events/${id}`).set({
    name: id,
    ownerId,
    memberIds: [ownerId],
    ...(archived === undefined ? {} : { archived }),
  });
}

describe('countOwnedActiveEvents', () => {
  beforeEach(clearFirestore);

  it('counts nothing for a user with no events', async () => {
    expect(await countOwnedActiveEvents(db, ALICE)).toBe(0);
  });

  // THE trap this function exists to avoid. Firestore does not match documents
  // that are MISSING a field, so `where('archived','==',false)` would return 0
  // here and report a user with three active groups as having none.
  it('counts events that have NO archived field at all', async () => {
    await seedEvent('e1', ALICE);
    await seedEvent('e2', ALICE);
    await seedEvent('e3', ALICE);
    expect(await countOwnedActiveEvents(db, ALICE)).toBe(3);
  });

  it('excludes archived events and includes explicitly active ones', async () => {
    await seedEvent('e1', ALICE, false);
    await seedEvent('e2', ALICE, true);
    await seedEvent('e3', ALICE);
    expect(await countOwnedActiveEvents(db, ALICE)).toBe(2);
  });

  it('counts only events the user OWNS, not ones they are merely a member of', async () => {
    await seedEvent('mine', ALICE, false);
    await db.doc('events/theirs').set({
      name: 'theirs',
      ownerId: BOB,
      memberIds: [BOB, ALICE],
      archived: false,
    });
    expect(await countOwnedActiveEvents(db, ALICE)).toBe(1);
    expect(await countOwnedActiveEvents(db, BOB)).toBe(1);
  });

  it('drops to zero once everything is archived, freeing every slot', async () => {
    await seedEvent('e1', ALICE, true);
    await seedEvent('e2', ALICE, true);
    expect(await countOwnedActiveEvents(db, ALICE)).toBe(0);
  });

  // Only a literal `true` archives — a bad write must not free a slot the user
  // never actually freed.
  it('treats a truthy-but-not-true archived value as ACTIVE', async () => {
    await db.doc('events/weird').set({
      name: 'weird',
      ownerId: ALICE,
      memberIds: [ALICE],
      archived: 'true',
    });
    expect(await countOwnedActiveEvents(db, ALICE)).toBe(1);
  });
});

describe('decideGroupCap — the dark-launch switch', () => {
  it('allows past the cap while enforcement is DARK, but records wouldBlock', () => {
    expect(decideGroupCap(5, 2, false, false)).toMatchObject({ allowed: true, wouldBlock: true });
  });

  it('blocks at the cap once enforcement is ON', () => {
    expect(decideGroupCap(2, 2, false, true)).toMatchObject({ allowed: false, wouldBlock: true });
  });

  it('allows below the cap either way', () => {
    expect(decideGroupCap(1, 2, false, true)).toMatchObject({ allowed: true, wouldBlock: false });
    expect(decideGroupCap(1, 2, false, false)).toMatchObject({ allowed: true, wouldBlock: false });
  });

  it('never blocks an unlimited plan, even far past the cap', () => {
    expect(decideGroupCap(99, 2, true, true)).toMatchObject({ allowed: true, wouldBlock: false });
  });

  // -1 is "not counted" — a failed aggregation. Failing open is deliberate: a
  // missing index or a Firestore blip must not stop people making groups.
  it('never blocks when the count is unavailable', () => {
    expect(decideGroupCap(-1, 2, false, true)).toMatchObject({ allowed: true, wouldBlock: false });
  });
});

describe('getEffectiveEntitlement', () => {
  beforeEach(clearFirestore);

  // Absence is the normal steady state until the RevenueCat webhook lands in
  // chunk 4 — every user reads as free, and that is not an error.
  it('reports free (and NOT degraded) when no document exists', async () => {
    expect(await getEffectiveEntitlement(ALICE)).toEqual({
      plan: 'free',
      unlimited: false,
      degraded: false,
    });
  });

  it('reads an active pro subscription', async () => {
    await db.doc(`entitlements/${ALICE}`).set({
      plan: 'pro',
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
    });
    expect(await getEffectiveEntitlement(ALICE)).toMatchObject({ plan: 'pro', unlimited: true });
  });

  it('treats an expired subscription as free', async () => {
    await db.doc(`entitlements/${ALICE}`).set({
      plan: 'pro',
      expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000),
    });
    expect(await getEffectiveEntitlement(ALICE)).toMatchObject({ plan: 'free', unlimited: false });
  });

  it('honours the billing grace period on an expired subscription', async () => {
    await db.doc(`entitlements/${ALICE}`).set({
      plan: 'pro',
      expiresAt: Timestamp.fromMillis(Date.now() - 86_400_000),
      inGracePeriod: true,
    });
    expect(await getEffectiveEntitlement(ALICE)).toMatchObject({ plan: 'pro', unlimited: true });
  });
});

describe('scan quota persistence on usage/{uid}', () => {
  beforeEach(clearFirestore);

  it('starts empty and allows the first scan', async () => {
    const d = await checkScanQuota(ALICE, 5);
    expect(d).toMatchObject({ allowed: true, used: 0, remaining: 5, degraded: false });
  });

  it('counts committed scans and blocks at the limit', async () => {
    for (let i = 0; i < 5; i++) {
      const d = await checkScanQuota(ALICE, 5);
      expect(d.allowed).toBe(true);
      await commitScanQuotaUsage(ALICE, d);
    }
    expect(await checkScanQuota(ALICE, 5)).toMatchObject({
      allowed: false,
      used: 5,
      remaining: 0,
    });
  });

  // Spec §4.3.1: a failed scan must not consume quota. The two-step design is
  // what guarantees it — a failure simply never reaches the commit.
  it('a checked-but-never-committed scan consumes NOTHING', async () => {
    const first = await checkScanQuota(ALICE, 5);
    await commitScanQuotaUsage(ALICE, first);

    // three "failed" scans: checked, never committed
    await checkScanQuota(ALICE, 5);
    await checkScanQuota(ALICE, 5);
    await checkScanQuota(ALICE, 5);

    expect(await checkScanQuota(ALICE, 5)).toMatchObject({ used: 1, remaining: 4 });
  });

  // The quota shares usage/{uid} with the hourly rate limiter. A plain `set`
  // here would wipe the rate window and hand back 30 fresh abuse-limit slots.
  it('MERGES, leaving the rate-limiter fields on the same document intact', async () => {
    const windowStart = Timestamp.fromMillis(Date.now());
    await db.doc(`usage/${ALICE}`).set({
      rateWindowStart: windowStart,
      rateCount: 17,
      consecutiveScanFailures: 2,
    });

    const d = await checkScanQuota(ALICE, 5);
    await commitScanQuotaUsage(ALICE, d);

    const after = (await db.doc(`usage/${ALICE}`).get()).data()!;
    expect(after.rateCount).toBe(17);
    expect(after.consecutiveScanFailures).toBe(2);
    expect(after.rateWindowStart.toMillis()).toBe(windowStart.toMillis());
    expect(after.scansThisPeriod).toBe(1);
  });

  it('tolerates a usage document that predates the quota fields', async () => {
    await db.doc(`usage/${ALICE}`).set({ rateCount: 3 });
    expect(await checkScanQuota(ALICE, 5)).toMatchObject({ allowed: true, used: 0 });
  });

  it('rolls over when the stored period is a previous month', async () => {
    const lastMonth = Date.UTC(2026, 7, 1);
    await db.doc(`usage/${ALICE}`).set({
      scanPeriodStart: Timestamp.fromMillis(lastMonth),
      scansThisPeriod: 5,
    });
    const d = await checkScanQuota(ALICE, 5, Date.UTC(2026, 8, 6));
    expect(d).toMatchObject({ allowed: true, used: 0, periodRolled: true });
  });
});

/**
 * The exact three-tap bypass the unarchive gate exists to close (spec §4.2.1):
 *
 *   create A, create B  → at the cap
 *   archive A           → frees a slot (always allowed, never gated)
 *   create C            → fills it
 *   unarchive A         → would be a THIRD active group
 *
 * If unarchiving were ungated, the cap would be worth nothing: repeat the last
 * two steps to reach any number of active groups.
 */
describe('the archive → create → unarchive bypass', () => {
  beforeEach(clearFirestore);

  const LIMIT = 2;

  async function walkTheScenario() {
    await seedEvent('A', ALICE, false);
    await seedEvent('B', ALICE, false);
    const atCap = await countOwnedActiveEvents(db, ALICE);

    await db.doc('events/A').update({ archived: true }); // archive is never gated
    const afterArchive = await countOwnedActiveEvents(db, ALICE);

    await seedEvent('C', ALICE, false);
    const afterThirdCreate = await countOwnedActiveEvents(db, ALICE);

    return { atCap, afterArchive, afterThirdCreate };
  }

  it('archiving genuinely frees a slot, and the new event fills it', async () => {
    const { atCap, afterArchive, afterThirdCreate } = await walkTheScenario();
    expect(atCap).toBe(2);
    expect(afterArchive).toBe(1);
    expect(afterThirdCreate).toBe(2);
  });

  it('BLOCKS the unarchive once enforcement is on — the bypass is closed', async () => {
    const { afterThirdCreate } = await walkTheScenario();
    const decision = decideGroupCap(afterThirdCreate, LIMIT, false, true);
    expect(decision.allowed).toBe(false);
    expect(decision.wouldBlock).toBe(true);
  });

  it('ALLOWS the unarchive while enforcement is dark, reaching 3 active groups', async () => {
    const { afterThirdCreate } = await walkTheScenario();
    const decision = decideGroupCap(afterThirdCreate, LIMIT, false, false);
    expect(decision.allowed).toBe(true);
    // Recorded even though it was permitted — this is the tuning signal.
    expect(decision.wouldBlock).toBe(true);

    await db.doc('events/A').update({ archived: false });
    expect(await countOwnedActiveEvents(db, ALICE)).toBe(3);
  });

  // The consequence of the dark launch: real users WILL be over the cap on the
  // day enforcement is switched on. They keep everything they have (the cap
  // gates create/unarchive only), but the wall copy has to be true for them.
  it('a user left OVER the cap by the dark period is still blocked from more', async () => {
    for (const id of ['A', 'B', 'C', 'D', 'E']) await seedEvent(id, ALICE, false);
    const count = await countOwnedActiveEvents(db, ALICE);
    expect(count).toBe(5);
    expect(decideGroupCap(count, LIMIT, false, true).allowed).toBe(false);
  });
});

describe('capMessage — the wall copy must be true for the user reading it', () => {
  // Spec §4.3.1: archive is offered FIRST. A wall that only offers payment when
  // a free escape exists is a dark pattern, and this is the assertion that stops
  // someone "tightening" the copy into a pure upsell later.
  it('always offers archiving before Pro', () => {
    for (const [count, limit] of [
      [2, 2],
      [5, 2],
    ] as const) {
      const msg = capMessage(count, limit);
      expect(msg).toMatch(/archive/i);
      expect(msg.toLowerCase().indexOf('archive')).toBeLessThan(
        msg.toLowerCase().indexOf('pro'),
      );
    }
  });

  it('uses the spec copy exactly at the boundary', () => {
    expect(capMessage(2, 2)).toBe(
      "You have 2 active groups. Archive one you're finished with, or go unlimited with Pro.",
    );
  });

  // The regression this fixes: capMessage previously took only `limit`, so a
  // user left with 5 active groups by the dark launch was told "You have 2".
  it('reports the REAL count when the user is over the cap', () => {
    const msg = capMessage(5, 2);
    expect(msg).toContain('5 active groups');
    expect(msg).toContain('free plan includes 2');
    expect(msg).not.toMatch(/You have 2 active groups/);
  });
});

/**
 * CONCURRENCY. `checkScanQuota` reads and `commitScanQuotaUsage` writes, with no
 * lock between them — so the only thing stopping N parallel scans from all
 * reading `used = 0` and all writing `1` is HOW the commit is expressed.
 *
 * An absolute write (`scansThisPeriod: used + 1`) collapses N concurrent scans
 * into a stored count of 1, which does not cost "one uncounted scan": it makes
 * the effective free tier the ABUSE limiter's ceiling of 30/hour instead of
 * 5/month, because the counter can never climb faster than one per serialized
 * round trip.
 *
 * `FieldValue.increment` is still a blind, non-aborting write, so it preserves
 * the reason this path must never transact: `usage/{uid}` is the document
 * `reserveScanSlot` transacts on, and that limiter FAILS CLOSED — a contender
 * here that could abort would deny a legitimate in-quota scan.
 */
describe('scan quota under concurrency', () => {
  beforeEach(clearFirestore);

  it('counts EVERY concurrent scan, not just one', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 5 }, () => checkScanQuota(ALICE, 5)),
    );
    // All five raced the read, so all five legitimately saw an empty quota.
    expect(decisions.every((d) => d.allowed && d.used === 0)).toBe(true);

    await Promise.all(decisions.map((d) => commitScanQuotaUsage(ALICE, d)));

    const after = await checkScanQuota(ALICE, 5);
    expect(after.used).toBe(5);
    expect(after.allowed).toBe(false);
  });

  it('still lands on the right period after a concurrent burst', async () => {
    const decisions = await Promise.all(
      Array.from({ length: 3 }, () => checkScanQuota(ALICE, 5)),
    );
    await Promise.all(decisions.map((d) => commitScanQuotaUsage(ALICE, d)));

    const doc = (await db.doc(`usage/${ALICE}`).get()).data()!;
    expect(doc.scansThisPeriod).toBe(3);
    expect(doc.scanPeriodStart.toMillis()).toBe(decisions[0].periodStartMs);
  });
});

/**
 * The end-to-end shape of "a failed scan is free", driven by the REAL receipt
 * validation helpers rather than a stand-in boolean.
 *
 * `analyzeBill` itself cannot be imported (it calls initializeApp at module
 * load), so this reproduces its sequence with the genuine pieces: check the
 * quota, run the same predicates the callable runs, and commit only if they
 * pass. The ORDERING inside the real callable is pinned separately, by source
 * analysis, in `tests/analyzeBillGates.test.ts`.
 */
describe('a failed scan does not consume quota (spec §4.3.1)', () => {
  beforeEach(clearFirestore);

  const LIMIT = 2;

  // A FIXED clock, passed explicitly into every checkScanQuota call below.
  //
  // The seeded scanPeriodStart is September 2026. Without this, checkScanQuota
  // would use the real Date.now(), and on 2026-10-01 the stored period becomes
  // stale: the quota rolls over, commitScanQuotaUsage takes its reset branch and
  // writes 1 rather than incrementing to 2, and four cases below start failing
  // with nothing in the repo having changed. The pre-existing case earlier in
  // this file already passes an explicit nowMs; this block was appended without
  // one, and an adversarial review caught the fuse.
  const NOW = Date.UTC(2026, 8, 6, 12, 0, 0);

  // Mirrors the callable's item gate: every item must have a usable price, and
  // the item sum must be coherent with the stated total.
  function receiptIsUsable(items: { name: string; price: unknown }[], total: number): boolean {
    if (items.length === 0) return false;
    // Matches functions/src/index.ts exactly. Bare truthiness (`i.name &&`) was
    // wrong in the user-unfavourable direction: a whitespace-only name like
    // '   ' is truthy, so this helper called the receipt usable and consumed a
    // scan, while the real callable throws ExtractionError and consumes none.
    const nameOk = (n: unknown) => typeof n === 'string' && n.trim().length > 0;
    if (!items.every((i) => nameOk(i.name) && isPersistableItemPrice(i.price))) return false;
    const sum = items.reduce((a, i) => a + (i.price as number), 0);
    return itemSumIsCoherent(sum, total);
  }

  async function attemptScan(
    items: { name: string; price: unknown }[],
    total: number,
  ): Promise<'committed' | 'rejected'> {
    const decision = await checkScanQuota(ALICE, LIMIT, NOW);
    if (!decision.allowed) return 'rejected';
    // The callable validates HERE, between check and commit. That gap is the
    // entire mechanism.
    if (!receiptIsUsable(items, total)) return 'rejected';
    // The decision carries its own periodStartMs, so pinning the check pins the
    // commit too.
    await commitScanQuotaUsage(ALICE, decision);
    return 'committed';
  }

  async function scansUsed(): Promise<number> {
    const snap = await db.doc(`usage/${ALICE}`).get();
    return (snap.data()?.scansThisPeriod as number | undefined) ?? 0;
  }

  beforeEach(async () => {
    await db.doc(`usage/${ALICE}`).set({
      scanPeriodStart: Timestamp.fromMillis(Date.UTC(2026, 8, 1)),
      scansThisPeriod: 1,
    });
  });

  it('a receipt with an unusable price leaves the count untouched', async () => {
    expect(await attemptScan([{ name: 'Meal', price: 'twelve' }], 12)).toBe('rejected');
    expect(await scansUsed()).toBe(1);
  });

  it('an empty item list leaves the count untouched', async () => {
    expect(await attemptScan([], 40)).toBe('rejected');
    expect(await scansUsed()).toBe(1);
  });

  it('a hallucinated item magnitude leaves the count untouched', async () => {
    // itemSumIsCoherent bounds the sum from ABOVE only: itemsSum <= total*2+100.
    // 900 against a printed total of 100 clears that by orders of magnitude,
    // which is the hallucination it exists to catch. It matters because person
    // totals are derived from the ITEM LIST, not from `total`, so a single bogus
    // price is the number a user actually gets charged.
    expect(await attemptScan([{ name: 'Steak', price: 900 }], 100)).toBe('rejected');
    expect(await scansUsed()).toBe(1);
  });

  it('an UNDER-sum is coherent and still costs a scan', async () => {
    // Deliberately loose in this direction: items normally sum to the subtotal,
    // which sits below the total once tax, tip or a service charge is added, and
    // a model that misses a line must not fail the whole receipt. Pinned so the
    // gate is never "tightened" into rejecting ordinary receipts.
    expect(await attemptScan([{ name: 'Soda', price: 5 }], 900)).toBe('committed');
    expect(await scansUsed()).toBe(2);
  });

  it('repeated failures never accumulate, however many are attempted', async () => {
    for (let i = 0; i < 6; i++) await attemptScan([{ name: 'Meal', price: NaN }], 12);
    expect(await scansUsed()).toBe(1);
    // ...and the user still has their second scan.
    expect(await checkScanQuota(ALICE, LIMIT, NOW)).toMatchObject({ allowed: true, remaining: 1 });
  });

  it('a usable receipt DOES consume one, taking the user to the cap', async () => {
    expect(await attemptScan([{ name: 'Meal', price: 24 }], 24)).toBe('committed');
    expect(await scansUsed()).toBe(2);
    expect(await checkScanQuota(ALICE, LIMIT, NOW)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('failures interleaved with a success advance the count exactly once', async () => {
    await attemptScan([{ name: 'Meal', price: 'nope' }], 12);
    await attemptScan([{ name: 'Meal', price: 24 }], 24);
    await attemptScan([], 0);
    expect(await scansUsed()).toBe(2);
  });
});
