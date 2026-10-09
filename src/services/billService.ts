import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  orderBy,
  runTransaction,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/config/firebase';
import { Bill, BillData, BillType, BillMember, BillStatus } from '@/types/bill.types';
import { Person } from '@/types/person.types';
import { removeUndefinedFields } from '@/utils/firestoreHelpers';
import { personIdToFirebaseUid } from '@shared/ledgerCalculations';
import {
  checkBillInvariants,
  summarizeViolations,
  type InvariantViolation,
} from '@shared/billInvariants';

const BILLS_COLLECTION = 'bills';

/**
 * Fields that determine how much money the bill moves, and to whom. A write
 * carrying any of these is validated against the invariants
 * (docs/plans/bill-money-invariants.md) inside a transaction; anything else
 * (shareCode, title, status, timestamps) takes the cheap non-transactional
 * path, because an extra read per autosave is real latency and cost and buys
 * nothing where no money is at stake.
 */
const MONEY_FIELDS = [
  'people',
  'itemAssignments',
  'billData',
  'paidById',
  'splitEvenly',
  'settledPersonIds',
] as const;

function touchesMoney(updates: Partial<Bill>): boolean {
  return MONEY_FIELDS.some((f) => f in updates);
}

/**
 * Derives a flat array of Firebase UIDs from a bill's people array + owner.
 * Normalizes "user-{uid}" format to raw Firebase UIDs.
 * Deduplicates and always includes the owner.
 * This is the single source of truth for participantIds computation.
 */
function extractParticipantIds(ownerId: string, people: Person[]): string[] {
  const ids = new Set<string>();
  ids.add(ownerId);
  for (const person of people) {
    const uid = person.id.startsWith('user-') ? person.id.slice(5) : person.id;
    // Only include if it looks like a real Firebase UID (not a guest/anon ID)
    if (uid && !uid.startsWith('guest-') && !uid.startsWith('person-') && uid !== 'anonymous') {
      ids.add(uid);
    }
  }
  return Array.from(ids);
}

