import { useState, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useReturnTo } from '@/hooks/useReturnTo';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { App } from '@capacitor/app';
import { usePlatform } from '@/hooks/usePlatform';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { Person, BillData, ItemAssignment } from '@/types';
import { billService } from '@/services/billService';
import { personIdToFirebaseUid } from '@shared/ledgerCalculations';
import { needsAssignmentResync } from '@/utils/assignmentSync';
import { useBillContext } from '@/contexts/BillSessionContext';
import { SplitMethod } from './SplitMethodSelector';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';

import { DetailsStep } from './steps/DetailsStep';
import { PeopleStep } from './steps/PeopleStep';
import { ReviewStep } from './steps/ReviewStep';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ensureUserInPeople, generateUserId } from '@/utils/billCalculations';
import {
  redistributeSharesAcross,
  resolveSplitAmounts,
  isSplitConfigValid,
  buildPerPersonShareItems,
} from '@shared/splitAmounts';
import { userService } from '@/services/userService';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

const STEPS = [
  { id: 1, label: 'Details', description: 'Amount & Info' },
  { id: 2, label: 'People', description: 'Who is splitting' },
  { id: 3, label: 'Review', description: 'Confirm' },
];

export interface SimpleTransactionWizardProps {
  externalTitle?: string;
  setExternalTitle?: (title: string) => void;
}

