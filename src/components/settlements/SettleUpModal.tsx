import { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { settlementService } from '@/services/settlementService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Banknote } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

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
  onSuccess?: () => void;
}

export function SettleUpModal({
  open,
  onOpenChange,
  targetUserId,
  targetUserName,
  isPaying,
  balanceAmount,
  onSuccess
}: SettleUpModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSettleUp = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const result = await settlementService.requestSettlement(targetUserId);

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
            Settle All Bills
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
  );
}
