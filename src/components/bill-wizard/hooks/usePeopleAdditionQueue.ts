import { useCallback, useEffect, useRef } from 'react';
import { Person } from '@/types';

/**
 * Guarantees that adding a person is never silently discarded.
 *
 * A bill is created just-in-time: until that write returns and the URL swaps
 * from `/bill/new` to `/bill/{id}`, there is no id to write to — and
 * `AIScanView` deliberately passes `activeSession = null` for drafts
 * (`effectiveSession = isDraft ? null : activeSession`), so there is no
 * fallback either. The previous code guarded the persist with a bare
 * `if (id)` and no else, so an add landing in that window went into local
 * React state and nowhere else: the UI showed the person, the wizard's
 * `people.length > 1` check accepted them, and the next Firestore snapshot
 * erased them with no error ever surfaced.
 *
 * Anything added before the id exists is queued and flushed the moment one
 * arrives. The queue survives a failed write and is retried with the next
 * addition, because dropping it would reintroduce exactly the silent loss
 * this hook exists to prevent.
 */
export function usePeopleAdditionQueue(
  billId: string | undefined,
  persist: (id: string, added: Person[]) => void | Promise<void>,
  /**
   * Called synchronously the moment people are accepted, BEFORE any write.
   * `BillWizard` uses it to mark the ids in flight so its snapshot
   * reconciliation will not adopt a server array over them while they wait —
   * without this, a queued person disappears from the visible People step.
   */
  onEnqueue?: (added: Person[]) => void,
) {
  // These three are assigned during render rather than in an effect. Callers
  // reach this after `await peopleManager.addPerson(...)`, and a ref written
  // in an effect would still hold the value from the commit BEFORE the await —
  // exactly the staleness this hook exists to prevent.
  const billIdRef = useRef(billId);
  billIdRef.current = billId;

  const persistRef = useRef(persist);
  persistRef.current = persist;

  const onEnqueueRef = useRef(onEnqueue);
  onEnqueueRef.current = onEnqueue;

  const queueRef = useRef<Person[]>([]);
  const flushingRef = useRef(false);

  /**
   * Writes `batch`, putting it BACK on the queue if the write fails so the
   * next addition (or the next id change) carries it along. Clearing the
   * queue before the write completed was the original defect here.
   */
  const runPersist = useCallback((id: string, batch: Person[]) => {
    flushingRef.current = true;
    try {
      // Invoked synchronously: the write must start in this tick, exactly as
      // it did before the queue existed. Only the failure handling is deferred.
      const result = persistRef.current(id, batch);
      Promise.resolve(result)
        .catch(() => {
          queueRef.current = [...batch, ...queueRef.current];
        })
        .finally(() => {
          flushingRef.current = false;
        });
    } catch {
      queueRef.current = [...batch, ...queueRef.current];
      flushingRef.current = false;
    }
  }, []);

  const addOrQueue = useCallback(
    (added: Person[]) => {
      if (added.length === 0) return;

      // Mark in flight first: these people are accepted from this instant,
      // whether or not there is anywhere to write them yet.
      onEnqueueRef.current?.(added);

      const id = billIdRef.current;
      if (!id) {
        queueRef.current.push(...added);
        return;
      }

      // Drain anything a previous failed flush left behind along with this add.
      const batch = queueRef.current.length > 0 ? [...queueRef.current, ...added] : [...added];
      queueRef.current = [];
      runPersist(id, batch);
    },
    [runPersist],
  );

  useEffect(() => {
    if (!billId || queueRef.current.length === 0 || flushingRef.current) return;
    const batch = queueRef.current;
    queueRef.current = [];
    runPersist(billId, batch);
  }, [billId, runPersist]);

  return addOrQueue;
}
