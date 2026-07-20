import { CalendarDays } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { StepFooter } from '@/components/shared/StepFooter';
import { RecurringFrequency } from '@/types/recurring.types';
import { scheduleHasOccurrences } from '@/utils/scheduleFormat';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

/**
 * Shared styling for the selectable chips (frequency, weekday).
 *
 * `min-h-[44px]` rather than a square. Horizontal room is tighter than it
 * looks: Layout's `container` takes 2rem each side (64px) before this step's
 * own `p-4` (32px). At 360px that leaves 264px for the 7-column weekday grid,
 * so a cell is ~33px wide (~27px at 320px) — a square cell would be far below
 * any touch-target floor. Fixing the HEIGHT at 44px keeps the target
 * comfortable in one axis while `grid-cols-7` guarantees the row never wraps.
 */
const CHIP_BASE =
  'min-h-[44px] flex items-center justify-center rounded-xl border text-sm font-medium ' +
  'transition-colors motion-reduce:transition-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
  'ring-offset-background';
const CHIP_ON = 'bg-primary text-primary-foreground border-primary shadow-sm';
const CHIP_OFF = 'bg-card border-border text-foreground hover:bg-muted/50';

interface ScheduleStepProps {
  frequency: RecurringFrequency;
  setFrequency: (f: RecurringFrequency) => void;
  dayOfWeek: number;
  setDayOfWeek: (d: number) => void;
  dayOfMonth: number;
  setDayOfMonth: (d: number) => void;
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  hasEndDate: boolean;
  setHasEndDate: (v: boolean) => void;
  // Navigation
  onNext: () => void;
  onPrev: () => void;
  canProceed: boolean;
  currentStep: number;
  totalSteps: number;
}

export function ScheduleStep({
  frequency,
  setFrequency,
  dayOfWeek,
  setDayOfWeek,
  dayOfMonth,
  setDayOfMonth,
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  hasEndDate,
  setHasEndDate,
  onNext,
  onPrev,
  canProceed,
  currentStep,
  totalSteps,
}: ScheduleStepProps) {
  // An end date before the first aligned occurrence yields a template that can
  // never fire. Surface it here rather than only disabling Next with no reason.
  const generatesNothing =
    !!startDate &&
    hasEndDate &&
    !!endDate &&
    !scheduleHasOccurrences({ frequency, dayOfWeek, dayOfMonth, startDate, endDate });

  return (
    <div className="flex flex-col gap-4 md:gap-6 px-4 pt-1 pb-4 max-w-md mx-auto w-full">
      <div className="text-center space-y-0.5">
        <h2 className="text-lg md:text-xl font-bold">When should it repeat?</h2>
        <p className="text-xs md:text-sm text-muted-foreground">
          We&rsquo;ll create the bill for you on each date.
        </p>
      </div>

      {/* Frequency */}
      <div className="space-y-2">
        <Label id="frequency-label" className="text-sm font-medium">
          Repeats
        </Label>
        <div role="group" aria-labelledby="frequency-label" className="grid grid-cols-3 gap-2">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={frequency === opt.value}
              onClick={() => setFrequency(opt.value)}
              className={`${CHIP_BASE} px-2 ${frequency === opt.value ? CHIP_ON : CHIP_OFF}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Weekday — a 7-column grid so the row can never wrap onto a second line */}
      {(frequency === 'weekly' || frequency === 'biweekly') && (
        <div className="space-y-2">
          <Label id="weekday-label" className="text-sm font-medium">
            Repeats on
          </Label>
          <div role="group" aria-labelledby="weekday-label" className="grid grid-cols-7 gap-1.5">
            {DAYS_OF_WEEK.map((day, i) => (
              <button
                key={day}
                type="button"
                aria-pressed={dayOfWeek === i}
                aria-label={day}
                onClick={() => setDayOfWeek(i)}
                className={`${CHIP_BASE} px-0 text-xs ${dayOfWeek === i ? CHIP_ON : CHIP_OFF}`}
              >
                {day.slice(0, 2)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day of month — a single field. `inputMode="numeric"` brings up the
          number pad on mobile; the value is clamped to 1-31 on change. */}
      {frequency === 'monthly' && (
        <div className="space-y-2">
          <Label htmlFor="dayOfMonth" className="text-sm font-medium">
            Day of month
          </Label>
          <Input
            id="dayOfMonth"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => {
              const parsed = parseInt(e.target.value, 10);
              setDayOfMonth(Math.min(31, Math.max(1, Number.isNaN(parsed) ? 1 : parsed)));
            }}
            className="h-14 max-w-[140px] text-lg font-medium"
          />
          {dayOfMonth > 28 && (
            <p className="text-xs text-muted-foreground">
              Shorter months use their last day.
            </p>
          )}
        </div>
      )}

      {/* Dates */}
      <div className="space-y-2">
        <Label htmlFor="startDate" className="text-sm font-medium">
          Starts
        </Label>
        <div className="relative">
          <CalendarDays
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="date-input h-14 text-base font-medium"
          />
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="endDateToggle" className="text-sm font-medium">
            Ends
          </Label>
          <Switch id="endDateToggle" checked={hasEndDate} onCheckedChange={setHasEndDate} />
        </div>
        {hasEndDate && (
          <div className="space-y-2">
            <Label htmlFor="endDate" className="sr-only">
              End date
            </Label>
            <div className="relative">
              <CalendarDays
                aria-hidden="true"
                className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="endDate"
                type="date"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-invalid={generatesNothing}
                aria-describedby={generatesNothing ? 'endDate-error' : undefined}
                className="date-input h-14 text-base font-medium"
              />
            </div>
            {generatesNothing && (
              <p id="endDate-error" className="text-xs text-destructive">
                This ends before the first bill. Pick a later end date.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Desktop only: StepFooter */}
      <div className="hidden md:block">
        <StepFooter
          currentStep={currentStep}
          totalSteps={totalSteps}
          onBack={onPrev}
          onNext={onNext}
          nextDisabled={!canProceed}
        />
      </div>
    </div>
  );
}
