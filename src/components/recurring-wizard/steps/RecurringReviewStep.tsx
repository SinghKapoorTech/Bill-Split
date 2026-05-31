import { Person, PersonTotal, BillData, ItemAssignment } from '@/types';
import { RecurringFrequency } from '@/types/recurring.types';
import { Loader2, Calendar, Repeat } from 'lucide-react';
import { SplitSummary } from '@/components/people/SplitSummary';
import { StepFooter } from '@/components/shared/StepFooter';
import { SplitDonutChart } from '@/components/shared/SplitDonutChart';
import { SplitMethod } from '@/components/simple-transaction-wizard/SplitMethodSelector';
import { useAuth } from '@/contexts/AuthContext';

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface RecurringReviewStepProps {
  amount: string;
  title: string;
  paidById: string;
  people: Person[];
  isSaving: boolean;
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

function formatScheduleSummary(
  frequency: RecurringFrequency,
  dayOfWeek: number,
  dayOfMonth: number,
  startDate: string,
  endDate?: string
): string {
  let freq = '';
  if (frequency === 'weekly') {
    freq = `Every week on ${DAYS_OF_WEEK[dayOfWeek]}`;
  } else if (frequency === 'biweekly') {
    freq = `Every 2 weeks on ${DAYS_OF_WEEK[dayOfWeek]}`;
  } else {
    const suffix =
      dayOfMonth === 1 || dayOfMonth === 21 || dayOfMonth === 31
        ? 'st'
        : dayOfMonth === 2 || dayOfMonth === 22
        ? 'nd'
        : dayOfMonth === 3 || dayOfMonth === 23
        ? 'rd'
        : 'th';
    freq = `Every month on the ${dayOfMonth}${suffix}`;
  }

  const start = new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  let result = `${freq}, starting ${start}`;
  if (endDate) {
    const end = new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    result += ` until ${end}`;
  }
  return result;
}

function getNextBillDates(
  frequency: RecurringFrequency,
  dayOfWeek: number,
  dayOfMonth: number,
  startDate: string,
  count: number
): string[] {
  const dates: string[] = [];
  let current = new Date(startDate + 'T00:00:00');

  for (let i = 0; i < count; i++) {
    dates.push(
      current.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    );

    if (frequency === 'weekly') {
      current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (frequency === 'biweekly') {
      current = new Date(current.getTime() + 14 * 24 * 60 * 60 * 1000);
    } else {
      const nextMonth = new Date(current);
      // Must set day to 1 first to avoid month overflow (e.g., Jan 31 → Feb 31 → Mar 3)
      const targetDay = dayOfMonth;
      nextMonth.setDate(1);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const lastDay = new Date(nextMonth.getFullYear(), nextMonth.getMonth() + 1, 0).getDate();
      nextMonth.setDate(Math.min(targetDay, lastDay));
      current = nextMonth;
    }
  }

  return dates;
}

export function RecurringReviewStep({
  amount,
  title,
  paidById,
  people,
  isSaving,
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

  const getPersonAmount = (personId: string, index: number): number => {
    if (splitMethod === 'percentage') {
      if (index === people.length - 1) {
        const othersTotal = people
          .slice(0, -1)
          .reduce(
            (sum, p) => sum + Math.round((numAmount * (percentages[p.id] || 0)) / 100 * 100) / 100,
            0
          );
        return Math.round((numAmount - othersTotal) * 100) / 100;
      }
      return Math.round((numAmount * (percentages[personId] || 0)) / 100 * 100) / 100;
    }
    if (splitMethod === 'exact') {
      return exactAmounts[personId] || 0;
    }
    return people.length > 0 ? numAmount / people.length : 0;
  };

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
    const items = people.map((p, i) => ({
      id: `item-${p.id}`,
      name: `${p.name}'s share`,
      price: getPersonAmount(p.id, i),
    }));
    dummyBillData = {
      items,
      subtotal: numAmount,
      tax: 0,
      tip: 0,
      total: numAmount,
    };
    dummyItemAssignments = {};
    people.forEach((p) => {
      dummyItemAssignments[`item-${p.id}`] = [p.id];
    });
  }

  const personTotals: PersonTotal[] = people.map((p, i) => {
    const personAmount = getPersonAmount(p.id, i);
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

  const scheduleSummary = formatScheduleSummary(frequency, dayOfWeek, dayOfMonth, startDate, endDate);
  const nextDates = getNextBillDates(frequency, dayOfWeek, dayOfMonth, startDate, 3);

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
          {nextDates.map((date, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-foreground">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              {date}
            </div>
          ))}
        </div>
      </div>

      {finalPersonTotals.length > 1 && (
        <SplitDonutChart personTotals={finalPersonTotals} total={numAmount} />
      )}

      <div className="w-full">
        <SplitSummary
          personTotals={finalPersonTotals}
          allItemsAssigned={true}
          people={people}
          billData={finalBillData}
          itemAssignments={finalItemAssignments}
          paidById={paidById}
          ownerId={user?.uid}
        />
      </div>

      {isSaving && (
        <div className="flex flex-col items-center justify-center gap-2 p-4 text-muted-foreground mt-4 py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-sm font-medium animate-pulse">Creating recurring bill...</p>
        </div>
      )}

      {/* Desktop only: StepFooter */}
      <div className="hidden md:block">
        <StepFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onPrev}
          onComplete={onComplete}
          completeLabel="Create"
        />
      </div>
    </div>
  );
}
