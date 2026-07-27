/**
 * reconcileLedger.ts — cloud-side ledger reconciliation.
 *
 * Rebuilds `balances` and `event_balances` from the source-of-truth bills,
 * repairing accumulated delta-drift, backfilling missing anchors, and removing
 * bug-artifact (junk) docs. Productionized form of scripts/reconcile-balances.mjs.
 *
 * Flow:
 *   1. Read all real bills (private|event), users, events.
 *   2. Build resolveFriendUids / resolveEventUids closures that mirror
 *      ledgerProcessor's resolveEligibleFriends / resolveEventParticipants
 *      (participantIds + people UIDs + shadow users + event memberIds).
 *   3. rebuildLedgerFromBills → authoritative aggregates.
 *   4. Read current balances + event_balances, diff → plan (patch / zero / delete).
 *   5. Unless dryRun, apply writes and stamp each bill's processed*AnchorId /
 *      processedEventId so future pipeline diffs are zero (idempotent).
 */

import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import {
  rebuildLedgerFromBills,
  type BillLike,
  type PairAgg,
} from '../../../shared/reconcileBalances.js';
import { computeBillPersonTotals } from '../../../shared/calculations.js';
import {
  personIdToFirebaseUid,
  calculateFriendFootprint,
  sanitizeFootprint,
  BALANCE_THRESHOLD,
} from '../../../shared/ledgerCalculations.js';

const BILLS_COLLECTION = 'bills';
const USERS_COLLECTION = 'users';
const EVENTS_COLLECTION = 'events';
const FRIEND_BALANCES_COLLECTION = 'balances';
const EVENT_BALANCES_COLLECTION = 'event_balances';

export interface ReconcileOpts {
  dryRun: boolean;
  /** Restrict writes to docs whose participants intersect this UID set. */
  uidFilter?: string[];
}

export interface ReconcileDetail {
  action: 'patch' | 'zero' | 'delete' | 'stamp';
  collection: string;
  id: string;
  participants?: string[];
  from?: { balance: number; bills: number };
  to?: { balance: number; bills: number };
}

export interface ReconcileReport {
  dryRun: boolean;
  scanned: number;
  patched: number;
  zeroed: number;
  deleted: number;
  billsStamped: number;
  details: ReconcileDetail[];
}

