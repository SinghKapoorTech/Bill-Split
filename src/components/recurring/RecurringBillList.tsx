import { RecurringBill } from '@/types/recurring.types';
import { Button } from '@/components/ui/button';
import { Trash2, Pause, Play, Pencil, DollarSign, Users, Calendar } from 'lucide-react';
import { status as statusStyles } from '@/lib/styles';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface RecurringBillListProps {
  bills: RecurringBill[];
  onDelete: (bill: RecurringBill) => void;
  onTogglePause: (bill: RecurringBill) => void;
  onEdit: (bill: RecurringBill) => void;
}

function formatFrequency(bill: RecurringBill): string {
  const { frequency, dayOfWeek, dayOfMonth } = bill.schedule;
  if (frequency === 'weekly') return `Weekly on ${DAYS_OF_WEEK[dayOfWeek ?? 0]}`;
  if (frequency === 'biweekly') return `Biweekly on ${DAYS_OF_WEEK[dayOfWeek ?? 0]}`;
  const day = dayOfMonth ?? 1;
  const suffix = day === 1 || day === 21 || day === 31 ? 'st'
    : day === 2 || day === 22 ? 'nd'
    : day === 3 || day === 23 ? 'rd' : 'th';
  return `Monthly on the ${day}${suffix}`;
}

function formatNextDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function StatusBadge({ status }: { status: RecurringBill['status'] }) {
  const colorMap = {
    active: statusStyles.color.settled,
    paused: statusStyles.color.partial,
    completed: statusStyles.color.draft,
  };
  const labelMap = {
    active: 'Active',
    paused: 'Paused',
    completed: 'Done',
  };

  return (
    <span className={`${statusStyles.pill} ${colorMap[status]}`}>
      {labelMap[status]}
    </span>
  );
}

export function RecurringBillList({ bills, onDelete, onTogglePause, onEdit }: RecurringBillListProps) {
  return (
    <div className="space-y-3">
      {bills.map((bill) => (
        <RecurringBillRow
          key={bill.id}
          bill={bill}
          onDelete={() => onDelete(bill)}
          onTogglePause={() => onTogglePause(bill)}
          onEdit={() => onEdit(bill)}
        />
      ))}
    </div>
  );
}

interface RecurringBillRowProps {
  bill: RecurringBill;
  onDelete: () => void;
  onTogglePause: () => void;
  onEdit: () => void;
}

function RecurringBillRow({ bill, onDelete, onTogglePause, onEdit }: RecurringBillRowProps) {
  const peopleNames = bill.people.slice(0, 3).map(p => p.name);
  const hiddenCount = bill.people.length - peopleNames.length;
  if (hiddenCount > 0) peopleNames.push(`+${hiddenCount}`);

  return (
    <div className="flex items-center justify-between bg-secondary/30 rounded-lg border border-border p-3 md:p-4 hover:bg-secondary/50 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="font-medium truncate">{bill.title}</p>
          <StatusBadge status={bill.status} />
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            {bill.amount.toFixed(2)}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {peopleNames.join(', ')}
          </span>
        </div>

        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
          <Calendar className="w-3 h-3" />
          <span>{formatFrequency(bill)}</span>
          {bill.status === 'active' && (
            <span className="text-success"> &middot; Next: {formatNextDate(bill.nextRunDate)}</span>
          )}
        </div>

        {bill.generatedBillIds.length > 0 && (
          <p className="text-[11px] text-muted-foreground/70 mt-1">
            {bill.generatedBillIds.length} bill{bill.generatedBillIds.length !== 1 ? 's' : ''} generated
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 ml-2 shrink-0">
        {bill.status !== 'completed' && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-8 w-8"
            onClick={(e) => { e.stopPropagation(); onTogglePause(); }}
            aria-label={bill.status === 'active' ? `Pause ${bill.title}` : `Resume ${bill.title}`}
          >
            {bill.status === 'active' ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-foreground h-8 w-8"
          onClick={(e) => { e.stopPropagation(); onEdit(); }}
          aria-label={`Edit ${bill.title}`}
        >
          <Pencil className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-8 w-8"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete ${bill.title}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
