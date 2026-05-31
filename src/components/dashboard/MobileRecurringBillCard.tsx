import { RecurringBill, RecurringGeneratedType } from '@/types/recurring.types';
import { formatCurrency } from '@/utils/format';
import { Repeat, Zap, Receipt, Home, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { status as statusStyles } from '@/lib/styles';

interface MobileRecurringBillCardProps {
  bill: RecurringBill;
  onView: (billId: string) => void;
  onDelete?: (bill: RecurringBill) => void;
}

const FREQUENCY_LABEL: Record<RecurringBill['schedule']['frequency'], string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
};

const TYPE_META: Record<RecurringGeneratedType, { label: string; icon: typeof Repeat }> = {
  quick: { label: 'Quick', icon: Zap },
  detailed: { label: 'Detailed', icon: Receipt },
  airbnb: { label: 'Airbnb', icon: Home },
};

const STATUS_PILL: Record<'active' | 'paused', { label: string; color: string }> = {
  active: { label: 'Active', color: statusStyles.color.settled },
  paused: { label: 'Paused', color: statusStyles.color.partial },
};

/**
 * MobileRecurringBillCard - A view-only list item for a recurring-bill template,
 * styled to match MobileBillCard so it sits naturally inline with regular bills.
 * Tapping the row opens the recurring bill's detail/edit page.
 */
export default function MobileRecurringBillCard({ bill, onView, onDelete }: MobileRecurringBillCardProps) {
  const pill = bill.status === 'paused' ? STATUS_PILL.paused : STATUS_PILL.active;
  const typeMeta = TYPE_META[bill.generatedType ?? 'quick'];
  const subtitle = `${formatCurrency(bill.amount)} • ${typeMeta.label} • ${FREQUENCY_LABEL[bill.schedule.frequency]}`;

  const handleRowClick = () => onView(bill.id);

  const handleDeleteClick = (e: React.MouseEvent) => {
    // Don't let the delete click open the detail page.
    e.stopPropagation();
    onDelete?.(bill);
  };

  return (
    <div
      className="flex items-center justify-between h-[72px] px-3 glass-card rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleRowClick()}
    >
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm bg-success/10 text-success">
          <typeMeta.icon className="w-6 h-6" />
        </div>

        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {bill.title}
            </span>
            <span className={`${statusStyles.pill} bg-success/10 text-success`} title="Recurring">
              <Repeat className="w-3 h-3" />
            </span>
            <span className={`${statusStyles.pill} ${pill.color}`}>
              {pill.label}
            </span>
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {subtitle}
          </span>
        </div>
      </div>

      {/* Right section: Actions */}
      {onDelete && (
        <div className="flex items-center gap-1 shrink-0">
          <Button
            onClick={handleDeleteClick}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label={`Delete recurring bill ${bill.title}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