export const billService = {
  /**
   * Creates a new bill
   */
  async createBill(
    ownerId: string,
    ownerName: string,
    billType: BillType,
    billData: BillData,
    people: Person[],
    eventId?: string,
    squadId?: string,
    status: BillStatus = 'active',
  ): Promise<string> {
    const fn = httpsCallable<any, { billId: string }>(functions, 'createBill');
    const result = await fn({
      ownerId,
      ownerName,
      billType,
      billData,
      people,
      eventId,
      squadId,
      status,
    });
    return result.data.billId;
  },

  /**
   * Creates a new simple transaction
   */
  async createSimpleTransaction(
    ownerId: string,
    ownerName: string,
    amount: number,
    title: string,
    paidById: string,
    people: Person[],
    eventId?: string,
    squadId?: string,
    status: BillStatus = 'active',
  ): Promise<string> {
    const dummyItemId = `item-${Date.now()}`;
    const billData: BillData = {
      items: [
        {
          id: dummyItemId,
          name: title,
          price: amount,
        },
      ],
      subtotal: amount,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: amount,
      restaurantName: title,
    };

    const fn = httpsCallable<any, { billId: string }>(functions, 'createBill');
    const result = await fn({
      ownerId,
      ownerName,
      billType: eventId ? 'event' : 'private',
      billData,
      people,
      paidById,
      eventId,
      squadId,
      status,
      splitEvenly: true,
      isSimpleTransaction: true,
    });

    return result.data.billId;
  },

  /**
   * Gets a bill by ID
   */
  async getBill(billId: string): Promise<Bill | null> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const billSnap = await getDoc(billRef);

    if (!billSnap.exists()) {
      return null;
    }

    return billSnap.data() as Bill;
  },

  /**
   * Gets all bills associated with an event
   */
  async getBillsByEvent(eventId: string): Promise<Bill[]> {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('eventId', '==', eventId),
      orderBy('updatedAt', 'desc'),
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => doc.data() as Bill);
  },

  /**
   * Subscribes to all bills associated with an event
   */
  subscribeBillsByEvent(eventId: string, callback: (bills: Bill[]) => void): () => void {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('eventId', '==', eventId),
      orderBy('updatedAt', 'desc'),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const bills = snapshot.docs.map((doc) => doc.data() as Bill);
        callback(bills);
      },
      (error) => {
        console.error('[billService] subscribeBillsByEvent error', error);
      },
    );
  },

  /**
   * Gets all bills associated with a squad
   */
  async getBillsBySquad(squadId: string): Promise<Bill[]> {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('squadId', '==', squadId),
      orderBy('updatedAt', 'desc'),
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map((doc) => doc.data() as Bill);
  },

  /**
   * Subscribes to all bills associated with a squad
   */
  subscribeBillsBySquad(squadId: string, callback: (bills: Bill[]) => void): () => void {
    const q = query(
      collection(db, BILLS_COLLECTION),
      where('squadId', '==', squadId),
      orderBy('updatedAt', 'desc'),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const bills = snapshot.docs.map((doc) => doc.data() as Bill);
        callback(bills);
      },
      (error) => {
        console.error('[billService] subscribeBillsBySquad error', error);
      },
    );
  },

  /**
   * Updates a bill
   */
  async updateBill(
    billId: string,
    updates: Partial<Bill>,
    options?: { allowPeopleRemoval?: boolean },
  ): Promise<{ peopleStripped: boolean; repaired: InvariantViolation[] }> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    // Reported back to the caller because a strip RESOLVES rather than
    // rejecting. `persistPeopleAddition` and the addition queue
    // (`usePeopleAdditionQueue.runPersist`) re-queue only on a rejected
    // promise, so a silent strip would drop an add forever while
    // `reconcilePeopleWithServer` kept re-attaching it locally — the UI would
    // show a person the server does not have. Callers that retry MUST check
    // this. Declared outside the transaction because the body can re-run.
    let peopleStripped = false;
    let repaired: InvariantViolation[] = [];

    // A-08 (defence in depth): this is the single choke point for every client
    // write to a bill, and unlike `createBill` it is a DIRECT Firestore write
    // with no callable to normalize for us. `PaidByBanner` emits the
    // `user-`-prefixed `person.id` when you tap anyone but yourself, so without
    // this the prefix lands in the field the ledger anchors on.
    // The pipeline normalizes too — belt and braces, since a corrupt anchor is
    // silent and erases money.
    if (updates.paidById) {
      updates = { ...updates, paidById: personIdToFirebaseUid(updates.paidById) };
    }

    // If people is being updated, use a transaction to atomically read
    // existing participantIds and merge with derived ones. This prevents
    // race conditions where a guest joining via arrayUnion gets overwritten.
    if (touchesMoney(updates)) {
      try {
        await runTransaction(db, async (transaction) => {
          const billSnap = await transaction.get(billRef);
          const billData = billSnap.data();
          const ownerId = updates.ownerId ?? billData?.ownerId;
          const hasPeopleUpdate = Array.isArray(updates.people);

          let finalUpdates = { ...updates };

          // ── Defence in depth for the people-loss class of bug ──
          //
          // `participantIds` below is UNIONED, but `people` is a whole-array
          // REPLACE, so any caller holding a stale array silently deletes
          // whoever is missing from it — and `ledgerProcessor` then reverses
          // their share. That is real money disappearing with no error.
          //
          // Compare ids NORMALIZED. `people[].id` is a mix of `user-<uid>`
          // and bare `<uid>`, and `ensureUserInPeople`
          // (src/utils/billCalculations.ts) rewrites whoever is currently
          // loading from the bare form to the prefixed one IN PLACE. 59% of
          // production bills carry at least one bare id, so comparing raw
          // strings would read that harmless normalization as a deletion and
          // refuse every subsequent write to those bills, for everyone.
          //
          // On an accidental shrink we STRIP the `people` key and write
          // everything else, rather than failing the whole write. Callers
          // swallow errors (`useBills.saveSession` toasts and returns null),
          // so throwing here would discard the rest of the payload — for
          // `handleAnalyze` that is the entire receipt scan. Losing a scan to
          // protect an array is a worse trade than the bug being prevented,
          // so this fails SAFE: the stored `people` simply stands.
          //
          // A DELIBERATE shrink (`handleRemovePerson`, event conversion) opts
          // in via `allowPeopleRemoval` and replaces the array as asked.
          const storedPeople = (billData?.people || []) as Person[];
          const incomingUids = new Set(
            (updates.people ?? []).map((p) => personIdToFirebaseUid(p.id)),
          );
          const dropped = !hasPeopleUpdate
            ? []
            : storedPeople.filter(
                (p) => !incomingUids.has(personIdToFirebaseUid(p.id)),
              );

          const peopleAccepted =
            !hasPeopleUpdate ||
            dropped.length === 0 ||
            options?.allowPeopleRemoval === true;

          // Reset first: Firestore may re-run this body on contention.
          peopleStripped = false;
          repaired = [];

          if (!peopleAccepted) {
            peopleStripped = true;
            console.error(
              `[billService] dropping a stale people key for bill ${billId}: ` +
                `the incoming array omits ${dropped.length} stored person(s) ` +
                `(${dropped.map((p) => p.id).join(', ')}) and the caller did ` +
                `not pass allowPeopleRemoval. Everything else in this write ` +
                `was applied; stored people left untouched.`,
            );
            delete finalUpdates.people;
          }

          // Only re-derive participant ids when the people array is actually
          // being written — otherwise they would be computed from the array we
          // just rejected.
          if (ownerId && hasPeopleUpdate && peopleAccepted) {
            const derived = extractParticipantIds(ownerId, updates.people!);

            // Merge with existing participantIds (includes guests who joined via arrayUnion)
            const existingParticipantIds: string[] = billData?.participantIds || [];

            // Also include UIDs from members array (share-link joiners)
            const memberUids = (billData?.members || [])
              .filter((m: any) => !m.isAnonymous && m.userId)
              .map((m: any) => m.userId);

            const merged = Array.from(
              new Set([...existingParticipantIds, ...derived, ...memberUids]),
            );

            // Compute unsettledParticipantIds preserving settled users.
            const settledPersonIds = new Set<string>(billData?.settledPersonIds || []);
            const settledUids = new Set<string>(
              (billData?.people || [])
                .filter((p: Person) => settledPersonIds.has(p.id))
                .map((p: Person) => (p.id.startsWith('user-') ? p.id.slice(5) : p.id)),
            );
            const unsettledDerived = merged.filter((uid) => !settledUids.has(uid));

            finalUpdates = {
              ...finalUpdates,
              participantIds: merged,
              unsettledParticipantIds: unsettledDerived,
            };
          }

          // A stripped `people` invalidates anything DERIVED from the roster
          // in the same payload. `billData.items` and `itemAssignments` for a
          // simple transaction are one-per-person, so keeping them after
          // refusing the shrink persists a bill with N people and N-1 items —
          // which the server backstop then treats as fatal, freezing the
          // ledger. Worse, it does not converge: replaying the same write
          // reproduces it, so only a reload (which re-hydrates `people`)
          // breaks the loop. Drop the derived keys and let the next write,
          // built from a correct roster, carry them.
          if (peopleStripped) {
            const storedIsSimple =
              (finalUpdates as Partial<Bill>).isSimpleTransaction ??
              billData?.isSimpleTransaction;
            if (storedIsSimple) {
              delete (finalUpdates as Partial<Bill>).billData;
              delete (finalUpdates as Partial<Bill>).itemAssignments;
            }
          }

          // ── Invariant pass (docs/plans/bill-money-invariants.md) ──
          //
          // Validate the MERGED candidate, not the incoming patch: most writes
          // carry one or two fields, so checking the patch alone would be
          // vacuous — an `itemAssignments`-only write has to be judged against
          // the STORED `people`.
          //
          // Repairs only ever touch keys this write is ALREADY sending. A
          // violation that lives purely in stored data is logged and left to
          // the server backstop (`ledgerProcessor`), because silently
          // rewriting a field the caller never mentioned is a surprise, and
          // surprises in money code are how this class of bug started.
          const candidate = { ...billData, ...finalUpdates } as Parameters<
            typeof checkBillInvariants
          >[0];
          const violations = checkBillInvariants(candidate);

          if (violations.length > 0) {
            const applied: InvariantViolation[] = [];

            for (const v of violations) {
              // I1 — drop ghost assignees, but only from an assignments map we
              // are already writing.
              if (v.code === 'I1' && finalUpdates.itemAssignments) {
                const ghosts = new Set(v.ids ?? []);
                const cleaned: Record<string, string[]> = {};
                for (const [itemId, assignees] of Object.entries(
                  finalUpdates.itemAssignments,
                )) {
                  cleaned[itemId] = (assignees ?? []).filter((a) => !ghosts.has(a));
                }
                finalUpdates = { ...finalUpdates, itemAssignments: cleaned };
                applied.push(v);
                continue;
              }

              // I2 — de-duplicate assignees inside an item.
              //
              // ONLY the assignee half (I2b). A duplicate PARTICIPANT (I2a) is
              // deliberately NOT repaired: dropping one id-form from `people`
              // while both remain in `itemAssignments` IS the ghost bug, so
              // the repair would have to rewrite assignments in the same
              // write. Left to the server.
              //
              // `v.ids` distinguishes them: I2b reports the ITEM id it found
              // the duplicate in, I2a reports the duplicated uid(s). Matching
              // on the bare code reported a repair that never happened, while
              // the participant duplicate survived to be server-fatal.
              const isAssigneeDuplicate =
                v.code === 'I2' &&
                (v.ids ?? []).some((id) => id in (finalUpdates.itemAssignments ?? {}));

              if (isAssigneeDuplicate && finalUpdates.itemAssignments) {
                const deduped: Record<string, string[]> = {};
                for (const [itemId, assignees] of Object.entries(
                  finalUpdates.itemAssignments,
                )) {
                  const seen = new Set<string>();
                  deduped[itemId] = (assignees ?? []).filter((a) => {
                    const u = personIdToFirebaseUid(a);
                    if (seen.has(u)) return false;
                    seen.add(u);
                    return true;
                  });
                }
                finalUpdates = { ...finalUpdates, itemAssignments: deduped };
                applied.push(v);
                continue;
              }

              // I3 — hand the anchor back to the owner. NOT keep-stored: the
              // stored anchor may itself be the person just removed.
              //
              // NOTE this is the ONE repair that writes a key the caller did
              // not send, which contradicts the "repairs only touch keys the
              // write already carries" rule stated above. It is deliberate and
              // LOAD-BEARING: `BillWizard.handleRemovePerson` and the Airbnb
              // equivalent do NOT re-anchor when the removed person was the
              // payer (only SimpleTransactionWizard does), so they rely on this
              // to keep the ledger's anchor on a real participant. A dangling
              // anchor inverts the direction of every debt on the bill.
              if (v.code === 'I3' && ownerId) {
                finalUpdates = { ...finalUpdates, paidById: personIdToFirebaseUid(ownerId) };
                applied.push(v);
                continue;
              }

              // I5..I8 — LOG ONLY on the client. Deliberately not repaired.
              //
              // The spec's first draft said "reject the incoming billData and
              // keep the stored one". That is wrong, by the same argument this
              // file already makes about `people`: dropping the key makes
              // `updateBill` RESOLVE while silently discarding the user's edit,
              // `useBillSession` then records the state as saved and never
              // retries, and the UI shows items the server does not have. For a
              // refund line (`[+20, -20]` -> I8) or an AI-extracted comped
              // total (-> I7) that is real data loss to prevent a ledger error.
              //
              // The bill is the user's record; the LEDGER is what must not move
              // on bad arithmetic. So persist what they entered and let the
              // server backstop (ledgerProcessor Stage 1) refuse to compute,
              // holding the last-known-good footprint and logging. Nothing is
              // lost and no money is wrong.
              if (['I5', 'I6', 'I7', 'I8'].includes(v.code)) {
                continue;
              }
            }

            repaired = applied;
            console.error(
              `[billService] bill ${billId} violates money invariants — ` +
                `${summarizeViolations(violations)}. Repaired: ` +
                `${applied.map((v) => v.code).join(', ') || 'none (logged only)'}.`,
            );
          }

          const cleanedUpdates = removeUndefinedFields({
            ...finalUpdates,
            updatedAt: serverTimestamp(),
            lastActivity: serverTimestamp(),
          });

          transaction.update(billRef, cleanedUpdates);
        });
      } catch (error) {
        console.error('FAILED TO SAVE BILL:', error);
        console.error('Bill ID:', billId);
        console.error('Update Payload Keys:', Object.keys(updates));
        throw error;
      }

      return { peopleStripped, repaired };
    } else {
      // No people update — simple updateDoc (no race risk for participantIds)
      const cleanedUpdates = removeUndefinedFields({
        ...updates,
        updatedAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      });

      try {
        await updateDoc(billRef, cleanedUpdates);
      } catch (error) {
        console.error('FAILED TO SAVE BILL:', error);
        console.error('Bill ID:', billId);
        console.error('Update Payload Keys:', Object.keys(cleanedUpdates));
        throw error;
      }

      // This branch touches no money field, so nothing can be stripped and
      // no invariant can be violated by it.
      return { peopleStripped: false, repaired: [] };
    }
  },

  /**
   * Gets a bill by share code
   */
  async getBillByShareCode(shareCode: string): Promise<Bill | null> {
    const q = query(collection(db, BILLS_COLLECTION), where('shareCode', '==', shareCode));

    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) {
      return null;
    }

    const bill = querySnapshot.docs[0].data() as Bill;

    // Check expiration
    if (bill.shareCodeExpiresAt && bill.shareCodeExpiresAt.toMillis() < Date.now()) {
      return null;
    }

    return bill;
  },

  /**
   * Joins a bill as a member (for authenticated or anonymous users)
   * Also adds the user to the people array so they can claim items immediately
   */
  async joinBill(billId: string, userId: string, userName: string, email?: string): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const now = Timestamp.now();

    // Build member object without undefined fields (Firestore doesn't accept undefined)
    const newMember: BillMember = {
      userId,
      name: userName,
      joinedAt: now,
      isAnonymous: userId.startsWith('guest-') || userId === 'anonymous',
    };

    // Only add email if defined
    if (email) {
      newMember.email = email;
    }

    // Create person object for the people array (for item assignment)
    // Keep guest IDs as-is; only prefix actual Firebase UIDs with user-
    const newPerson = {
      id: userId.startsWith('user-') || userId.startsWith('guest-') ? userId : `user-${userId}`,
      name: userName,
    };

    // Normalize UID (joinBill may be called with guest- IDs; skip those for participantIds)
    const isLinkedUser = !userId.startsWith('guest-') && userId !== 'anonymous';

    await updateDoc(billRef, {
      members: arrayUnion(newMember),
      people: arrayUnion(newPerson),
      ...(isLinkedUser && {
        participantIds: arrayUnion(userId),
        unsettledParticipantIds: arrayUnion(userId),
      }),
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });
  },

  /**
   * Generates a unique share code for a bill
   */
  async generateShareCode(billId: string, userId: string): Promise<string> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const billSnap = await getDoc(billRef);

    if (!billSnap.exists()) {
      throw new Error('Bill not found');
    }

    const billData = billSnap.data() as Bill;
    const now = Timestamp.now();

    // Check if existing code is valid (not expired)
    if (
      billData.shareCode &&
      billData.shareCodeExpiresAt &&
      billData.shareCodeExpiresAt.toMillis() > now.toMillis()
    ) {
      return billData.shareCode;
    }

    // Generate new code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // Expires in 7 days
    const expiresAt = new Timestamp(now.seconds + 7 * 24 * 60 * 60, now.nanoseconds);

    await updateDoc(billRef, {
      shareCode: code,
      shareCodeCreatedAt: now,
      shareCodeExpiresAt: expiresAt,
      shareCodeCreatedBy: userId,
      updatedAt: serverTimestamp(),
    });

    return code;
  },

  /**
   * Atomically toggles a person's assignment to an item
   * Uses arrayUnion/arrayRemove to prevent race conditions
   */
  async toggleItemAssignment(
    billId: string,
    itemId: string,
    personId: string,
    isAssigned: boolean,
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    // key in the map: itemAssignments.itemId
    const fieldPath = `itemAssignments.${itemId}`;

    if (isAssigned) {
      await updateDoc(billRef, {
        [fieldPath]: arrayUnion(personId),
        updatedAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      });
    } else {
      await updateDoc(billRef, {
        [fieldPath]: arrayRemove(personId),
        updatedAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      });
    }
  },

  /**
   * Atomically sets the full assignment array for an item
   * Used by "Select All" / "Deselect All" per item
   */
  async setItemAssignment(billId: string, itemId: string, personIds: string[]): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);
    const fieldPath = `itemAssignments.${itemId}`;
    await updateDoc(billRef, {
      [fieldPath]: personIds,
      updatedAt: serverTimestamp(),
      lastActivity: serverTimestamp(),
    });
  },

  /**
   * Updates a person's details (name, venmoId) in the bill
   * This requires a read-modify-write cycle for the people array
   */
  async updatePersonDetails(
    billId: string,
    personId: string,
    updates: Partial<Person>,
  ): Promise<void> {
    const billRef = doc(db, BILLS_COLLECTION, billId);

    await runTransaction(db, async (tx) => {
      // 1. Read inside transaction for consistency
      const billSnap = await tx.get(billRef);
      if (!billSnap.exists()) throw new Error('Bill not found');

      const billData = billSnap.data() as Bill;
      const people = billData.people || [];

      // 2. Find and update the person
      const personIndex = people.findIndex((p) => p.id === personId);
      if (personIndex === -1) throw new Error('Person not found on this bill');

      const updatedPeople = [...people];
      // Merge updates, then strip any undefined values (Firestore rejects them)
      const merged = { ...updatedPeople[personIndex], ...updates };
      Object.keys(merged).forEach((key) => {
        if (merged[key as keyof typeof merged] === undefined) {
          delete merged[key as keyof typeof merged];
        }
      });
      updatedPeople[personIndex] = merged;

      // 3. Write back the updated people array
      // Also update member record if this person is a member
      const members = billData.members || [];
      const memberIndex = members.findIndex((m) => m.userId === personId);

      const updatePayload: {
        people: Person[];
        updatedAt: ReturnType<typeof serverTimestamp>;
        lastActivity: ReturnType<typeof serverTimestamp>;
        members?: BillMember[];
      } = {
        people: updatedPeople,
        updatedAt: serverTimestamp(),
        lastActivity: serverTimestamp(),
      };

      if (memberIndex !== -1 && updates.name) {
        const updatedMembers = [...members];
        updatedMembers[memberIndex] = {
          ...updatedMembers[memberIndex],
          name: updates.name,
        };
        updatePayload.members = updatedMembers;
      }

      tx.update(billRef, updatePayload);
    });
  },

  /**
   * Joins a bill as a guest via Cloud Function, creating a shadow user
   */
  async joinBillAsGuest(billId: string, shareCode: string, guestName: string): Promise<string> {
    const fn = httpsCallable<any, { userId: string }>(functions, 'joinBillAsGuest');
    const result = await fn({ billId, shareCode, guestName });
    return result.data.userId;
  },

  /**
   * Leaves a bill as a guest, deleting the shadow user
   */
  async leaveBillAsGuest(billId: string, shareCode: string, shadowUserId: string): Promise<void> {
    const fn = httpsCallable<any, { success: boolean }>(functions, 'leaveBillAsGuest');
    await fn({ billId, shareCode, shadowUserId });
  },

  /**
   * Updates the name of a guest shadow user
   */
  async updateGuestName(
    billId: string,
    shareCode: string,
    shadowUserId: string,
    newName: string,
  ): Promise<void> {
    const fn = httpsCallable<any, { success: boolean }>(functions, 'updateGuestName');
    await fn({ billId, shareCode, shadowUserId, newName });
  },

  /**
   * Claims a shadow user's history and merges it into the current authenticated user
   */
  async claimShadowUser(shadowUserId: string): Promise<{ success: boolean; claimedBills: number }> {
    const fn = httpsCallable<any, { success: boolean; claimedBills: number }>(
      functions,
      'claimShadowUser',
    );
    const result = await fn({ shadowUserId });
    return result.data;
  },
};
