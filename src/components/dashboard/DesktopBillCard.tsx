import { Bill } from '@/types/bill.types';
import { formatCurrency } from '@/utils/format';
import { getSettlementStatus } from '@/utils/billCalculations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Receipt,
  DollarSign,
  Loader2,
  Trash2,
  Play,
  ShoppingBag,
  Zap,
  Home,
  ChevronRight,
  RotateCcw
} from 'lucide-react';

interface DesktopBillCardProps {
  bill: Bill;
  isLatest: boolean;
  onView: (billId: string) => void;
  onResume: (billId: string) => Promise<void>;
  onDelete: (bill: Bill) => void;
  isResuming: boolean;
  isDeleting: boolean;
  formatDate: (timestamp: any) => string;
  getBillTitle: (bill: Bill) => string;
  isOwner?: boolean;
}

/**
 * DesktopBillCard - Card-based bill display for desktop viewports
 */
export default function DesktopBillCard({
  bill,
  isLatest,
  onView,
  onResume,
  onDelete,
  isResuming,
  isDeleting,
  formatDate,
  getBillTitle,
  isOwner = true
}: DesktopBillCardProps) {
  const status = getSettlementStatus(bill);

  const statusColors = {
    settled: 'text-emerald-700 bg-emerald-500/15 dark:text-emerald-400 dark:bg-emerald-500/10',
    partial: 'text-amber-700 bg-amber-500/15 dark:text-amber-400 dark:bg-amber-500/10',
    unsettled: 'text-rose-700 bg-rose-500/15 dark:text-rose-400 dark:bg-rose-500/10',
  };

  const statusText = {
    settled: 'Settled',
    partial: 'Partial',
    unsettled: 'Not Settled',
  };

  return (
    <Card
      className={`desktop-bill-card flex flex-col h-full bg-card border-border/50 shadow-sm hover:shadow-md hover:border-border transition-all duration-300 rounded-xl ${isLatest ? 'ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/5' : ''
        }`}
    >
      <CardHeader className="p-2 pb-1">
        <div className="flex items-start gap-2.5 mb-1">
          <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-muted/50 border border-border/50">
            {bill.isSimpleTransaction ? (
              <div className="w-full h-full bg-amber-500/10 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-500" />
              </div>
            ) : bill.isAirbnb ? (
              <div className="w-full h-full bg-rose-500/10 flex items-center justify-center">
                <Home className="w-4 h-4 text-rose-500" />
              </div>
            ) : bill.receiptImageUrl ? (
              <img
                src={bill.receiptImageUrl}
                alt="Receipt"
                className="w-full h-full object-cover"
              />
            ) : (
              <Receipt className="w-3.5 h-3.5 text-primary/70" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <CardTitle className="text-[13px] font-medium tracking-tight text-foreground truncate max-w-[140px]">
                {getBillTitle(bill)}
              </CardTitle>
              {isLatest && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase bg-primary text-primary-foreground shadow-sm">
                  Latest
                </span>
              )}
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide uppercase shrink-0 ${statusColors[status]}`}>
                {statusText[status]}
              </span>
            </div>
            <CardDescription className="text-[11px] font-medium text-muted-foreground/80 mt-0">
              {formatDate(bill.savedAt || bill.createdAt)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2 pt-0 flex flex-col flex-1 justify-end">
        <div className="space-y-1 mb-2 bg-muted/30 p-2 rounded-lg">
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <DollarSign className="w-3 h-3" />
              Total
            </span>
            <span className="font-semibold tracking-tight text-foreground/90">
              {formatCurrency(bill.billData?.total || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <ShoppingBag className="w-3 h-3" />
              Items
            </span>
            <span className="font-medium text-foreground/80">{bill.billData?.items?.length || 0}</span>
          </div>
          <div className="flex items-center justify-between text-[12px]">
            <span className="flex items-center gap-1.5 font-medium text-muted-foreground">
              <Receipt className="w-3 h-3" />
              People
            </span>
            <span className="font-medium text-foreground/80">{bill.people?.length || 0}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-border/40 mt-auto">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1 h-6 px-3 text-[10px] font-medium rounded-full bg-secondary hover:bg-secondary/80 transition-colors shadow-sm"
            onClick={isLatest ? () => onView(bill.id) : () => onResume(bill.id)}
            disabled={isResuming}
          >
            {isResuming ? (
              <Loader2 className="w-3 h-3 animate-spin mx-auto text-muted-foreground" />
            ) : (
              <span className="flex items-center justify-center gap-1.5">
                {isLatest ? (
                  <ChevronRight className="w-3 h-3 opacity-70" />
                ) : (
                  <RotateCcw className="w-3 h-3 opacity-70" />
                )}
                {isLatest ? 'View' : 'Resume'}
              </span>
            )}
          </Button>

          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              onClick={(e) => { e.stopPropagation(); onDelete(bill); }}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Trash2 className="w-3 h-3 opacity-70" />
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
