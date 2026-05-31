import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { App } from '@capacitor/app';
import { usePlatform } from '@/hooks/usePlatform';
import { usePeopleManager } from '@/hooks/usePeopleManager';
import { useUserProfile } from '@/hooks/useUserProfile';
import { Person, BillData } from '@/types';
import { RecurringFrequency, RecurringBill } from '@/types/recurring.types';
import { recurringBillService } from '@/services/recurringBillService';
import { ensureUserInPeople } from '@/utils/billCalculations';
import { SplitMethod } from '@/components/simple-transaction-wizard/SplitMethodSelector';
import { Stepper, StepContent } from '@/components/ui/stepper';
import { PillProgress } from '@/components/ui/pill-progress';
import { SwipeableStepContainer } from '@/components/ui/swipeable-container';
import { WizardNavigation } from '@/components/bill-wizard/WizardNavigation';

import { DetailsStep } from '@/components/simple-transaction-wizard/steps/DetailsStep';
import { PeopleStep } from '@/components/simple-transaction-wizard/steps/PeopleStep';
import { ScheduleStep } from './steps/ScheduleStep';
import { RecurringReviewStep } from './steps/RecurringReviewStep';
import { ChangeTypeButton } from './ChangeTypeButton';

const STEPS = [
  { id: 1, label: 'Details', description: 'Amount & Info' },
  { id: 2, label: 'People', description: 'Who is splitting' },
  { id: 3, label: 'Schedule', description: 'Frequency & dates' },
  { id: 4, label: 'Review', description: 'Confirm' },
];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export interface RecurringQuickWizardProps {
  externalTitle?: string;
  setExternalTitle?: (title: string) => void;
  existing?: RecurringBill | null;
  onBackToType?: () => void;
}

/**
 * Quick (simple-transaction style) recurring bill: a single amount split among people.
 */
