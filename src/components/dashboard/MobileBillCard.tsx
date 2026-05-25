import { Bill } from '@/types/bill.types';
import { formatCurrency } from '@/utils/format';
import { getSettlementStatus, getSettlementStatusForUser } from '@/utils/billCalculations';
import { Loader2, Trash2, Zap, Home, Receipt, Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { status as statusStyles } from '@/lib/styles';

/**
 * Props interface for MobileBillCard
 * 
 * REACT CONCEPT: Props Interface
 * --------------------------------
 * In React + TypeScript, we define an interface to type-check the props
 * passed to our component. This gives us:
 * 1. Autocomplete when using the component
 * 2. Compile-time errors if we forget a required prop
 * 3. Self-documenting code - anyone reading knows exactly what data flows in
 */
interface MobileBillCardProps {
  bill: Bill;
  isLatest: boolean;
  onView: (billId: string) => void;
  onResume: (billId: string) => Promise<void>;
  onDelete: (bill: Bill) => void;
  isResuming: boolean;
  isDeleting: boolean;
  formatDate: (timestamp: { toDate: () => Date } | null | undefined) => string;
  getBillTitle: (bill: Bill) => string;
  isOwner?: boolean;
  currentUserId?: string;
}

/**
 * MobileBillCard - A compact, DoorDash-inspired list item for mobile viewports
 */
export default function MobileBillCard({
  bill,
  isLatest,
  onView,
  onResume,
  onDelete,
  isResuming,
  isDeleting,
  formatDate,
  getBillTitle,
  isOwner = true,
  currentUserId
}: MobileBillCardProps) {
  // Build the consolidated info line: "$XX.XX • X items • X people"
  const itemCount = bill.billData?.items?.length || 0;
  const peopleCount = bill.people?.length || 0;
  const total = formatCurrency(bill.billData?.total || 0);

  // Build the item names preview (first few items, comma-separated)
  const itemNames = bill.billData?.items
    ?.slice(0, 3)
    .map(item => item.name)
    .join(' • ') || '';
  const hasMoreItems = itemCount > 3;

  const billStatus = currentUserId ? getSettlementStatusForUser(bill, currentUserId) : getSettlementStatus(bill);

  const handleRowClick = () => {
    if (isLatest) {
      onView(bill.id);
    } else {
      onResume(bill.id);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    // Stop the click from bubbling up to the row
    e.stopPropagation();
    onDelete(bill);
  };

  return (
    <div
      className="flex items-center justify-between h-[72px] px-3 glass-card rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleRowClick()}
    >
      {/* Left section: Content */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${
          bill.isSimpleTransaction ? "bg-warning/10 text-warning" :
          bill.isAirbnb ? "bg-destructive/10 text-destructive" :
          "bg-info/10 text-info"
        }`}>
          {bill.isSimpleTransaction ? (
            <Zap className="w-6 h-6" />
          ) : bill.isAirbnb ? (
            <Home className="w-6 h-6" />
          ) : (
            <Receipt className="w-6 h-6" />
          )}
        </div>

        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {getBillTitle(bill)}
            </span>
            {isLatest && (
              <span className={`${statusStyles.pill} bg-primary text-primary-foreground`}>
                Latest
              </span>
            )}
            {bill.recurringBillId && (
              <span className={`${statusStyles.pill} bg-emerald-500/10 text-emerald-600`}>
                <Repeat className="w-3 h-3" />
              </span>
            )}
            <span className={`${statusStyles.pill} ${bill.status === 'draft' ? statusStyles.color.draft : statusStyles.color[billStatus]}`}>
              {bill.status === 'draft' ? statusStyles.label.draft : statusStyles.label[billStatus]}
            </span>
          </div>
          <span className="text-xs text-muted-foreground truncate">
            {total}
          </span>
        </div>
      </div>

      {/* Right section: Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isOwner && (
          <Button
            onClick={handleDeleteClick}
            disabled={isDeleting}
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