interface RawDoc {
  id: string;
  data: FirebaseFirestore.DocumentData;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Mirrors ledgerProcessor.resolveEligibleFriends but works against an
 * already-fetched users list (no per-bill query). Adds shadow users whose
 * `isShadow === true` and `createdById` is the bill's owner or anchor.
 */
function makeResolveFriendUids(
  users: RawDoc[]
): (bill: BillLike) => Set<string> {
  const shadowUsers = users.filter((u) => u.data.isShadow === true);
  return (bill: BillLike): Set<string> => {
    const ownerId = personIdToFirebaseUid(bill.ownerId);
    const anchorId = personIdToFirebaseUid(bill.paidById || bill.ownerId);
    const linked = new Set<string>();

    // 1. participantIds (real Firebase UIDs)
    const participantIds = (bill as unknown as { participantIds?: string[] }).participantIds || [];
    for (const id of participantIds) linked.add(id);

    // 2. people array (extract real UIDs, filter synthetic ids)
    for (const person of bill.people || []) {
      const uid = personIdToFirebaseUid(person.id);
      if (uid && !uid.startsWith('guest-') && !uid.startsWith('person-') && uid !== 'anonymous') {
        linked.add(uid);
      }
    }

    // 3. fallback to anchor/owner
    if (linked.size === 0) {
      linked.add(anchorId);
      linked.add(ownerId);
    }

    // 4. shadow users created by owner OR anchor
    for (const u of shadowUsers) {
      if ([ownerId, anchorId].includes(u.data.createdById)) linked.add(u.id);
    }

    return linked;
  };
}

/**
 * Mirrors ledgerProcessor.resolveEventParticipants: the linked-friend set plus
 * the event's memberIds (excluding the anchor). Uses already-fetched events.
 */
function makeResolveEventUids(
  events: RawDoc[],
  resolveFriendUids: (bill: BillLike) => Set<string>
): (bill: BillLike) => Set<string> {
  const eventsById = new Map(events.map((e) => [e.id, e]));
  return (bill: BillLike): Set<string> => {
    const anchorId = personIdToFirebaseUid(bill.paidById || bill.ownerId);
    const eligible = new Set(resolveFriendUids(bill));
    if (bill.eventId) {
      const ev = eventsById.get(bill.eventId);
      const memberIds: string[] = ev?.data.memberIds || [];
      for (const mid of memberIds) {
        if (mid !== anchorId) eligible.add(mid);
      }
    }
    return eligible;
  };
}

async function readAll(db: Firestore, collection: string): Promise<RawDoc[]> {
  const snap = await db.collection(collection).get();
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

/**
 * Extracts participant UIDs from a balance doc — prefers the stored
 * `participants` field, falls back to parsing the doc id.
 */
function docParticipants(doc: RawDoc, isEvent: boolean): string[] {
  const stored = doc.data.participants;
  if (Array.isArray(stored) && stored.length > 0) return stored;
  // Friend doc id: "uidA_uidB". Event doc id: "eventId_uidA_uidB".
  const parts = doc.id.split('_');
  return isEvent ? parts.slice(1) : parts;
}

/**
 * A doc is junk when it is a self-pair or names a participant that is not a
 * known real user (malformed / synthetic ids). Such docs are deleted.
 */
function isJunk(participants: string[], knownUsers: Set<string>): boolean {
  if (participants.length === 2 && participants[0] === participants[1]) return true;
  return participants.some(
    (p) => typeof p !== 'string' || p.startsWith('user-') || !knownUsers.has(p)
  );
}

/** True when the doc's participants intersect the uidFilter (or no filter set). */
function inFilter(participants: string[], uidFilter?: Set<string>): boolean {
  if (!uidFilter || uidFilter.size === 0) return true;
  return participants.some((p) => uidFilter.has(p));
}

interface PlanOp {
  op: 'patch' | 'zero' | 'delete';
  collection: string;
  id: string;
  participants: string[];
  eventId?: string;
  /**
   * `balance` is rounded to cents for the human-facing report and change
   * detection; `rawBalance` is the full-precision value actually persisted so a
   * future pipeline diff against it is exactly zero.
   */
  to?: { balance: number; rawBalance: number; unsettledBillIds: string[] };
  from?: { balance: number; bills: number };
}

/**
 * Diffs current balance docs against the rebuilt aggregates and produces a plan.
 *  - patch:  rebuilt requires a non-zero balance that differs from current.
 *  - zero:   real pair that should be 0 but currently isn't.
 *  - delete: junk doc (self-pair / unknown participant).
 * Brand-new required docs (not present yet) are emitted as patches.
 */
function buildPlan(
  collection: string,
  current: RawDoc[],
  rebuilt: Map<string, PairAgg>,
  isEvent: boolean,
  knownUsers: Set<string>,
  uidFilter: Set<string> | undefined
): PlanOp[] {
  const plan: PlanOp[] = [];
  const seen = new Set<string>();

  for (const doc of current) {
    const participants = docParticipants(doc, isEvent);
    if (!inFilter(participants, uidFilter)) continue;
    seen.add(doc.id);

    const junk = isJunk(participants, knownUsers);
    const r = rebuilt.get(doc.id);
    const curBal = round((doc.data.balance as number) || 0);
    const curBills: string[] = doc.data.unsettledBillIds || [];

    const rebuiltIsMeaningful =
      r && (Math.abs(r.balance) > BALANCE_THRESHOLD || r.unsettledBillIds.length > 0);

    if (rebuiltIsMeaningful) {
      const nb = round(r!.balance);
      const nbills = [...r!.unsettledBillIds].sort();
      // Compare raw (full-precision) values so sub-cent drift is not masked by
      // rounding both sides before the diff. Rounded values are still used for
      // the human-facing report fields (from/to) below.
      const balanceChanged = Math.abs(((doc.data.balance as number) || 0) - r!.balance) > BALANCE_THRESHOLD;
      const billsChanged =
        JSON.stringify([...curBills].sort()) !== JSON.stringify(nbills);
      if (balanceChanged || billsChanged) {
        plan.push({
          op: 'patch',
          collection,
          id: doc.id,
          participants: r!.participants,
          ...(r!.eventId && { eventId: r!.eventId }),
          to: { balance: nb, rawBalance: r!.balance, unsettledBillIds: nbills },
          from: { balance: curBal, bills: curBills.length },
        });
      }
    } else if (junk) {
      plan.push({ op: 'delete', collection, id: doc.id, participants, from: { balance: curBal, bills: curBills.length } });
    } else if (Math.abs(curBal) > BALANCE_THRESHOLD || curBills.length > 0) {
      plan.push({ op: 'zero', collection, id: doc.id, participants, from: { balance: curBal, bills: curBills.length } });
    }
  }

  // Required docs that don't exist yet → create via patch.
  for (const [id, r] of rebuilt) {
    if (seen.has(id)) continue;
    if (!inFilter(r.participants, uidFilter)) continue;
    if (Math.abs(r.balance) > BALANCE_THRESHOLD || r.unsettledBillIds.length > 0) {
      plan.push({
        op: 'patch',
        collection,
        id,
        participants: r.participants,
        ...(r.eventId && { eventId: r.eventId }),
        to: { balance: round(r.balance), rawBalance: r.balance, unsettledBillIds: [...r.unsettledBillIds].sort() },
      });
    }
  }

  return plan;
}

/**
 * Local replica of ledgerProcessor's private `stripZeros` — drops entries whose
 * absolute value is at or below BALANCE_THRESHOLD. Must match the pipeline
 * exactly so the persisted footprint is byte-for-byte what the pipeline would
 * write (`sanitizeFootprint(stripZeros(newFootprint), anchorId)`).
 */
function stripZeros(footprint: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [k, v] of Object.entries(footprint)) {
    if (Math.abs(v) > BALANCE_THRESHOLD) result[k] = v;
  }
  return result;
}

/**
 * True when two footprints are equal within BALANCE_THRESHOLD per key AND have
 * the identical key set. `stored` keys are normalized to Firebase UIDs (legacy
 * footprints may be keyed by raw person ids).
 */
function footprintsEqual(
  correct: Record<string, number>,
  stored: Record<string, number>
): boolean {
  const normStored: Record<string, number> = {};
  for (const [k, v] of Object.entries(stored)) normStored[personIdToFirebaseUid(k)] = v;
  const ck = Object.keys(correct);
  const sk = Object.keys(normStored);
  if (ck.length !== sk.length) return false;
  return ck.every(
    (k) => k in normStored && Math.abs((correct[k] || 0) - (normStored[k] || 0)) <= BALANCE_THRESHOLD
  );
}

/**
 * Recomputes each bill's correct footprint VALUES and returns the fields needed
 * to make the STORED footprint match, so the live pipeline diffs to zero after
 * reconciliation.
 *
 * Crucially this rewrites the footprint VALUES (not just the anchor), porting
 * the reference script's "footprint normalization" pass: a corrupt legacy
 * `processedBalances` would otherwise cause the next pipeline pass to diff
 * (correctNewFootprint − storedCorruptFootprint) → a non-zero delta → re-drift.
 *
 * The persisted values are UNROUNDED (raw float from the calc) and produced via
 * `sanitizeFootprint(stripZeros(fp), anchorId)` — identical to what
 * `applyFriendLedger`/`applyEventPairLedger` persist — so a future diff is zero.
 *
 * A bill is only stamped when the recomputed footprint (or anchor / eventId)
 * actually differs from what's stored, keeping the pass idempotent: a second
 * run stamps ~0 bills.
 */
function computeBillStamps(
  bills: RawDoc[],
  resolveFriendUids: (bill: BillLike) => Set<string>,
  resolveEventUids: (bill: BillLike) => Set<string>
): Map<string, Record<string, unknown>> {
  const stamps = new Map<string, Record<string, unknown>>();

  for (const bill of bills) {
    const d = bill.data;
    const ownerId = personIdToFirebaseUid(d.ownerId);
    const anchorId = personIdToFirebaseUid(d.paidById || d.ownerId);
    const people = d.people || [];
    const fields: Record<string, unknown> = {};

    // Mirror rebuildLedgerFromBills' skip: incomplete bills produce no footprint.
    const computable = Boolean(d.billData?.items?.length) && Boolean(ownerId) && people.length > 0;

    const billLike: BillLike = {
      id: bill.id,
      ownerId: d.ownerId,
      paidById: d.paidById,
      billData: d.billData,
      people,
      itemAssignments: d.itemAssignments || {},
      splitEvenly: Boolean(d.splitEvenly),
      settledPersonIds: d.settledPersonIds || [],
      eventId: d.eventId,
      ...(d.participantIds && { participantIds: d.participantIds }),
    } as BillLike;

    const personTotals = computable
      ? computeBillPersonTotals(d.billData, people, d.itemAssignments || {}, Boolean(d.splitEvenly))
      : [];

    // ── Friend footprint ──
    const correctFriendFp = computable
      ? sanitizeFootprint(
          stripZeros(
            calculateFriendFootprint({
              people,
              personTotals,
              settledPersonIds: d.settledPersonIds || [],
              linkedFriendUids: resolveFriendUids(billLike),
              ownerId,
              creditorId: anchorId,
            })
          ),
          anchorId
        )
      : {};

    const storedFriendFp: Record<string, number> = d.processedBalances || {};
    const friendValuesDiffer = !footprintsEqual(correctFriendFp, storedFriendFp);
    const friendHasFootprint = Object.keys(correctFriendFp).length > 0;
    const friendAnchorDiffers =
      friendHasFootprint && d.processedBalancesAnchorId !== anchorId;
    if (friendValuesDiffer || friendAnchorDiffers) {
      fields.processedBalances = correctFriendFp;
      // Anchor only carries meaning when there's a footprint to anchor.
      fields.processedBalancesAnchorId = friendHasFootprint ? anchorId : (d.processedBalancesAnchorId ?? anchorId);
    }

    // ── Event footprint (only for event bills) ──
    if (d.eventId) {
      const correctEventFp = computable
        ? sanitizeFootprint(
            stripZeros(
              calculateFriendFootprint({
                people,
                personTotals,
                settledPersonIds: d.settledPersonIds || [],
                linkedFriendUids: resolveEventUids(billLike),
                ownerId,
                creditorId: anchorId,
              })
            ),
            anchorId
          )
        : {};

      const storedEventFp: Record<string, number> = d.processedEventBalances || {};
      const eventValuesDiffer = !footprintsEqual(correctEventFp, storedEventFp);
      const eventHasFootprint = Object.keys(correctEventFp).length > 0;
      const eventAnchorDiffers =
        eventHasFootprint && d.processedEventBalancesAnchorId !== anchorId;
      const eventIdDiffers = eventHasFootprint && d.processedEventId !== d.eventId;
      if (eventValuesDiffer || eventAnchorDiffers || eventIdDiffers) {
        fields.processedEventBalances = correctEventFp;
        fields.processedEventBalancesAnchorId = eventHasFootprint ? anchorId : (d.processedEventBalancesAnchorId ?? anchorId);
        fields.processedEventId = eventHasFootprint ? d.eventId : (d.processedEventId ?? d.eventId);
      }
    }

    if (Object.keys(fields).length > 0) stamps.set(bill.id, fields);
  }
  return stamps;
}

export async function reconcileLedgerCore(
  db: Firestore,
  opts: ReconcileOpts
): Promise<ReconcileReport> {
  const { dryRun } = opts;
  const uidFilter = opts.uidFilter && opts.uidFilter.length > 0 ? new Set(opts.uidFilter) : undefined;

  // ── 1. Read source-of-truth collections ──
  const [allBills, users, events, curFriend, curEvent] = await Promise.all([
    readAll(db, BILLS_COLLECTION),
    readAll(db, USERS_COLLECTION),
    readAll(db, EVENTS_COLLECTION),
    readAll(db, FRIEND_BALANCES_COLLECTION),
    readAll(db, EVENT_BALANCES_COLLECTION),
  ]);

  const realBills = allBills.filter((b) => ['private', 'event'].includes(b.data.billType));
  const knownUsers = new Set(users.map((u) => u.id));

  // ── 2. Eligibility resolvers (mirror ledgerProcessor) ──
  const resolveFriendUids = makeResolveFriendUids(users);
  const resolveEventUids = makeResolveEventUids(events, resolveFriendUids);

  // ── 3. Rebuild authoritative aggregates ──
  const billLikes: BillLike[] = realBills.map((b) => ({
    id: b.id,
    ownerId: b.data.ownerId,
    paidById: b.data.paidById,
    billData: b.data.billData,
    people: b.data.people || [],
    itemAssignments: b.data.itemAssignments || {},
    splitEvenly: Boolean(b.data.splitEvenly),
    settledPersonIds: b.data.settledPersonIds || [],
    eventId: b.data.eventId,
    // participantIds is not part of BillLike; the resolver reads it off the object.
    ...(b.data.participantIds && { participantIds: b.data.participantIds }),
  } as BillLike));

  const { friend, event } = rebuildLedgerFromBills({
    bills: billLikes,
    resolveFriendUids,
    resolveEventUids,
  });

  // ── 4. Diff → plan ──
  const friendPlan = buildPlan(FRIEND_BALANCES_COLLECTION, curFriend, friend, false, knownUsers, uidFilter);
  const eventPlan = buildPlan(EVENT_BALANCES_COLLECTION, curEvent, event, true, knownUsers, uidFilter);
  const plan = [...friendPlan, ...eventPlan];

  const billStamps = computeBillStamps(realBills, resolveFriendUids, resolveEventUids);
  // Respect uidFilter for stamps: only stamp bills touching a filtered UID.
  const filteredStamps = new Map<string, Record<string, unknown>>();
  for (const [billId, fields] of billStamps) {
    if (!uidFilter) {
      filteredStamps.set(billId, fields);
      continue;
    }
    const bill = realBills.find((b) => b.id === billId)!;
    const anchorId = personIdToFirebaseUid(bill.data.paidById || bill.data.ownerId);
    const touches = new Set<string>([anchorId]);
    for (const p of bill.data.people || []) touches.add(personIdToFirebaseUid(p.id));
    for (const id of bill.data.participantIds || []) touches.add(id);
    if ([...touches].some((u) => uidFilter.has(u))) filteredStamps.set(billId, fields);
  }

  const report: ReconcileReport = {
    dryRun,
    scanned: curFriend.length + curEvent.length,
    patched: 0,
    zeroed: 0,
    deleted: 0,
    billsStamped: 0,
    details: [],
  };

  for (const op of plan) {
    if (op.op === 'patch') report.patched++;
    else if (op.op === 'zero') report.zeroed++;
    else if (op.op === 'delete') report.deleted++;
    report.details.push({
      action: op.op,
      collection: op.collection,
      id: op.id,
      participants: op.participants,
      ...(op.from && { from: op.from }),
      ...(op.to && { to: { balance: op.to.balance, bills: op.to.unsettledBillIds.length } }),
    });
  }
  report.billsStamped = filteredStamps.size;
  for (const [billId] of filteredStamps) {
    report.details.push({ action: 'stamp', collection: BILLS_COLLECTION, id: billId });
  }

  // ── 5. Apply (unless dry run) ──
  if (!dryRun) {
    const now = Timestamp.now();
    // Batched writes (chunked at 400 to stay under the 500-op limit).
    let batch = db.batch();
    let count = 0;
    const flushIfNeeded = async () => {
      if (count >= 400) {
        await batch.commit();
        batch = db.batch();
        count = 0;
      }
    };

    for (const op of plan) {
      const ref = db.collection(op.collection).doc(op.id);
      if (op.op === 'delete') {
        batch.delete(ref);
      } else if (op.op === 'zero') {
        batch.set(ref, { balance: 0, unsettledBillIds: [], lastUpdatedAt: now }, { merge: true });
      } else {
        batch.set(
          ref,
          {
            id: op.id,
            participants: op.participants,
            // Persist FULL precision to match the pipeline's stored balance so a
            // future pipeline delta diffs to exactly zero.
            balance: op.to!.rawBalance,
            unsettledBillIds: op.to!.unsettledBillIds,
            ...(op.eventId && { eventId: op.eventId }),
            lastUpdatedAt: now,
          },
          { merge: true }
        );
      }
      count++;
      await flushIfNeeded();
    }

    for (const [billId, fields] of filteredStamps) {
      batch.update(db.collection(BILLS_COLLECTION).doc(billId), fields as Record<string, FieldValue | unknown>);
      count++;
      await flushIfNeeded();
    }

    if (count > 0) await batch.commit();
  }

  logger.info('reconcileLedger complete', {
    dryRun,
    scanned: report.scanned,
    patched: report.patched,
    zeroed: report.zeroed,
    deleted: report.deleted,
    billsStamped: report.billsStamped,
  });

  return report;
}
