import { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { settlementService } from '@/services/settlementService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Banknote, ExternalLink } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { VenmoChargeDialog } from '@/components/venmo/VenmoChargeDialog';
import { VenmoCharge } from '@/types';
import { userService } from '@/services/userService';

export interface SettleTarget {
  userId: string;
  name: string;
  amount: number;
  isPaying: boolean;
}

interface SettleUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  isPaying: boolean;
  balanceAmount: number;
  eventId?: string;
  onSuccess?: () => void;
}

// Venmo SVG logo inline
function VenmoLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M19.004 1.5c.388.639.563 1.298.563 2.14 0 2.67-2.278 6.14-4.128 8.582H11.02L9.348 2.928l-4.18.401L7.225 21.5h7.154C17.25 17.477 21.5 10.71 21.5 5.698c0-1.598-.3-2.685-.883-3.616L19.004 1.5z" />
    </svg>
  );
}

export function SettleUpModal({
  open,
  onOpenChange,
  targetUserId,
  targetUserName,
  isPaying,
  balanceAmount,
  eventId,
  onSuccess
}: SettleUpModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [venmoCharge, setVenmoCharge] = useState<VenmoCharge | null>(null);
  const [venmoDialogOpen, setVenmoDialogOpen] = useState(false);

  const handleSettleUp = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const result = eventId
        ? await settlementService.requestEventSettlement(eventId, targetUserId)
        : await settlementService.requestSettlement(targetUserId);

      if (result.billsSettled === 0) {
        toast({
          title: 'Nothing to settle',
          description: `No outstanding bills with ${targetUserName}.`,
        });
      } else {
        toast({
          title: 'Settled!',
          description: `$${result.amountSettled.toFixed(2)} settled with ${targetUserName} across ${result.billsSettled} bill${result.billsSettled > 1 ? 's' : ''}.`,
        });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error('Error settling up:', error);
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

  const handleOpenVenmoDialog = async () => {
    let recipientVenmoId = '';
    try {
      const profile = await userService.getUserProfile(targetUserId);
      recipientVenmoId = profile?.venmoId?.replace(/^@+/, '') ?? '';
    } catch {
      // ignore — field will just be empty
    }

    const charge: VenmoCharge = {
      recipientId: recipientVenmoId,
      recipientName: targetUserName,
      amount: balanceAmount,
      note: `Settle up`,
      type: isPaying ? 'pay' : 'charge',
    };
    setVenmoCharge(charge);
    setVenmoDialogOpen(true);
  };

  const myName = user?.displayName?.split(' ')[0] || 'You';
  const fromName = isPaying ? myName : targetUserName.split(' ')[0];
  const toName = isPaying ? targetUserName.split(' ')[0] : myName;
  const fromInitials = fromName.substring(0, 2).toUpperCase();
  const toInitials = toName.substring(0, 2).toUpperCase();

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
          {/* Header strip */}
          <div className={`px-6 pt-6 pb-4 ${isPaying ? 'bg-destructive/5' : 'bg-green-500/5'}`}>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">
              Settle Up
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

            {/* Balance amount (informational, not editable) */}
            <div className="text-center">
              <span className="text-3xl font-bold tracking-tight">
                ${balanceAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="px-4 pb-4 pt-3 flex flex-col gap-2">
            {/* Venmo button */}
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 text-sm font-semibold rounded-xl border-[#008CFF] text-[#008CFF] hover:bg-[#008CFF]/10"
              onClick={handleOpenVenmoDialog}
            >
              <VenmoLogo className="w-4 h-4 mr-2" />
              {isPaying ? 'Pay on Venmo' : 'Charge on Venmo'}
              <ExternalLink className="w-3 h-3 ml-1.5 opacity-60" />
            </Button>

            {/* Divider */}
            <div className="flex items-center gap-2 my-0.5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <Button
              type="button"
              className="w-full h-12 text-sm font-semibold rounded-xl"
              onClick={handleSettleUp}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Banknote className="w-4 h-4 mr-2" />
              )}
              Mark as Settled
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
      </Dialog>

      <VenmoChargeDialog
        charge={venmoCharge}
        open={venmoDialogOpen}
        onOpenChange={setVenmoDialogOpen}
      />
    </>
  );
}
