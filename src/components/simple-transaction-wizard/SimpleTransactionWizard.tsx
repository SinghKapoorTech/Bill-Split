import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { App } from '@capacitor/app';
import { usePlatform } from '@/hooks/usePlatform';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { Person } from '@/types';
import { billService } from '@/services/billService';
import { useBillContext } from '@/contexts/BillSessionContext';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';

import { DetailsStep } from './steps/DetailsStep';
import { PeopleStep } from './steps/PeopleStep';
import { ReviewStep } from './steps/ReviewStep';
import { useUserProfile } from '@/hooks/useUserProfile';
import { ensureUserInPeople, generateUserId } from '@/utils/billCalculations';
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

export function SimpleTransactionWizard({ externalTitle, setExternalTitle }: SimpleTransactionWizardProps = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { state: routerState } = useLocation();
  const { billId } = useParams<{ billId: string }>();
  const { activeSession, resumeSession, saveSession } = useBillContext();
  const activeBillId = useRef<string | null>(billId !== 'new' ? billId : null);

  const [currentStep, setCurrentStep] = useState(0);
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
  const isOwner = !relevantSession || !relevantSession.ownerId || relevantSession.ownerId === user?.uid;
  const { isNative } = usePlatform();

  // Hardware back button handling
  const stepRef = useRef(currentStep);
  useEffect(() => {
    stepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (!isNative) return;

    let listenerHandle: any = null;

    App.addListener('backButton', () => {
      if (stepRef.current > 0 && isOwner) {
        setCurrentStep(prev => prev - 1);
      } else {
        window.history.back();
      }
    }).then(handle => {
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
    return { eventId: routerState?.targetEventId, squadId: routerState?.targetSquadId };
  };

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
        memberIds.map(uid => userService.getUserProfile(uid).catch(() => null))
      );
      return profiles
        .filter((p): p is NonNullable<typeof p> => p !== null)
        .map(p => ({
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
        fetchEventMembers(targetEventId).then(eventPeople => {
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
    setPeople(ensureUserInPeople(eventMembers, user, profile));
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

  const canProceed = () => {
    if (currentStep === 0) {
      return Number(amount) > 0 && title.trim().length > 0 && !!paidById;
    }
    if (currentStep === 1) {
      return people.length > 0;
    }
    return true;
  };

  const handleNextStep = () => {
    if (currentStep < STEPS.length - 1 && canProceed() && isOwner) {
      setCurrentStep(s => s + 1);
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

      const dummyItemId = existingItemId || `item-${Date.now()}`;
      
      const payload: any = {
        title,
        paidById,
        people,
        billType: existingEventId ? 'event' : 'private',
        splitEvenly: true,
        isSimpleTransaction: true,
        ...(existingEventId && { eventId: existingEventId }),
        ...(existingSquadId && { squadId: existingSquadId }),
        billData: {
          items: [{ id: dummyItemId, name: title, price: numAmount }],
          subtotal: numAmount,
          tax: 0,
          tip: 0,
          total: numAmount,
          restaurantName: title
        },
        itemAssignments: {
          [dummyItemId]: people.map(p => p.id)
        }
      };

      try {
        if (activeBillId.current) {
          await billService.updateBill(activeBillId.current, payload);
        } else {
          // Create draft
          const newId = await saveSession(payload);
          if (typeof newId === 'string') {
            activeBillId.current = newId;
            // Optionally update URL so reload works, but silent is fine for drafts
            window.history.replaceState({}, '', `/transaction/${newId}`);
          }
        }
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [amount, title, paidById, people, billId, user, existingEventId, existingSquadId, existingItemId]);

  const handlePrevStep = () => {
    if (currentStep > 0 && isOwner) {
      setCurrentStep(s => s - 1);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    
    // If not owner, just exit without saving
    if (!isOwner) {
      const { eventId: targetEventId, squadId: targetSquadId } = getTargetContext();
      if (existingEventId || targetEventId) {
        navigate(`/events/${existingEventId || targetEventId}`);
      } else if (existingSquadId || targetSquadId) {
        navigate(`/squads/${existingSquadId || targetSquadId}`);
      } else {
        navigate('/dashboard');
      }
      return;
    }

    setIsSaving(true);
    try {
      const numAmount = Number(amount);
      const { eventId: targetEventId, squadId: targetSquadId } = getTargetContext();

      if (activeBillId.current) {
        const dummyItemId = existingItemId || `item-${Date.now()}`;

        await billService.updateBill(activeBillId.current, {
          title,
          paidById,
          people,
          status: 'active',
          billType: targetEventId ? 'event' : 'private',
          ...(targetEventId && { eventId: targetEventId }),
          ...(targetSquadId && { squadId: targetSquadId }),
          billData: {
            items: [{ id: dummyItemId, name: title, price: numAmount }],
            subtotal: numAmount,
            tax: 0,
            tip: 0,
            total: numAmount,
            restaurantName: title
          },
          itemAssignments: {
            [dummyItemId]: people.map(p => p.id)
          }
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
          'active'
        );
      }

      if (existingEventId || targetEventId) {
        navigate(`/events/${existingEventId || targetEventId}`);
      } else if (existingSquadId || targetSquadId) {
        navigate(`/squads/${existingSquadId || targetSquadId}`);
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      console.error('Failed to save simple transaction', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="wizard-stepper mb-4 pr-4">
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
        onSwipeRight={currentStep > 0 && isOwner ? handlePrevStep : undefined}
        canSwipeLeft={canProceed() && isOwner}
        canSwipeRight={currentStep > 0 && isOwner}
        className={isMobile ? 'pb-[140px] relative' : ''}
      >
        <StepContent stepKey={currentStep}>
          {currentStep === 0 && (
            <DetailsStep
              amount={amount}
              setAmount={setAmount}
              title={title}
              setTitle={setTitle}
              onNext={handleNextStep}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
            />
          )}

          {currentStep === 1 && (
            <PeopleStep
              people={people}
              setPeople={setPeople}
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
              isOwner={isOwner}
            />
          )}
        </StepContent>
      </SwipeableStepContainer>

      {isMobile && (
        <WizardNavigation
          currentStep={currentStep}
          totalSteps={STEPS.length}
          onBack={handlePrevStep}
          onNext={handleNextStep}
          onComplete={handleComplete}
          onExit={() => {
            const { eventId: targetEventId, squadId: targetSquadId } = getTargetContext();
            if (targetEventId) {
              navigate(`/events/${targetEventId}`);
            } else if (targetSquadId) {
              navigate(`/squads/${targetSquadId}`);
            } else {
              navigate('/dashboard');
            }
          }}
          exitLabel={getTargetContext().eventId ? 'Event' : getTargetContext().squadId ? 'Squad' : 'Dashboard'}
          nextDisabled={!canProceed()}
          hasBillData={true}
          isLoading={isSaving}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
