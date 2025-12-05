import { Bill } from '@/types/bill.types';
import { formatCurrency } from '@/utils/format';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Receipt,
  DollarSign,
  Loader2,
  Trash2,
  Play,
  ShoppingBag
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
  getBillTitle
}: DesktopBillCardProps) {
  return (
    <Card
      className={`desktop-bill-card hover:shadow-lg transition-all ${
        isLatest ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3 mb-2">
          {bill.receiptImageUrl ? (
            <img
              src={bill.receiptImageUrl}
              alt="Receipt"
              className="w-12 h-12 object-cover rounded-md"
            />
          ) : (
            <div className="w-12 h-12 bg-muted rounded-md flex items-center justify-center">
              <Receipt className="w-6 h-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg truncate">
                {getBillTitle(bill)}
              </CardTitle>
              {isLatest && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                  Latest
                </span>
              )}
            </div>
            <CardDescription className="text-xs">
              {formatDate(bill.savedAt || bill.createdAt)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 mb-4">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <DollarSign className="w-3 h-3" />
              Total
            </span>
            <span className="font-semibold">
              {formatCurrency(bill.billData?.total || 0)}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <ShoppingBag className="w-3 h-3" />
              Items
            </span>
            <span>{bill.billData?.items?.length || 0}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Receipt className="w-3 h-3" />
              People
            </span>
            <span>{bill.people?.length || 0}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {isLatest ? (
            <Button
              onClick={() => onView(bill.id)}
              className="flex-1 gap-1"
              size="sm"
            >
              <Play className="w-3 h-3" />
              Continue
            </Button>
          ) : (
            <Button
              onClick={() => onResume(bill.id)}
              disabled={isResuming}
              className="flex-1 gap-1"
              size="sm"
              variant="outline"
            >
              {isResuming ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Resume
            </Button>
          )}
          <Button
            onClick={() => onDelete(bill)}
            disabled={isDeleting}
            variant="destructive"
            size="sm"
            className="gap-1"
          >
            {isDeleting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Trash2 className="w-3 h-3" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