export function SimpleTransactionWizard({
  externalTitle,
  setExternalTitle,
}: SimpleTransactionWizardProps = {}) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { state: routerState } = useLocation();
  const { billId } = useParams<{ billId: string }>();
  const { activeSession, resumeSession, saveSession } = useBillContext();
  const activeBillId = useRef<string | null>(billId !== 'new' ? billId : null);

  const [currentStep, setCurrentStep] = useState(0);
  const prevStepRef = useRef(0);
  const directionRef = useRef<'forward' | 'backward'>('forward');
  const [amount, setAmount] = useState<string>('');
  const [internalTitle, setInternalTitle] = useState<string>('');

  const title = externalTitle !== undefined ? externalTitle : internalTitle;
  const setTitle = (newTitle: string) => {
    setInternalTitle(newTitle);
    if (setExternalTitle) {
      setExternalTitle(newTitle);
    }
  };
  const [paidById, setPaidById] = useState<string>(user?.uid || '');
  const [people, setPeople] = useState<Person[]>([]);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [exactAmounts, setExactAmounts] = useState<Record<string, number>>({});

  // Track last-saved split state so we can revert invalid edits on back/leave
  const lastSavedSplit = useRef<{
    splitMethod: SplitMethod;
    percentages: Record<string, number>;
    exactAmounts: Record<string, number>;
  }>({ splitMethod: 'equal', percentages: {}, exactAmounts: {} });

  // paidById initializes before auth resolves — sync it once user loads
  useEffect(() => {
    if (user?.uid && !paidById) {
      setPaidById(user.uid);
    }
  }, [user?.uid]);
  const [isSaving, setIsSaving] = useState(false);
  const [existingEventId, setExistingEventId] = useState<string | undefined>();
  const [existingSquadId, setExistingSquadId] = useState<string | undefined>();
  const [existingItemId, setExistingItemId] = useState<string | undefined>();

  const relevantSession = activeSession?.id === activeBillId.current ? activeSession : null;
  const isOwner =
    !relevantSession || !relevantSession.ownerId || relevantSession.ownerId === user?.uid;
  const { isNative } = usePlatform();

  // Hardware back button handling
  const stepRef = useRef(currentStep);
  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  // Track direction for step transition animations (synchronous)
  if (currentStep !== prevStepRef.current) {
    directionRef.current = currentStep > prevStepRef.current ? 'forward' : 'backward';
    prevStepRef.current = currentStep;
  }
  const stepDirection = directionRef.current;

  useEffect(() => {
    if (!isNative) return;

    let listenerHandle: any = null;

    App.addListener('backButton', () => {
      if (stepRef.current > 0 && isOwner) {
        setCurrentStep((prev) => prev - 1);
      } else {
        window.history.back();
      }
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [isNative, isOwner]);

  const getTargetContext = () => {
    if (billId && billId !== 'new') {
      return { eventId: existingEventId, squadId: existingSquadId };
    }
    return {
      eventId: routerState?.targetEventId,
      squadId: routerState?.targetSquadId,
    };
  };

  // Resolves the screen the user entered from, falling back to the bill's own
  // event/squad context when no origin was recorded.
  const { label: exitLabel, goBack } = useReturnTo({
    eventId: existingEventId ?? routerState?.targetEventId,
    squadId: existingSquadId ?? routerState?.targetSquadId,
  });

  const { profile } = useUserProfile();
  const peopleManager = usePeopleManager(people, setPeople);
  const hasLoadedBillId = useRef<string | null>(null);
  const hasInitializedNew = useRef(false);

  // Helper: fetch all event members and return them as Person[]
  const fetchEventMembers = async (eventId: string): Promise<Person[]> => {
    try {
      const eventSnap = await getDoc(doc(db, 'events', eventId));
      if (!eventSnap.exists()) return [];
      const data = eventSnap.data();
      const memberIds: string[] = data?.memberIds || [];
      const profiles = await Promise.all(
        memberIds.map((uid) => userService.getUserProfile(uid).catch(() => null)),
      );
      return profiles
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map((p) => ({
          id: p.uid.startsWith('user-') ? p.uid : generateUserId(p.uid),
          name: p.displayName,
          venmoId: p.venmoId,
        }));
    } catch (err) {
      console.error('Failed to fetch event members:', err);
      return [];
    }
  };

  // Pre-populate for new transactions
  useEffect(() => {
    if ((!billId || billId === 'new') && user && !hasInitializedNew.current) {
      hasInitializedNew.current = true;
      const { targetEventId, targetSquadId } = routerState || {};

      if (targetEventId) {
        setExistingEventId(targetEventId);
        fetchEventMembers(targetEventId).then((eventPeople) => {
          setPeople(ensureUserInPeople(eventPeople, user, profile));
        });
      } else if (targetSquadId) {
        // For squads, we just start with the user for now,
        // as squads might not have a simple "fetch all members" profile helper readily available here
        // or we can just stick to user-only for squads until requested.
        setPeople(ensureUserInPeople([], user, profile));
      } else {
        setPeople(ensureUserInPeople([], user, profile));
      }
    }
  }, [billId, user, routerState, profile]);

  const handleEventChange = async (newEventId: string | null) => {
    setExistingEventId(newEventId || undefined);
    if (!newEventId) return;

    // Fetch members and override people
    const eventMembers = await fetchEventMembers(newEventId);
    const rosterPeople = ensureUserInPeople(eventMembers, user, profile);
    setPeople(rosterPeople);

    // Persist the replace HERE, with explicit intent. Swapping a private
    // bill's people for the event roster legitimately drops anyone who was on
    // the bill but is not an event member, and the debounced autosave is
    // (correctly) guarded against dropping people — so left to the autosave
    // this replace would be stripped and silently never stick.
    // Non-empty floor. `fetchEventMembers` swallows every error and returns
    // `[]`, and `ensureUserInPeople` is a no-op when `user.displayName` is
    // null (password / Hide-My-Email accounts) — so a network blip while
    // picking an event could otherwise write an EMPTY roster, with explicit
    // permission to delete everyone.
    if (activeBillId.current && rosterPeople.length > 0) {
      await billService
        .updateBill(
          activeBillId.current,
          { people: rosterPeople },
          { allowPeopleRemoval: true },
        )
        .catch((err) => console.error('Failed to persist event roster', err));
    }
  };

  /**
   * Removes a person AND persists it immediately with explicit intent.
   *
   * The autosave cannot carry this: it sends a whole-array replace built from
   * a `setTimeout` closure, and `people` here is loaded once (`applyBillData`,
   * behind `hasLoadedBillId.current`) and never re-hydrated from a snapshot,
   * so that array can be arbitrarily stale. Letting it shrink the array with
   * blanket `allowPeopleRemoval` is what would let a stale load silently
   * revert a concurrent change — e.g. `claimShadowUser` rewriting a person's
   * id to `user-<realUid>` after this wizard loaded the pre-claim array.
   */
  const handleRemovePerson = (personId: string) => {
    peopleManager.removePerson(personId);

    if (!activeBillId.current) return;

    const remaining = people.filter((p) => p.id !== personId);

    // `remaining` can be empty only if the signed-in user removed themselves,
    // which `peopleManager.removePerson` refuses — but never persist an empty
    // roster regardless: it would strand the bill with no participants.
    if (remaining.length === 0) return;

    // Write `people` TOGETHER WITH the rebuilt split, never `people` alone.
    //
    // This wizard's `billData.items` and `itemAssignments` are DERIVED from
    // the roster (`buildSplitPayload`: one item per person for exact and
    // percentage splits). Persisting the shrink on its own leaves the removed
    // person's item and assignment behind as a GHOST — the ledger divides by
    // the raw assignee count and then discards their share, so that money is
    // charged to nobody. The autosave that would otherwise reconcile this is
    // `clearTimeout`ed on unmount with no flush, so tapping back within ~1s
    // commits the inconsistent state permanently.
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      // No money at stake yet and no valid split to rebuild; the autosave will
      // persist a consistent payload once an amount exists.
      return;
    }

    // Re-split across the REMAINING roster before building. The effect that
    // normally does this runs after render, i.e. after this write — so the
    // amount maps must be recomputed here or the payload is inconsistent.
    const nextPercentages = redistributeSharesAcross(remaining, 100);
    const nextExactAmounts = redistributeSharesAcross(remaining, numAmount);

    // Keep local state in step with what is being written, so the UI agrees
    // and the later autosave does not re-assert the stale maps.
    setPercentages(nextPercentages);
    setExactAmounts(nextExactAmounts);

    const { billData, itemAssignments, splitEvenly } = buildSplitPayload(numAmount, {
      people: remaining,
      percentages: nextPercentages,
      exactAmounts: nextExactAmounts,
    });

    // If the removed person was the payer, hand the anchor back to the OWNER.
    // Compare normalized: `paidById` is a bare uid while `personId` is usually
    // `user-<uid>`, so a raw `===` is false exactly when it matters and would
    // leave `paidById` pointing at a non-participant — invisible in
    // PaidByBanner while `canProceed` still returns true.
    const removedThePayer =
      personIdToFirebaseUid(paidById) === personIdToFirebaseUid(personId);
    const nextPaidById = removedThePayer ? (user?.uid ?? paidById) : paidById;
    if (removedThePayer) setPaidById(nextPaidById);

    void billService
      .updateBill(
        activeBillId.current,
        {
          people: remaining,
          billData,
          itemAssignments,
          splitEvenly,
          paidById: nextPaidById,
        },
        { allowPeopleRemoval: true },
      )
      .catch((err) => console.error('Failed to persist person removal', err));
  };

  useEffect(() => {
    // If we're creating a new transaction, exit early
    if (!billId || billId === 'new') return;

    const applyBillData = (bill: import('@/types/bill.types').Bill) => {
      if (bill.title) setTitle(bill.title);
      if (bill.billData?.total) setAmount(bill.billData.total.toString());
      if (bill.paidById) setPaidById(bill.paidById);
      if (bill.people && bill.people.length > 0) setPeople(bill.people);
      if (bill.eventId) setExistingEventId(bill.eventId);
      if (bill.squadId) setExistingSquadId(bill.squadId);
      if (bill.billData?.items?.[0]?.id) setExistingItemId(bill.billData.items[0].id);

      // Detect split method from existing bill
      if (
        bill.splitEvenly ||
        !bill.isSimpleTransaction ||
        (bill.billData?.items?.length ?? 0) <= 1
      ) {
        setSplitMethod('equal');
        lastSavedSplit.current = {
          splitMethod: 'equal',
          percentages: {},
          exactAmounts: {},
        };
      } else {
        // Per-person items: reconstruct amounts
        const total = bill.billData?.total || 0;
        const amounts: Record<string, number> = {};
        const pcts: Record<string, number> = {};
        bill.billData?.items?.forEach((item) => {
          const assignedPersonId = bill.itemAssignments?.[item.id]?.[0];
          if (assignedPersonId) {
            amounts[assignedPersonId] = item.price;
            pcts[assignedPersonId] = total > 0 ? (item.price / total) * 100 : 0;
          }
        });
        setExactAmounts(amounts);
        setPercentages(pcts);
        setSplitMethod('exact');
        lastSavedSplit.current = {
          splitMethod: 'exact',
          percentages: { ...pcts },
          exactAmounts: { ...amounts },
        };
      }

      // Force to the review step automatically for existing transactions
      setCurrentStep(2);
    };

    if (activeSession && activeSession.id === billId) {
      if (hasLoadedBillId.current !== activeSession.id) {
        hasLoadedBillId.current = activeSession.id;
        activeBillId.current = activeSession.id;
        applyBillData(activeSession);
      }
    } else if (billId && hasLoadedBillId.current !== billId) {
      hasLoadedBillId.current = billId;
      activeBillId.current = billId;
      resumeSession(billId, true).then((fetchedBill) => {
        if (fetchedBill) applyBillData(fetchedBill);
      });
    }
  }, [billId, activeSession, resumeSession]);

  // Sync split data when people change
  useEffect(() => {
    if (people.length < 2) return;

    const peopleChanged = (prev: Record<string, number>) => {
      const existingIds = new Set(Object.keys(prev));
      const currentIds = new Set(people.map((p) => p.id));
      return (
        people.some((p) => !existingIds.has(p.id)) ||
        [...existingIds].some((id) => !currentIds.has(id))
      );
    };

    // If people changed (added/removed), redistribute equally
    // Shared with handleRemovePerson — see redistributeSharesAcross.
    setPercentages((prev) => {
      if (!peopleChanged(prev) && Object.keys(prev).length > 0) return prev;
      return redistributeSharesAcross(people, 100);
    });

    setExactAmounts((prev) => {
      if (!peopleChanged(prev) && Object.keys(prev).length > 0) return prev;
      return redistributeSharesAcross(people, Number(amount));
    });
  }, [people.map((p) => p.id).join(','), amount]);

  // Build the billData + itemAssignments payload based on split method
  const buildSplitPayload = (
    numAmount: number,
    /**
     * Overrides for callers that must describe a roster OTHER than current
     * state. `handleRemovePerson` persists the post-removal split
     * SYNCHRONOUSLY, before the redistribute effect has run — so it must
     * override the amount maps TOO, not just the roster. Overriding `people`
     * alone leaves `exact`/`percentage` amounts keyed to the old roster, which
     * silently charges the removed person's share to nobody (exact) or to the
     * last person (percentage).
     */
    overrides?: {
      people?: Person[];
      percentages?: Record<string, number>;
      exactAmounts?: Record<string, number>;
    },
  ): {
    billData: BillData;
    itemAssignments: Record<string, string[]>;
    splitEvenly: boolean;
  } => {
    const roster = overrides?.people ?? people;
    const pct = overrides?.percentages ?? percentages;
    const exact = overrides?.exactAmounts ?? exactAmounts;
    if (splitMethod === 'equal') {
      const dummyItemId = existingItemId || `item-${Date.now()}`;
      return {
        billData: {
          items: [{ id: dummyItemId, name: title, price: numAmount }],
          subtotal: numAmount,
          tax: 0,
          tip: 0,
          total: numAmount,
          restaurantName: title,
        },
        itemAssignments: { [dummyItemId]: roster.map((p) => p.id) },
        splitEvenly: true,
      };
    }

    // Percentage or exact: create per-person items (last person absorbs rounding)
    const amounts = resolveSplitAmounts(numAmount, roster, splitMethod, pct, exact);
    const { items, itemAssignments } = buildPerPersonShareItems(roster, amounts);

    return {
      billData: {
        items,
        subtotal: numAmount,
        tax: 0,
        tip: 0,
        total: numAmount,
        restaurantName: title,
      },
      itemAssignments,
      splitEvenly: false,
    };
  };

  const isSplitValid = () =>
    isSplitConfigValid(splitMethod, Number(amount), percentages, exactAmounts);

  const canProceed = () => {
    if (currentStep === 0) {
      return Number(amount) > 0 && title.trim().length > 0 && !!paidById;
    }
    if (currentStep === 1) {
      if (people.length <= 1) return false;
      return isSplitValid();
    }
    return true;
  };

  const handleNextStep = () => {
    if (currentStep < STEPS.length - 1 && canProceed() && isOwner) {
      setCurrentStep((s) => s + 1);
    }
  };

  // ── Auto-save transactions (Debounced) ───────────
  // Automatically saves edits to Amount, Title, and People.
  useEffect(() => {
    if (!user || !isOwner) return;
    // Don't auto-save if we are already viewing a loaded bill but haven't initialized it
    if (billId !== 'new' && !hasLoadedBillId.current) return;

    const timeoutId = setTimeout(async () => {
      const numAmount = Number(amount);
      if (numAmount === 0 || title.trim().length === 0 || people.length === 0) return;

      // Don't auto-save invalid split configurations
      if (!isSplitValid()) return;

      const { billData, itemAssignments, splitEvenly } = buildSplitPayload(numAmount);

      const payload: any = {
        title,
        paidById,
        people,
        billType: existingEventId ? 'event' : 'private',
        splitEvenly,
        isSimpleTransaction: true,
        ...(existingEventId && { eventId: existingEventId }),
        ...(existingSquadId && { squadId: existingSquadId }),
        billData,
        itemAssignments,
      };

      try {
        if (activeBillId.current) {
          // NO `allowPeopleRemoval` here, deliberately. This autosave builds
          // its payload in a `setTimeout` closure, and this wizard's `people`
          // is loaded once (`applyBillData`, behind `hasLoadedBillId.current`)
          // and never re-hydrated from a snapshot — so the array it sends can
          // be arbitrarily stale. The guard must be free to strip it.
          //
          // That is what stops a stale load from reverting a concurrent
          // change: `claimShadowUser` rewrites a person's id to
          // `user-<realUid>`, this wizard still holds the pre-claim array, and
          // an unflagged write is stripped rather than reverting the claim.
          // Deliberate shrinks go through `handleRemovePerson` and
          // `handleEventChange`, which persist with explicit intent.
          await billService.updateBill(activeBillId.current, payload);
        } else {
          // Create draft
          const newId = await saveSession(payload);
          if (typeof newId === 'string') {
            activeBillId.current = newId;
            window.history.replaceState({}, '', `/transaction/${newId}`);
          }
        }
        // Snapshot the saved state so we can revert on back/leave
        lastSavedSplit.current = {
          splitMethod,
          percentages: { ...percentages },
          exactAmounts: { ...exactAmounts },
        };
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [
    amount,
    title,
    paidById,
    people,
    billId,
    user,
    existingEventId,
    existingSquadId,
    existingItemId,
    splitMethod,
    percentages,
    exactAmounts,
  ]);

  // Ensure itemAssignments are kept in sync even for guests in simple transactions
  useEffect(() => {
    if (!activeBillId.current || people.length === 0 || !title || !amount) return;
    if (splitMethod !== 'equal') return; // Non-equal splits handle their own assignments

    const dummyItemId = existingItemId || relevantSession?.billData?.items?.[0]?.id || 'dummy-item';
    const currentAssignments = relevantSession?.itemAssignments?.[dummyItemId] || [];

    // SAME predicate as the other two self-heals — see
    // src/utils/assignmentSync.ts. This was the copy that had already diverged
    // (length-only), which is why it is now shared rather than reimplemented.
    if (
      needsAssignmentResync(
        [{ id: dummyItemId, name: title, price: Number(amount) || 0 }],
        { [dummyItemId]: currentAssignments },
        people,
      )
    ) {
      const newAssignments = {
        [dummyItemId]: people.map((p) => p.id),
      };

      billService
        .updateBill(activeBillId.current, {
          itemAssignments: newAssignments,
        })
        .catch(console.error);
    }
  }, [people.length, activeBillId.current, title, amount, splitMethod]);

  const handlePrevStep = () => {
    if (currentStep > 0 && isOwner) {
      // If leaving the people step with invalid split, revert to last saved
      if (currentStep === 1 && !isSplitValid()) {
        setSplitMethod(lastSavedSplit.current.splitMethod);
        setPercentages({ ...lastSavedSplit.current.percentages });
        setExactAmounts({ ...lastSavedSplit.current.exactAmounts });
      }
      setCurrentStep((s) => s - 1);
    }
  };

  const handleComplete = async () => {
    if (!user) return;

    // If not owner, just exit without saving
    if (!isOwner) {
      goBack();
      return;
    }

    setIsSaving(true);
    try {
      const numAmount = Number(amount);
      const { eventId: targetEventId, squadId: targetSquadId } = getTargetContext();

      const { billData, itemAssignments, splitEvenly } = buildSplitPayload(numAmount);

      if (activeBillId.current) {
        // Also unflagged: removals and roster swaps are persisted by their
        // own explicit writes, so by the time Save runs the stored array
        // already matches and nothing is dropped. If this array IS short of
        // stored, it is stale and the guard should strip it.
        await billService.updateBill(activeBillId.current, {
          title,
          paidById,
          people,
          status: 'active',
          billType: targetEventId ? 'event' : 'private',
          splitEvenly,
          ...(targetEventId && { eventId: targetEventId }),
          ...(targetSquadId && { squadId: targetSquadId }),
          billData,
          itemAssignments,
        });
      } else {
        await billService.createSimpleTransaction(
          user.uid,
          user.displayName || 'Anonymous',
          numAmount,
          title,
          paidById,
          people,
          existingEventId || targetEventId,
          existingSquadId || targetSquadId,
          'active',
        );
      }

      goBack();
    } catch (err) {
      console.error('Failed to save simple transaction', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="wizard-stepper shrink-0 mb-4 pr-4">
        {isMobile ? (
          <PillProgress
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={(step) => {
              if (isOwner && step <= currentStep) setCurrentStep(step);
            }}
            canNavigateToStep={(step) => isOwner && step <= currentStep}
          />
        ) : (
          <Stepper
            steps={STEPS}
            currentStep={currentStep}
            orientation="horizontal"
            onStepClick={(step) => {
              if (isOwner && step < currentStep) setCurrentStep(step);
            }}
            canNavigateToStep={(step) => isOwner && step <= currentStep}
          />
        )}
      </div>

      <SwipeableStepContainer
        onSwipeLeft={canProceed() && isOwner ? handleNextStep : undefined}
        onSwipeRight={currentStep > (isOwner ? 0 : 2) && isOwner ? handlePrevStep : undefined}
        canSwipeLeft={canProceed() && isOwner}
        canSwipeRight={currentStep > (isOwner ? 0 : 2) && isOwner}
        className={
          isMobile
            ? 'flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-[140px] relative'
            : 'flex-1 min-h-0 overflow-y-auto scrollbar-hide'
        }
      >
        <StepContent stepKey={currentStep} direction={stepDirection}>
          {currentStep === 0 && (
            <DetailsStep
              amount={amount}
              setAmount={setAmount}
              title={title}
              setTitle={setTitle}
              onNext={handleNextStep}
              onExit={goBack}
              exitLabel={exitLabel}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
            />
          )}

          {currentStep === 1 && (
            <PeopleStep
              people={people}
              setPeople={setPeople}
              onRemovePerson={handleRemovePerson}
              peopleManager={peopleManager}
              isMobile={isMobile}
              paidById={paidById}
              setPaidById={setPaidById}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              eventId={existingEventId || null}
              onEventChange={handleEventChange}
              splitMethod={splitMethod}
              onSplitMethodChange={setSplitMethod}
              amount={Number(amount) || 0}
              percentages={percentages}
              onPercentagesChange={setPercentages}
              exactAmounts={exactAmounts}
              onExactAmountsChange={setExactAmounts}
            />
          )}

          {currentStep === 2 && (
            <ReviewStep
              amount={amount}
              title={title}
              paidById={paidById}
              people={people}
              isSaving={isSaving}
              onPrev={handlePrevStep}
              onComplete={handleComplete}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              billId={billId !== 'new' ? billId : undefined}
              settledPersonIds={activeSession?.settledPersonIds || []}
              ownerId={relevantSession?.ownerId || user?.uid}
              isOwner={isOwner}
              splitMethod={splitMethod}
              percentages={percentages}
              exactAmounts={exactAmounts}
            />
          )}
        </StepContent>
      </SwipeableStepContainer>

      {isMobile && (
        <WizardNavigation
          currentStep={currentStep}
          totalSteps={STEPS.length}
          onBack={isOwner && currentStep > 0 ? handlePrevStep : undefined}
          onNext={handleNextStep}
          onComplete={handleComplete}
          onExit={goBack}
          exitLabel={exitLabel}
          nextDisabled={!canProceed()}
          hasBillData={true}
          isLoading={isSaving}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
