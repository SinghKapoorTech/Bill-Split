import { Bill } from '@/types/bill.types';
import { formatCurrency } from '@/utils/format';
import { ChevronRight, Loader2, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  formatDate: (timestamp: any) => string;
  getBillTitle: (bill: Bill) => string;
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
  getBillTitle
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
      className="mobile-bill-item flex items-center gap-3 cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && handleRowClick()}
    >
      {/* Left section: Content */}
      <div className="flex-1 min-w-0 py-3">
        {/* Row 1: Title + Latest badge */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-foreground truncate">
            {getBillTitle(bill)}
          </span>
          {isLatest && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary text-primary-foreground shrink-0">
              Latest
            </span>
          )}
        </div>

        {/* Row 2: Consolidated meta line - DoorDash style */}
        <div className="mobile-bill-meta flex items-center gap-1 text-muted-foreground">
          <span>{total}</span>
          <span>•</span>
          <span>{itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
          <span>•</span>
          <span>{peopleCount} {peopleCount === 1 ? 'person' : 'people'}</span>
        </div>

        {/* Row 3: Item names preview (if any items exist) */}
        {itemNames && (
          <div className="mobile-bill-items-preview mt-1 truncate text-muted-foreground">
            {itemNames}{hasMoreItems && ' ...'}
          </div>
        )}
      </div>

      {/* Right section: Actions */}
      <div className="flex items-center gap-1 shrink-0">
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
        
        <ChevronRight className="w-5 h-5 text-muted-foreground" />
      </div>
    </div>
  );
}
