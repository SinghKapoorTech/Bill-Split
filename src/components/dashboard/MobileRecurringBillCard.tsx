import { RecurringBill } from '@/types/recurring.types';
import { formatCurrency } from '@/utils/format';
import { Repeat } from 'lucide-react';
import { status as statusStyles } from '@/lib/styles';

interface MobileRecurringBillCardProps {
  bill: RecurringBill;
  onView: (billId: string) => void;
}

const FREQUENCY_LABEL: Record<RecurringBill['schedule']['frequency'], string> = {
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
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
export default function MobileRecurringBillCard({ bill, onView }: MobileRecurringBillCardProps) {
  const pill = bill.status === 'paused' ? STATUS_PILL.paused : STATUS_PILL.active;
  const subtitle = `${formatCurrency(bill.amount)} • ${FREQUENCY_LABEL[bill.schedule.frequency]}`;

  const handleRowClick = () => onView(bill.id);

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
          <Repeat className="w-6 h-6" />
        </div>

        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {bill.title}
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
    </div>
  );
}
