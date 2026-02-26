import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { settlementService } from '@/services/settlementService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Banknote } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  eventId?: string;
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
      const toUserId   = isPaying ? targetUserId : user.uid;

      // Single Cloud Function call — atomically handles all bill marking,
      // friend ledger, event ledger, and settlement record in one transaction.
      await settlementService.requestSettlement(fromUserId, toUserId, settleAmt, eventId);

      toast({
        title: isPaying ? 'Payment recorded!' : 'Cash received!',
        description: isPaying
          ? `Your payment of $${settleAmt.toFixed(2)} to ${targetUserName} has been recorded.`
          : `You confirmed receiving $${settleAmt.toFixed(2)} from ${targetUserName}.`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error settling up:', error);
      // Firebase HttpsError surfaces a user-friendly message
      const msg = error?.message ?? 'Failed to process settlement. Please try again.';
      toast({
        title: 'Settlement failed',
        description: msg,
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

  const myName = user?.displayName?.split(' ')[0] || 'You';
  const fromName = isPaying ? myName : targetUserName.split(' ')[0];
  const toName = isPaying ? targetUserName.split(' ')[0] : myName;
  const fromInitials = fromName.substring(0, 2).toUpperCase();
  const toInitials = toName.substring(0, 2).toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        {/* Header strip */}
        <div className={`px-6 pt-6 pb-4 ${isPaying ? 'bg-destructive/5' : 'bg-green-500/5'}`}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">
            {isPaying ? 'Send Payment' : 'Receive Payment'}
          </p>

          {/* Avatar flow */}
          <div className="flex items-center justify-center gap-3 mb-5">
            <div className="flex flex-col items-center gap-1">
              <Avatar className={`w-12 h-12 border-2 ${isPaying ? 'border-destructive/30' : 'border-muted'}`}>
                <AvatarFallback className={`text-sm font-semibold ${isPaying ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                  {fromInitials}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">{fromName}</span>
            </div>
            <div className="flex flex-col items-center pb-4">
              <ArrowRight className={`w-5 h-5 ${isPaying ? 'text-destructive' : 'text-green-600'}`} />
            </div>
            <div className="flex flex-col items-center gap-1">
              <Avatar className={`w-12 h-12 border-2 ${!isPaying ? 'border-green-500/30' : 'border-muted'}`}>
                <AvatarFallback className={`text-sm font-semibold ${!isPaying ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'}`}>
                  {toInitials}
                </AvatarFallback>
              </Avatar>
              <span className="text-xs text-muted-foreground">{toName}</span>
            </div>
          </div>

          {/* Amount Input */}
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">$</span>
            <Input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              className="pl-9 text-3xl font-bold h-16 text-center tracking-tight border-0 bg-background/80 rounded-xl focus-visible:ring-1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {eventName && (
            <p className="text-center text-xs text-muted-foreground mt-2">For · {eventName}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-4 pb-4 pt-3 flex flex-col gap-2">
          {/* Venmo button */}
          <Button
            type="button"
            className="w-full h-12 text-sm font-semibold rounded-xl bg-[#3D95CE] hover:bg-[#3587bb] text-white"
            onClick={handleVenmoClick}
            disabled={isSubmitting || !amount}
          >
            <svg className="w-4 h-4 mr-2 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.384 4.616c.616.952.933 2.064.933 3.432 0 4.284-3.636 9.816-6.612 13.248H6.864L4.8 4.728l6.12-.576 1.176 13.488c1.44-2.304 3.576-6.144 3.576-8.688 0-1.176-.24-2.064-.696-2.832l4.608-1.504z" />
            </svg>
            {isPaying ? 'Pay with Venmo' : 'Charge on Venmo'}
          </Button>

          {/* Record settlement button */}
          <Button
            type="button"
            variant="outline"
            className="w-full h-12 text-sm rounded-xl"
            onClick={handleSettleUp}
            disabled={isSubmitting || !amount}
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Banknote className="w-4 h-4 mr-2" />
            )}
            {isPaying ? 'Mark as Paid' : 'Mark Cash Received'}
          </Button>

          <Button
            type="button"
            variant="ghost"
            className="w-full text-xs text-muted-foreground"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
        </div>
      </DialogContent>
      <VenmoChargeDialog
        charge={currentCharge}
        open={venmoDialogOpen}
        onOpenChange={setVenmoDialogOpen}
      />
    </Dialog>
  );
}
