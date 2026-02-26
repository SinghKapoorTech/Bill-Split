import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { Person, PersonTotal } from '@/types';
import { billService } from '@/services/billService';
import { friendBalanceService } from '@/services/friendBalanceService';
import { eventLedgerService } from '@/services/eventLedgerService';
import { useBillContext } from '@/contexts/BillSessionContext';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';

import { DetailsStep } from './steps/DetailsStep';
import { PeopleStep } from './steps/PeopleStep';
import { ReviewStep } from './steps/ReviewStep';

const STEPS = [
  { id: 1, label: 'Details', description: 'Amount & Info' },
  { id: 2, label: 'People', description: 'Who is splitting' },
  { id: 3, label: 'Review', description: 'Confirm' },
];

export function SimpleTransactionWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { state: routerState } = useLocation();
  const { billId } = useParams<{ billId: string }>();
  const { activeSession, resumeSession } = useBillContext();

  const [currentStep, setCurrentStep] = useState(0);
  const [amount, setAmount] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [paidById, setPaidById] = useState<string>(user?.uid || '');
  const [people, setPeople] = useState<Person[]>(() => {
    if (user) {
      return [{
        id: `user-${user.uid}`,
        name: user.displayName || 'You',
        isAnonymous: false,
      } as Person];
    }
    return [];
  });
  const [isSaving, setIsSaving] = useState(false);

  const peopleManager = usePeopleManager(people, setPeople);

  const hasLoadedBillId = useRef<string | null>(null);

  useEffect(() => {
    // If we're creating a new transaction, exit early
    if (!billId || billId === 'new') return;

    const applyBillData = (bill: any) => {
      if (bill.title) setTitle(bill.title);
      if (bill.billData?.total) setAmount(bill.billData.total.toString());
      if (bill.paidById) setPaidById(bill.paidById);
      if (bill.people && bill.people.length > 0) setPeople(bill.people);
      
      // Force to the review step automatically for existing transactions
      setCurrentStep(2);
    };

    if (activeSession && activeSession.id === billId) {
      if (hasLoadedBillId.current !== activeSession.id) {
        hasLoadedBillId.current = activeSession.id;
        applyBillData(activeSession);
      }
    } else if (billId && hasLoadedBillId.current !== billId) {
      hasLoadedBillId.current = billId;
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

  // Helper to calculate totals for balances
  const getPersonTotals = (currentAmount: number, currentPeople: Person[]): PersonTotal[] => {
    const numAmount = currentAmount || 0;
    const splitAmount = currentPeople.length > 0 ? numAmount / currentPeople.length : 0;
    return currentPeople.map(p => ({
      personId: p.id,
      name: p.name,
      itemsSubtotal: splitAmount,
      tax: 0,
      tip: 0,
      total: splitAmount
    }));
  };

  // ── Auto-save existing transactions (Debounced) ───────────
  // Automatically saves edits to Amount, Title, and People if this transaction already exists in the database.
  useEffect(() => {
    if (!billId || billId === 'new' || !user || !hasLoadedBillId.current) return;
    
    const timeoutId = setTimeout(() => {
      const numAmount = Number(amount);
      if (numAmount === 0 || title.trim().length === 0 || people.length === 0) return;
      
      const dummyItemId = activeSession?.billData?.items?.[0]?.id || `item-${Date.now()}`;
      const targetEventId = activeSession?.eventId || routerState?.targetEventId;
      
      billService.updateBill(billId, {
          title,
          paidById,
          people,
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
      }).then(async () => {
         const personTotals = getPersonTotals(numAmount, people);
         try {
           await friendBalanceService.applyBillBalancesIdempotent(billId, user.uid, personTotals);
         } catch (e) {
           console.error("friendBalance error in autosave:", e);
         }
         
         if (targetEventId) {
            try {
              await eventLedgerService.applyBillToEventLedgerIdempotent(targetEventId, billId, user.uid, personTotals);
            } catch (e) {
              console.error("eventLedger error in autosave:", e);
            }
         }
      }).catch(console.error);
      
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [amount, title, paidById, people, billId, user, activeSession?.eventId, activeSession?.billData?.items, routerState?.targetEventId]);

  const handleNextStep = () => {
    if (currentStep < STEPS.length - 1 && canProceed()) {
      setCurrentStep(s => s + 1);
    }
  };

  const handlePrevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(s => s - 1);
    }
  };

  const handleComplete = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const numAmount = Number(amount);
      const targetEventId = routerState?.targetEventId;

      if (billId && billId !== 'new') {
        // Find the dummy item ID to recycle, or create a new one
        const dummyItemId = activeSession?.billData?.items?.[0]?.id || `item-${Date.now()}`;
        
        await billService.updateBill(billId, {
          title,
          paidById,
          people,
          billData: {
            items: [{
              id: dummyItemId,
              name: title,
              price: numAmount
            }],
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

        // Apply balances only AFTER successfully writing the bill to database
        const personTotals = getPersonTotals(numAmount, people);
        await friendBalanceService.applyBillBalancesIdempotent(
          billId,
          user.uid,
          personTotals
        ).catch(console.error);

        if (targetEventId) {
          await eventLedgerService.applyBillToEventLedgerIdempotent(
            targetEventId,
            billId,
            user.uid,
            personTotals
          ).catch(console.error);
        }
      } else {
        const newBillId = await billService.createSimpleTransaction(
          user.uid,
          user.displayName || 'Anonymous',
          numAmount,
          title,
          paidById,
          people,
          targetEventId
        );
        const personTotals = getPersonTotals(numAmount, people);
        await friendBalanceService.applyBillBalancesIdempotent(
          newBillId,
          user.uid,
          personTotals
        ).catch(console.error);

        if (targetEventId) {
          await eventLedgerService.applyBillToEventLedgerIdempotent(
            targetEventId,
            newBillId,
            user.uid,
            personTotals
          ).catch(console.error);
        }
      }

      if (targetEventId) {
        navigate(`/events/${targetEventId}`);
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
               if (step <= currentStep) setCurrentStep(step);
            }}
            canNavigateToStep={(step) => step <= currentStep}
          />
        ) : (
          <Stepper
            steps={STEPS}
            currentStep={currentStep}
            orientation="horizontal"
            onStepClick={(step) => {
               if (step < currentStep) setCurrentStep(step);
            }}
            canNavigateToStep={(step) => step <= currentStep}
          />
        )}
      </div>

      <SwipeableStepContainer
        onSwipeLeft={canProceed() ? handleNextStep : undefined}
        onSwipeRight={currentStep > 0 ? handlePrevStep : undefined}
        canSwipeLeft={canProceed()}
        canSwipeRight={currentStep > 0}
        className={isMobile ? 'pb-[140px] relative' : ''}
      >
        <StepContent stepKey={currentStep}>
          {currentStep === 0 && (
            <DetailsStep
              amount={amount}
              setAmount={setAmount}
              title={title}
              setTitle={setTitle}
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
            if (routerState?.targetEventId) {
              navigate(`/events/${routerState.targetEventId}`);
            } else {
              navigate('/dashboard');
            }
          }}
          exitLabel={routerState?.targetEventId ? 'Event' : 'Dashboard'}
          nextDisabled={!canProceed()}
          hasBillData={true}
          isLoading={isSaving}
          isMobile={isMobile}
        />
      )}
    </>
  );
}
