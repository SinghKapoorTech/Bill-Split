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
      (nextSnap.exists && currSnap.exists && !nextSnap.updateTime!.isEqual(currSnap.updateTime!));
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
