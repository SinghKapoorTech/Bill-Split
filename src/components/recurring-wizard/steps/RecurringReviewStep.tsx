import { Person, PersonTotal, BillData, ItemAssignment } from '@/types';
import { RecurringFrequency } from '@/types/recurring.types';
import { formatScheduleSummary, getNextBillDates } from '@/utils/scheduleFormat';
import { resolveSplitAmounts, buildPerPersonShareItems } from '@shared/splitAmounts';
import { Calendar, Repeat } from 'lucide-react';
import { SplitSummary } from '@/components/people/SplitSummary';
import { StepFooter } from '@/components/shared/StepFooter';
import { SplitDonutChart } from '@/components/shared/SplitDonutChart';
import { SplitMethod } from '@/components/simple-transaction-wizard/SplitMethodSelector';
import { useAuth } from '@/contexts/AuthContext';

interface RecurringReviewStepProps {
  amount: string;
  title: string;
  paidById: string;
  people: Person[];
  isSaving: boolean;
  isEditing?: boolean;
  onPrev: () => void;
  onComplete: () => void;
  currentStep: number;
  totalSteps: number;
  splitMethod: SplitMethod;
  percentages: Record<string, number>;
  exactAmounts: Record<string, number>;
  // Schedule info
  frequency: RecurringFrequency;
  dayOfWeek: number;
  dayOfMonth: number;
  startDate: string;
  endDate?: string;
  // Overrides for detailed/airbnb types, which build a real billData snapshot
  // rather than deriving one from a single amount + split method.
  billDataOverride?: BillData;
  itemAssignmentsOverride?: ItemAssignment;
  personTotalsOverride?: PersonTotal[];
}

export function RecurringReviewStep({
  amount,
  title,
  paidById,
  people,
  isSaving,
  isEditing,
  onPrev,
  onComplete,
  currentStep,
  totalSteps,
  splitMethod,
  percentages,
  exactAmounts,
  frequency,
  dayOfWeek,
  dayOfMonth,
  startDate,
  endDate,
  billDataOverride,
  itemAssignmentsOverride,
  personTotalsOverride,
}: RecurringReviewStepProps) {
  const { user } = useAuth();
  const numAmount = billDataOverride ? billDataOverride.total : Number(amount) || 0;

  // Per-person amounts — same shared math as the saved snapshot, so the
  // review screen always shows exactly what gets persisted.
  const personAmounts = resolveSplitAmounts(numAmount, people, splitMethod, percentages, exactAmounts);

  let dummyBillData: BillData;
  let dummyItemAssignments: ItemAssignment;

  if (splitMethod === 'equal') {
    dummyBillData = {
      items: [{ id: 'dummy-item', name: title || 'Expense', price: numAmount }],
      subtotal: numAmount,
      tax: 0,
      tip: 0,
      total: numAmount,
    };
    dummyItemAssignments = { 'dummy-item': people.map((p) => p.id) };
  } else {
    const { items, itemAssignments } = buildPerPersonShareItems(people, personAmounts);
    dummyBillData = {
      items,
      subtotal: numAmount,
      tax: 0,
      tip: 0,
      total: numAmount,
    };
    dummyItemAssignments = itemAssignments;
  }

  const personTotals: PersonTotal[] = people.map((p) => {
    const personAmount = personAmounts[p.id] ?? 0;
    return {
      personId: p.id,
      name: p.name,
      itemsSubtotal: personAmount,
      tax: 0,
      tip: 0,
      otherFees: 0,
      total: personAmount,
    };
  });

  // Detailed/airbnb pass real snapshots; quick derives from amount + split method.
  const finalBillData = billDataOverride ?? dummyBillData;
  const finalItemAssignments = itemAssignmentsOverride ?? dummyItemAssignments;
  const finalPersonTotals = personTotalsOverride ?? personTotals;

  const scheduleParts = { frequency, dayOfWeek, dayOfMonth, startDate, endDate };
  const scheduleSummary = formatScheduleSummary(scheduleParts);
  const nextDates = getNextBillDates(scheduleParts, 3);

  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto w-full">
      {/* Schedule Card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Repeat className="w-4 h-4 text-emerald-500" />
          Schedule
        </div>
        <p className="text-sm text-muted-foreground">{scheduleSummary}</p>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Next bills
          </p>
          {nextDates.length > 0 ? (
            nextDates.map((date, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                {date}
              </div>
            ))
          ) : (
            /* Defence in depth: the schedule step blocks this, but never render
               a bare "Next bills" heading with nothing under it. */
            <p className="text-sm text-destructive">
              None — the end date is before the first bill.
            </p>
          )}
        </div>
      </div>

      {finalPersonTotals.length > 1 && (
        <SplitDonutChart personTotals={finalPersonTotals} total={numAmount} />
      )}

      <div className="w-full">
        <SplitSummary
          preview
          personTotals={finalPersonTotals}
          allItemsAssigned={true}
          people={people}
          billData={finalBillData}
          itemAssignments={finalItemAssignments}
          paidById={paidById}
          ownerId={user?.uid}
        />
      </div>

      {/* Desktop only: StepFooter */}
      <div className="hidden md:block">
        <StepFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onPrev}
          onComplete={onComplete}
          completeLabel={isEditing ? 'Save' : 'Create'}
          nextDisabled={isSaving}
        />
      </div>
    </div>
  );
}
