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
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface SettleUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  recommendedAmount: number;
  eventId?: string; // If provided, settles event balance, otherwise global
  onSuccess?: () => void;
}

export function SettleUpModal({
  open,
  onOpenChange,
  targetUserId,
  targetUserName,
  recommendedAmount,
  eventId,
  onSuccess
}: SettleUpModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [amount, setAmount] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      // Create the settlement record
      await settlementService.createSettlement(
        user.uid,
        targetUserId,
        settleAmt,
        eventId
      );

      // Apply the mathematical adjustment to the appropriate ledger
      if (eventId) {
        await eventLedgerService.applySettlement(eventId, user.uid, targetUserId, settleAmt);
      } else {
        await friendBalanceService.applySettlement(user.uid, targetUserId, settleAmt);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settle Up</DialogTitle>
          <DialogDescription>
            Record a payment you made to {targetUserName} 
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
        <DialogFooter className="sm:justify-between items-center flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSettleUp}
            disabled={isSubmitting || !amount}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : null}
            Pay {targetUserName}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
