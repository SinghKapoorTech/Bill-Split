import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useBillSplitter } from '@/hooks/useBillSplitter';
import { useFileUpload } from '@/hooks/useFileUpload';
import { Person, BillData, ItemAssignment } from '@/types';
import { RecurringFrequency, RecurringBill } from '@/types/recurring.types';
import { recurringBillService } from '@/services/recurringBillService';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';

import { BillEntryStep } from '@/components/bill-wizard/steps/BillEntryStep';
import { PeopleStep } from '@/components/bill-wizard/steps/PeopleStep';
import { AssignmentStep } from '@/components/bill-wizard/steps/AssignmentStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { RecurringReviewStep } from './steps/RecurringReviewStep';
import { ChangeTypeButton } from './ChangeTypeButton';

const STEPS = [
  { id: 1, label: 'Items', description: 'Fixed line items' },
  { id: 2, label: 'People', description: 'Who is splitting' },
  { id: 3, label: 'Assign', description: 'Who owes what' },
  { id: 4, label: 'Schedule', description: 'Frequency & dates' },
  { id: 5, label: 'Review', description: 'Confirm' },
];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

const noop = () => {};

export interface RecurringDetailedWizardProps {
  externalTitle?: string;
  setExternalTitle?: (title: string) => void;
  existing?: RecurringBill | null;
  onBackToType?: () => void;
}

/** Detailed (itemized) recurring bill: fixed line items + tax/tip regenerate each cycle. */
export function RecurringDetailedWizard({
  externalTitle,
  setExternalTitle,
  existing,
  onBackToType,
}: RecurringDetailedWizardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const upload = useFileUpload();

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
  const [people, setPeople] = useState<Person[]>([]);
  const [itemAssignments, setItemAssignments] = useState<ItemAssignment>({});
  const [splitEvenly, setSplitEvenly] = useState(false);
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

  useEffect(() => {
    if (user?.uid && !paidById) setPaidById(user.uid);
  }, [user?.uid]);

  // Hydrate from existing (edit)
  useEffect(() => {
    if (!existing || hasLoadedExisting.current) return;
    hasLoadedExisting.current = true;
    setTitle(existing.title);
    if (existing.billData) setBillData(existing.billData);
    if (existing.itemAssignments) setItemAssignments(existing.itemAssignments);
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
    setCurrentStep(STEPS.length - 1);
  }, [existing]);

  if (currentStep !== prevStepRef.current) {
    directionRef.current = currentStep > prevStepRef.current ? 'forward' : 'backward';
    prevStepRef.current = currentStep;
  }
  const stepDirection = directionRef.current;

  const hasItems = !!(billData?.items && billData.items.length > 0 && billData.total > 0);

  const canProceed = () => {
    if (currentStep === 0) return hasItems && title.trim().length > 0;
    if (currentStep === 1) return people.length > 1;
    if (currentStep === 2) return bill.allItemsAssigned;
    if (currentStep === 3) return !!startDate;
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

  const handleComplete = async () => {
    if (!user || !billData) return;
    setIsSaving(true);
    try {
      const input = {
        ownerId: user.uid,
        ownerName: user.displayName || 'Anonymous',
        title,
        amount: billData.total,
        paidById,
        people,
        splitEvenly,
        generatedType: 'detailed' as const,
        billData,
        itemAssignments,
        schedule: {
          frequency,
          ...(frequency === 'monthly' ? { dayOfMonth } : { dayOfWeek }),
          startDate,
          ...(hasEndDate && endDate ? { endDate } : {}),
        },
      };
      if (existing?.id) {
        await recurringBillService.updateRecurringBillFromInput(existing.id, input);
      } else {
        await recurringBillService.createRecurringBill(input);
      }
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to save recurring bill:', err);
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
            <BillEntryStep
              billData={billData}
              setBillData={setBillData}
              imagePreview={null}
              selectedFile={null}
              isUploading={false}
              isAnalyzing={false}
              onAnalyze={noop}
              onRemoveImage={noop}
              onImageSelected={noop}
              onNext={handleNext}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              isMobile={isMobile}
              removeItemAssignments={bill.removeItemAssignments}
              hideReceiptScan
            />
          )}

          {currentStep === 1 && (
            <PeopleStep
              people={people}
              setPeople={setPeople}
              billData={billData}
              newPersonName={peopleManager.newPersonName}
              newPersonVenmoId={peopleManager.newPersonVenmoId}
              onNameChange={peopleManager.setNewPersonName}
              onVenmoIdChange={peopleManager.setNewPersonVenmoId}
              onAdd={peopleManager.addPerson}
              onAddFromFriend={peopleManager.addFromFriend}
              onRemove={peopleManager.removePerson}
              onUpdate={handleUpdatePerson}
              onSaveAsFriend={peopleManager.savePersonAsFriend}
              paidById={paidById}
              onPaidByChange={setPaidById}
              imagePreview={null}
              selectedFile={null}
              isUploading={false}
              isAnalyzing={false}
              onNext={handleNext}
              onPrev={handlePrev}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              isMobile={isMobile}
              upload={upload}
            />
          )}

          {currentStep === 2 && (
            <AssignmentStep
              billData={billData}
              setBillData={setBillData}
              people={people}
              itemAssignments={itemAssignments}
              splitEvenly={splitEvenly}
              onAssign={bill.handleItemAssignment}
              onAssignAll={bill.assignAllPeopleToItem}
              onToggleSplitEvenly={bill.toggleSplitEvenly}
              removePersonFromAssignments={bill.removePersonFromAssignments}
              removeItemAssignments={bill.removeItemAssignments}
              imagePreview={null}
              selectedFile={null}
              isUploading={false}
              isAnalyzing={false}
              onNext={handleNext}
              onPrev={handlePrev}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              isMobile={isMobile}
              upload={upload}
            />
          )}

          {currentStep === 3 && (
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

          {currentStep === 4 && (
            <RecurringReviewStep
              amount={(billData?.total ?? 0).toString()}
              title={title}
              paidById={paidById}
              people={people}
              isSaving={isSaving}
              isEditing={!!existing}
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
