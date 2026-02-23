import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { settlementService } from '@/services/settlementService';
import { friendBalanceService } from '@/services/friendBalanceService';
import { eventLedgerService } from '@/services/eventLedgerService';
import { billService } from '@/services/billService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { VenmoChargeDialog } from '@/components/venmo/VenmoChargeDialog';
import { VenmoCharge } from '@/types';

interface SettleUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  targetVenmoId?: string | null;
  isPaying: boolean;
  recommendedAmount: number;
  eventId?: string; // If provided, settles event balance, otherwise global
  eventName?: string;
  onSuccess?: () => void;
}

export function SettleUpModal({
  open,
  onOpenChange,
  targetUserId,
  targetUserName,
  targetVenmoId,
  isPaying,
  recommendedAmount,
  eventId,
  eventName,
  onSuccess
}: SettleUpModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [venmoDialogOpen, setVenmoDialogOpen] = useState(false);
  const [currentCharge, setCurrentCharge] = useState<VenmoCharge | null>(null);

  // Auto-fill amount when dialog opens
  useEffect(() => {
    if (open) {
      setAmount(recommendedAmount > 0 ? recommendedAmount.toFixed(2) : '');
    }
  }, [open, recommendedAmount]);

  const handleSettleUp = async () => {
    if (!user) return;
    const settleAmt = parseFloat(amount);

    if (isNaN(settleAmt) || settleAmt <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid amount greater than 0',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const fromUserId = isPaying ? user.uid : targetUserId;
      const toUserId = isPaying ? targetUserId : user.uid;

      // Create the settlement record (this is just the historical log, it has no math impact)
      await settlementService.createSettlement(
        fromUserId,
        toUserId,
        settleAmt,
        eventId
      );

      // 1. Mark underlying bills as settled sequentially.
      // Since marking a bill as settled intrinsically zeroes out its debt footprint
      // in the mathematical ledger, doing this automatically reduces the global debt.
      const remainingAmt = await billService.markBillsAsSettledForUser(fromUserId, toUserId, settleAmt, eventId);

      // 2. If there's any remaining amount (a partial payment or overpayment that didn't clear a full bill),
      // we must mathematically apply it to the ledger ourselves.
      if (remainingAmt > 0) {
        if (eventId) {
          await eventLedgerService.applySettlement(eventId, fromUserId, toUserId, remainingAmt);
        } else {
          await friendBalanceService.applySettlement(fromUserId, toUserId, remainingAmt);
        }
      }

      toast({
        title: 'Settled up!',
        description: `You paid ${targetUserName} $${settleAmt.toFixed(2)}.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Error settling up:', error);
      toast({
        title: 'Error',
        description: 'Failed to process settlement. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVenmoClick = () => {
    const settleAmt = parseFloat(amount);
    if (isNaN(settleAmt) || settleAmt <= 0) {
      toast({
        title: 'Invalid amount',
        description: 'Please enter a valid amount greater than 0',
        variant: 'destructive'
      });
      return;
    }

    let note = 'Settle up';
    if (eventName) {
      note = `Settling up for ${eventName}`;
    } else if (eventId) {
      note = 'Event settlement';
    }

    const charge: VenmoCharge = {
      recipientId: targetVenmoId || '',
      recipientName: targetUserName,
      amount: settleAmt,
      note,
      type: isPaying ? 'pay' : 'charge'
    };
    setCurrentCharge(charge);
    setVenmoDialogOpen(true);
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isPaying ? 'Pay' : 'Receive Payment'}</DialogTitle>
          <DialogDescription>
            {isPaying
              ? `Record a payment you made to ${targetUserName}`
              : `Record a payment you received from ${targetUserName}`}
            {eventId ? ' for this event' : ''}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center space-x-2 py-4">
          <div className="grid flex-1 gap-2">
            <Label htmlFor="amount" className="sr-only">
              Amount
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground">$</span>
              <Input
                id="amount"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                className="pl-7 text-lg h-12"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-end flex-col sm:flex-row gap-2 mt-4">
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={handleVenmoClick}
            disabled={isSubmitting || !amount}
          >
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.384 4.616c.616.952.933 2.064.933 3.432 0 4.284-3.636 9.816-6.612 13.248H6.864L4.8 4.728l6.12-.576 1.176 13.488c1.44-2.304 3.576-6.144 3.576-8.688 0-1.176-.24-2.064-.696-2.832l4.608-1.504z" />
            </svg>
            {isPaying ? 'Pay on Venmo' : 'Charge on Venmo'}
          </Button>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleSettleUp}
            disabled={isSubmitting || !amount}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Record Cash Payment
          </Button>
        </DialogFooter>
      </DialogContent>
      <VenmoChargeDialog
        charge={currentCharge}
        open={venmoDialogOpen}
        onOpenChange={setVenmoDialogOpen}
      />
    </Dialog>
  );
}