export function RecurringQuickWizard({
  externalTitle,
  setExternalTitle,
  existing,
  onBackToType,
}: RecurringQuickWizardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { isNative } = usePlatform();
  const { profile } = useUserProfile();

  const [currentStep, setCurrentStep] = useState(0);
  const prevStepRef = useRef(0);
  const directionRef = useRef<'forward' | 'backward'>('forward');

  // Details state
  const [amount, setAmount] = useState('');
  const [internalTitle, setInternalTitle] = useState('');
  const title = externalTitle !== undefined ? externalTitle : internalTitle;
  const setTitle = (v: string) => {
    setInternalTitle(v);
    setExternalTitle?.(v);
  };

  // People state
  const [paidById, setPaidById] = useState(user?.uid || '');
  const [people, setPeople] = useState<Person[]>([]);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [exactAmounts, setExactAmounts] = useState<Record<string, number>>({});

  // Schedule state
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dayOfWeek, setDayOfWeek] = useState(1); // Monday
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState('');
  const [hasEndDate, setHasEndDate] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const hasLoadedExisting = useRef(false);

  const peopleManager = usePeopleManager(people, setPeople);

  // Init paidById once auth resolves
  useEffect(() => {
    if (user?.uid && !paidById) setPaidById(user.uid);
  }, [user?.uid]);

  // Pre-populate people with the current user (new bill only)
  useEffect(() => {
    if (user && people.length === 0 && !existing) {
      setPeople(ensureUserInPeople([], user, profile));
    }
  }, [user, profile]);

  // Hydrate from existing recurring bill (edit)
  useEffect(() => {
    if (!existing || hasLoadedExisting.current) return;
    hasLoadedExisting.current = true;
    setTitle(existing.title);
    setAmount(existing.amount.toString());
    setPaidById(existing.paidById);
    setPeople(existing.people);
    setFrequency(existing.schedule.frequency);
    if (existing.schedule.dayOfWeek !== undefined) setDayOfWeek(existing.schedule.dayOfWeek);
    if (existing.schedule.dayOfMonth !== undefined) setDayOfMonth(existing.schedule.dayOfMonth);
    setStartDate(existing.schedule.startDate);
    if (existing.schedule.endDate) {
      setHasEndDate(true);
      setEndDate(existing.schedule.endDate);
    }
    if (existing.exactAmounts) setExactAmounts(existing.exactAmounts);
    if (!existing.splitEvenly) setSplitMethod('exact');
    setCurrentStep(3); // Go to review
  }, [existing]);

  // Track direction for animations
  if (currentStep !== prevStepRef.current) {
    directionRef.current = currentStep > prevStepRef.current ? 'forward' : 'backward';
    prevStepRef.current = currentStep;
  }
  const stepDirection = directionRef.current;

  // Hardware back button
  const stepRef = useRef(currentStep);
  useEffect(() => { stepRef.current = currentStep; }, [currentStep]);

  useEffect(() => {
    if (!isNative) return;
    let handle: { remove: () => void } | null = null;
    App.addListener('backButton', () => {
      if (stepRef.current > 0) setCurrentStep((s) => s - 1);
      else if (onBackToType) onBackToType();
      else window.history.back();
    }).then((h) => { handle = h; });
    return () => { handle?.remove(); };
  }, [isNative, onBackToType]);

  // Sync split data when people change
  useEffect(() => {
    if (people.length < 2) return;
    const equalPct = Math.round((100 / people.length) * 100) / 100;
    const equalAmt = Math.round((Number(amount) / people.length) * 100) / 100;

    setPercentages((prev) => {
      const existingIds = new Set(Object.keys(prev));
      const currentIds = new Set(people.map((p) => p.id));
      const changed = people.some((p) => !existingIds.has(p.id)) || [...existingIds].some((id) => !currentIds.has(id));
      if (changed || Object.keys(prev).length === 0) {
        const next: Record<string, number> = {};
        people.forEach((p, i) => {
          next[p.id] = i === people.length - 1 ? Math.round((100 - equalPct * (people.length - 1)) * 100) / 100 : equalPct;
        });
        return next;
      }
      return prev;
    });

    setExactAmounts((prev) => {
      const existingIds = new Set(Object.keys(prev));
      const currentIds = new Set(people.map((p) => p.id));
      const changed = people.some((p) => !existingIds.has(p.id)) || [...existingIds].some((id) => !currentIds.has(id));
      if (changed || Object.keys(prev).length === 0) {
        const next: Record<string, number> = {};
        people.forEach((p, i) => {
          next[p.id] = i === people.length - 1 ? Math.round((Number(amount) - equalAmt * (people.length - 1)) * 100) / 100 : equalAmt;
        });
        return next;
      }
      return prev;
    });
  }, [people.map((p) => p.id).join(','), amount]);

  const isSplitValid = () => {
    if (splitMethod === 'equal') return true;
    if (splitMethod === 'percentage') {
      const sum = Object.values(percentages).reduce((a, b) => a + b, 0);
      return Math.abs(sum - 100) < 0.02;
    }
    if (splitMethod === 'exact') {
      const sum = Object.values(exactAmounts).reduce((a, b) => a + b, 0);
      return Math.abs(sum - Number(amount)) < 0.02;
    }
    return true;
  };

  const canProceed = () => {
    if (currentStep === 0) return Number(amount) > 0 && title.trim().length > 0;
    if (currentStep === 1) return people.length > 1 && isSplitValid();
    if (currentStep === 2) return !!startDate;
    return true;
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1 && canProceed()) setCurrentStep((s) => s + 1);
  };

  const handlePrev = () => {
    if (currentStep > 0) setCurrentStep((s) => s - 1);
    else onBackToType?.();
  };

  // Build the bill snapshot copied into each generated occurrence.
  const buildSnapshot = (): { billData: BillData; itemAssignments: Record<string, string[]> } => {
    const numAmount = Number(amount) || 0;

    const getPersonAmount = (personId: string, index: number): number => {
      if (splitMethod === 'percentage') {
        if (index === people.length - 1) {
          const othersTotal = people
            .slice(0, -1)
            .reduce((sum, p) => sum + Math.round((numAmount * (percentages[p.id] || 0)) / 100 * 100) / 100, 0);
          return Math.round((numAmount - othersTotal) * 100) / 100;
        }
        return Math.round((numAmount * (percentages[personId] || 0)) / 100 * 100) / 100;
      }
      if (splitMethod === 'exact') return exactAmounts[personId] || 0;
      return people.length > 0 ? numAmount / people.length : 0;
    };

    if (splitMethod === 'equal') {
      const itemId = 'item-recurring';
      return {
        billData: {
          items: [{ id: itemId, name: title || 'Expense', price: numAmount }],
          subtotal: numAmount,
          tax: 0,
          tip: 0,
          otherFees: 0,
          total: numAmount,
          restaurantName: title || undefined,
        },
        itemAssignments: { [itemId]: people.map((p) => p.id) },
      };
    }

    const items = people.map((p, i) => ({
      id: `item-${p.id}`,
      name: `${p.name}'s share`,
      price: getPersonAmount(p.id, i),
    }));
    const itemAssignments: Record<string, string[]> = {};
    people.forEach((p) => { itemAssignments[`item-${p.id}`] = [p.id]; });
    return {
      billData: {
        items,
        subtotal: numAmount,
        tax: 0,
        tip: 0,
        otherFees: 0,
        total: numAmount,
        restaurantName: title || undefined,
      },
      itemAssignments,
    };
  };

  const handleComplete = async () => {
    if (!user) return;
    setIsSaving(true);
    try {
      const { billData, itemAssignments } = buildSnapshot();
      await recurringBillService.createRecurringBill({
        ownerId: user.uid,
        ownerName: user.displayName || 'Anonymous',
        title,
        amount: Number(amount),
        paidById,
        people,
        splitEvenly: splitMethod === 'equal',
        ...(splitMethod === 'exact' && { exactAmounts }),
        generatedType: 'quick',
        billData,
        itemAssignments,
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
            <DetailsStep
              amount={amount}
              setAmount={setAmount}
              title={title}
              setTitle={setTitle}
              onNext={handleNext}
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
              onNext={handleNext}
              onPrev={handlePrev}
              canProceed={canProceed()}
              currentStep={currentStep}
              totalSteps={STEPS.length}
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

          {currentStep === 3 && (
            <RecurringReviewStep
              amount={amount}
              title={title}
              paidById={paidById}
              people={people}
              isSaving={isSaving}
              onPrev={handlePrev}
              onComplete={handleComplete}
              currentStep={currentStep}
              totalSteps={STEPS.length}
              splitMethod={splitMethod}
              percentages={percentages}
              exactAmounts={exactAmounts}
              frequency={frequency}
              dayOfWeek={dayOfWeek}
              dayOfMonth={dayOfMonth}
              startDate={startDate}
              endDate={hasEndDate ? endDate : undefined}
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
