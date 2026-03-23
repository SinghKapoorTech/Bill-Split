import { Bill } from '@/types/bill.types';
import { formatCurrency } from '@/utils/format';
import { getSettlementStatus, getSettlementStatusForUser } from '@/utils/billCalculations';
import { ChevronRight, Loader2, Play, Trash2, Zap, Home, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

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

  const status = currentUserId ? getSettlementStatusForUser(bill, currentUserId) : getSettlementStatus(bill);

  const statusColors = {
    draft: 'text-slate-700 bg-slate-500/15 dark:text-slate-400 dark:bg-slate-500/10',
    settled: 'text-emerald-700 bg-emerald-500/15 dark:text-emerald-400 dark:bg-emerald-500/10',
    partial: 'text-amber-700 bg-amber-500/15 dark:text-amber-400 dark:bg-amber-500/10',
    unsettled: 'text-rose-700 bg-rose-500/15 dark:text-rose-400 dark:bg-rose-500/10',
  };

  const statusText = {
    draft: 'Draft',
    settled: 'Settled',
    partial: 'Partial',
    unsettled: 'Not Settled',
  };

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
      className="mobile-bill-item flex items-center justify-between h-[72px] px-3 glass-card rounded-xl hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleRowClick()}
    >
      {/* Left section: Content */}
      <div className="flex items-center gap-2.5 overflow-hidden">
        <Avatar className="w-8 h-8 border-2 border-background shadow-sm shrink-0">
          <AvatarFallback className={
            bill.isSimpleTransaction ? "bg-amber-100 text-amber-600" :
            bill.isAirbnb ? "bg-rose-100 text-rose-600" :
            "bg-blue-100 text-blue-600"
          }>
            {bill.isSimpleTransaction ? (
              <Zap className="w-4 h-4" />
            ) : bill.isAirbnb ? (
              <Home className="w-4 h-4" />
            ) : (
              <Receipt className="w-4 h-4" />
            )}
          </AvatarFallback>
        </Avatar>

        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {getBillTitle(bill)}
            </span>
            {isLatest && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground shrink-0">
                Latest
              </span>
            )}
            {bill.status === 'draft' ? (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${statusColors.draft}`}>
                {statusText.draft}
              </span>
            ) : (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 ${statusColors[status]}`}>
                {statusText[status]}
              </span>
            )}
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
