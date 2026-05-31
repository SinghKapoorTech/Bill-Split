import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { Person, BillData, ItemAssignment } from '@/types';
import { Bill } from '@/types/bill.types';
import { RecurringFrequency, RecurringBill } from '@/types/recurring.types';
import { recurringBillService } from '@/services/recurringBillService';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';

import { AirbnbEntryStep } from '@/components/airbnb-wizard/steps/AirbnbEntryStep';
import { AirbnbGuestsStep } from '@/components/airbnb-wizard/steps/AirbnbGuestsStep';
import { AirbnbSplitMethodStep } from '@/components/airbnb-wizard/steps/AirbnbSplitMethodStep';
import { AirbnbAssignStep } from '@/components/airbnb-wizard/steps/AirbnbAssignStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { RecurringReviewStep } from './steps/RecurringReviewStep';
import { ChangeTypeButton } from './ChangeTypeButton';

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export interface RecurringAirbnbWizardProps {
  externalTitle?: string;
  setExternalTitle?: (title: string) => void;
  existing?: RecurringBill | null;
  onBackToType?: () => void;
}

/** Airbnb/House recurring bill: a stay (nights + fees) regenerates each cycle. */
export function RecurringAirbnbWizard({
  externalTitle,
  setExternalTitle,
  existing,
  onBackToType,
}: RecurringAirbnbWizardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [currentStep, setCurrentStep] = useState(0);
  const prevStepRef = useRef(0);
  const directionRef = useRef<'forward' | 'backward'>('forward');

  const internalTitleState = useState('');
  const title = externalTitle !== undefined ? externalTitle : internalTitleState[0];
  const setTitle = (v: string) => {
    internalTitleState[1](v);
    setExternalTitle?.(v);
  };

  const [billData, setBillData] = useState<BillData | null>(null);
  const [airbnbData, setAirbnbData] = useState<Bill['airbnbData']>(undefined);
  const [people, setPeople] = useState<Person[]>([]);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});
  const [splitEvenly, setSplitEvenly] = useState(true);
  const [paidById, setPaidById] = useState(user?.uid || '');

  // Schedule state
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [hasEndDate, setHasEndDate] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const hasLoadedExisting = useRef(false);

  const peopleManager = usePeopleManager(people, setPeople);
  const bill = useBillSplitter({
    people,
    billData,
    setBillData,
    itemAssignments,
    setItemAssignments,
    splitEvenly,
    setSplitEvenly,
  });

  const STEPS = splitEvenly
    ? [
        { id: 1, label: 'Details', description: 'Dates & Cost' },
        { id: 2, label: 'Guests', description: 'Add guests' },
        { id: 3, label: 'Method', description: 'How to split' },
        { id: 4, label: 'Schedule', description: 'Frequency' },
        { id: 5, label: 'Review', description: 'Confirm' },
      ]
    : [
        { id: 1, label: 'Details', description: 'Dates & Cost' },
        { id: 2, label: 'Guests', description: 'Add guests' },
        { id: 3, label: 'Method', description: 'How to split' },
        { id: 4, label: 'Assign', description: 'Nights' },
        { id: 5, label: 'Schedule', description: 'Frequency' },
        { id: 6, label: 'Review', description: 'Confirm' },
      ];

  const assignStepIndex = splitEvenly ? -1 : 3;
  const scheduleStepIndex = splitEvenly ? 3 : 4;
  const reviewStepIndex = STEPS.length - 1;

  useEffect(() => {
    if (user?.uid && !paidById) setPaidById(user.uid);
  }, [user?.uid]);

  // Keep currentStep in range if the step count changes (splitEvenly toggle / hydrate)
  useEffect(() => {
    if (currentStep >= STEPS.length) setCurrentStep(STEPS.length - 1);
  }, [STEPS.length, currentStep]);

  // Hydrate from existing (edit)
  useEffect(() => {
    if (!existing || hasLoadedExisting.current) return;
    hasLoadedExisting.current = true;
    setTitle(existing.title);
    if (existing.billData) setBillData(existing.billData);
    if (existing.itemAssignments) setItemAssignments(existing.itemAssignments);
    if (existing.airbnbData) setAirbnbData(existing.airbnbData);
    setPeople(existing.people);
    setPaidById(existing.paidById);
    setSplitEvenly(existing.splitEvenly);
    setFrequency(existing.schedule.frequency);
    if (existing.schedule.dayOfWeek !== undefined) setDayOfWeek(existing.schedule.dayOfWeek);
    if (existing.schedule.dayOfMonth !== undefined) setDayOfMonth(existing.schedule.dayOfMonth);
    setStartDate(existing.schedule.startDate);
    if (existing.schedule.endDate) {
      setHasEndDate(true);
      setEndDate(existing.schedule.endDate);
    }
    setCurrentStep(99); // clamped to review by the range effect
  }, [existing]);

  if (currentStep !== prevStepRef.current) {
    directionRef.current = currentStep > prevStepRef.current ? 'forward' : 'backward';
    prevStepRef.current = currentStep;
  }
  const stepDirection = directionRef.current;

  const canProceed = () => {
    if (currentStep === 0) return !!(billData?.items && billData.items.length > 0 && billData.subtotal > 0);
    if (currentStep === 1) return people.length > 1;
    if (currentStep === 2) return true;
    if (!splitEvenly && currentStep === assignStepIndex) return bill.allItemsAssigned;
    if (currentStep === scheduleStepIndex) return !!startDate;
    return true;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1 && canProceed()) setCurrentStep((s) => s + 1);
  };
  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
    else onBackToType?.();
  };

  const handleUpdatePerson = async (personId: string, updates: Partial<Person>) => {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, ...updates } : p)));
  };

  const handleToggleSplitEvenly = (evenly: boolean) => {
    if (splitEvenly === evenly) return;
    setSplitEvenly(evenly);
    if (evenly && billData) {
      const a: ItemAssignment = {};
      billData.items.forEach((it) => { a[it.id] = people.map((p) => p.id); });
      setItemAssignments(a);
    } else {
      setItemAssignments({});
    }
  };

  const handleComplete = async () => {
    if (!user || !billData) return;
    setIsSaving(true);
    try {
      const finalTitle = title || billData.restaurantName || 'Recurring stay';
      await recurringBillService.createRecurringBill({
        ownerId: user.uid,
        ownerName: user.displayName || 'Anonymous',
        title: finalTitle,
        amount: billData.total,
        paidById,
        people,
        splitEvenly,
        generatedType: 'airbnb',
        billData,
        itemAssignments,
        isAirbnb: true,
        ...(airbnbData && { airbnbData }),
        schedule: {
          frequency,
          ...(frequency === 'monthly' ? { dayOfMonth } : { dayOfWeek }),
          startDate,
          ...(hasEndDate && endDate ? { endDate } : {}),
        },
      });
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to create recurring bill:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="wizard-stepper shrink-0 mb-4 pr-4">
        {onBackToType && <ChangeTypeButton onClick={onBackToType} />}
        {isMobile ? (
          <PillProgress
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={(step) => step <= currentStep && setCurrentStep(step)}
            canNavigateToStep={(step) => step <= currentStep}
          />
        ) : (
          <Stepper
            steps={STEPS}
            currentStep={currentStep}
            orientation="horizontal"
            onStepClick={(step) => step < currentStep && setCurrentStep(step)}
            canNavigateToStep={(step) => step <= currentStep}
          />
        )}
      </div>

      <SwipeableStepContainer
        onSwipeLeft={canProceed() ? handleNext : undefined}
        onSwipeRight={currentStep > 0 ? handlePrev : undefined}
        canSwipeLeft={canProceed()}
        canSwipeRight={currentStep > 0}
        className={isMobile ? 'flex-1 min-h-0 overflow-y-auto scrollbar-hide pb-[140px] relative' : 'flex-1 min-h-0 overflow-y-auto scrollbar-hide'}
      >
        <StepContent stepKey={currentStep} direction={stepDirection}>
          {currentStep === 0 && (
            <AirbnbEntryStep
              billData={billData}
              setBillData={setBillData}
              airbnbData={airbnbData}
              setAirbnbData={setAirbnbData}
              onNext={handleNext}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              isMobile={isMobile}
            />
          )}

          {currentStep === 1 && (
            <AirbnbGuestsStep
              people={people}
              setPeople={setPeople}
              billData={billData}
              isMobile={isMobile}
              onAdd={peopleManager.addPerson}
              onAddFromFriend={peopleManager.addFromFriend}
              onRemove={peopleManager.removePerson}
              onUpdate={handleUpdatePerson}
              onSaveAsFriend={peopleManager.savePersonAsFriend}
              onNext={handleNext}
              onPrev={handlePrev}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              paidById={paidById}
              onPaidByChange={setPaidById}
            />
          )}

          {currentStep === 2 && (
            <AirbnbSplitMethodStep
              splitEvenly={splitEvenly}
              onToggleSplitEvenly={handleToggleSplitEvenly}
              onNext={handleNext}
              onPrev={handlePrev}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              isMobile={isMobile}
            />
          )}

          {!splitEvenly && currentStep === assignStepIndex && (
            <AirbnbAssignStep
              billData={billData}
              people={people}
              itemAssignments={itemAssignments}
              onAssign={bill.handleItemAssignment}
              onNext={handleNext}
              onPrev={handlePrev}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              isMobile={isMobile}
              isOwner
              currentUserId={user?.uid}
            />
          )}

          {currentStep === scheduleStepIndex && (
            <ScheduleStep
              frequency={frequency}
              setFrequency={setFrequency}
              dayOfWeek={dayOfWeek}
              setDayOfWeek={setDayOfWeek}
              dayOfMonth={dayOfMonth}
              setDayOfMonth={setDayOfMonth}
              startDate={startDate}
              setStartDate={setStartDate}
              endDate={endDate}
              setEndDate={setEndDate}
              hasEndDate={hasEndDate}
              setHasEndDate={setHasEndDate}
              onNext={handleNext}
              onPrev={handlePrev}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
            />
          )}

          {currentStep === reviewStepIndex && (
            <RecurringReviewStep
              amount={(billData?.total ?? 0).toString()}
              title={title}
              paidById={paidById}
              people={people}
              isSaving={isSaving}
              onPrev={handlePrev}
              onComplete={handleComplete}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              splitMethod="equal"
              percentages={{}}
              exactAmounts={{}}
              frequency={frequency}
              dayOfWeek={dayOfWeek}
              dayOfMonth={dayOfMonth}
              startDate={startDate}
              endDate={hasEndDate ? endDate : undefined}
              billDataOverride={billData ?? undefined}
              itemAssignmentsOverride={itemAssignments}
              personTotalsOverride={bill.personTotals}
            />
          )}
        </StepContent>
      </SwipeableStepContainer>

      {isMobile && (
        <WizardNavigation
          currentStep={currentStep}
          totalSteps={STEPS.length}
          onBack={currentStep > 0 ? handlePrev : onBackToType}
          onNext={handleNext}
          onComplete={handleComplete}
          onExit={() => navigate('/dashboard')}
          exitLabel="Dashboard"
          nextDisabled={!canProceed()}
          hasBillData={true}
          isLoading={isSaving}
          isMobile={isMobile}
        />
      )}
    </div>
  );
}
