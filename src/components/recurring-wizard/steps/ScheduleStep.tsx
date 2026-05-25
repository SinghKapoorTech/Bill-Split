import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { StepFooter } from '@/components/shared/StepFooter';
import { RecurringFrequency } from '@/types/recurring.types';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FREQUENCY_OPTIONS: { value: RecurringFrequency; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
];

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
  return (
    <div className="flex flex-col gap-6 p-4 max-w-md mx-auto mt-4">
      {/* Frequency Picker */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">How often?</Label>
        <div className="grid grid-cols-3 gap-2">
          {FREQUENCY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFrequency(opt.value)}
              className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border ${
                frequency === opt.value
                  ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                  : 'bg-card border-border hover:bg-muted/50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Day Selector */}
      {(frequency === 'weekly' || frequency === 'biweekly') && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">On which day?</Label>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS_OF_WEEK.map((day, i) => (
              <button
                key={day}
                type="button"
                onClick={() => setDayOfWeek(i)}
                className={`w-11 h-11 rounded-full text-xs font-medium transition-all border ${
                  dayOfWeek === i
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-card border-border hover:bg-muted/50'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {frequency === 'monthly' && (
        <div className="space-y-2">
          <Label htmlFor="dayOfMonth" className="text-sm font-medium">Day of month</Label>
          <Input
            id="dayOfMonth"
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => {
              const val = Math.min(31, Math.max(1, parseInt(e.target.value) || 1));
              setDayOfMonth(val);
            }}
            className="h-14 text-lg font-medium max-w-[120px]"
          />
        </div>
      )}

      {/* Start Date */}
      <div className="space-y-2">
        <Label htmlFor="startDate" className="text-sm font-medium">Start date</Label>
        <Input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="h-14 text-base font-medium"
        />
      </div>

      {/* End Date (optional) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="endDateToggle" className="text-sm font-medium">Set an end date</Label>
          <Switch
            id="endDateToggle"
            checked={hasEndDate}
            onCheckedChange={setHasEndDate}
          />
        </div>
        {hasEndDate && (
          <Input
            id="endDate"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-14 text-base font-medium"
          />
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
