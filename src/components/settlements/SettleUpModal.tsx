import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { settlementService } from '@/services/settlementService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ArrowRight, Banknote, ExternalLink, Clock, Check, X } from 'lucide-react';
import { VenmoChargeDialog } from '@/components/venmo/VenmoChargeDialog';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { VenmoCharge } from '@/types';
import { userService } from '@/services/userService';
import { SuccessCelebration } from '@/components/shared/SuccessCelebration';
import { settlementRequestService } from '@/services/settlementRequestService';
import { useSettlementRequests } from '@/hooks/useSettlementRequests';

export interface SettleTarget {
  userId: string;
  name: string;
  amount: number;
  isPaying: boolean;
  photoURL?: string;
}

interface SettleUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUserId: string;
  targetUserName: string;
  isPaying: boolean;
  balanceAmount: number;
  eventId?: string;
  targetUserPhotoURL?: string;
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
  targetUserPhotoURL,
  onSuccess
}: SettleUpModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { getOutgoingRequestForUser, getIncomingRequestFromUser } = useSettlementRequests();
  const pendingOutgoing = getOutgoingRequestForUser(targetUserId, eventId);
  const pendingIncoming = getIncomingRequestFromUser(targetUserId, eventId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);
  const [venmoCharge, setVenmoCharge] = useState<VenmoCharge | null>(null);
  const [venmoDialogOpen, setVenmoDialogOpen] = useState(false);
  // Celebration state: hide dialog visually but keep component mounted
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationAmount, setCelebrationAmount] = useState(0);
  const [dialogVisible, setDialogVisible] = useState(true);

  const handleSettleUp = async () => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      if (isPaying) {
        // Debtor path: create a settlement request
        await settlementRequestService.createRequest(
          user.uid,
          targetUserId,
          balanceAmount,
          eventId
        );
        toast({
          title: 'Settlement request sent',
          description: `${targetUserName} will be notified to approve.`,
        });
        onOpenChange(false);
        onSuccess?.();
      } else {
        // Creditor path: settle instantly (existing flow)
        const result = eventId
          ? await settlementService.requestEventSettlement(eventId, targetUserId)
          : await settlementService.requestSettlement(targetUserId);

        // Auto-approve any pending request from the other side
        await settlementRequestService.autoApproveIfPending(user.uid, targetUserId, eventId).catch(() => {});

        if (result.billsSettled === 0) {
          toast({
            title: 'Nothing to settle',
            description: `No outstanding bills with ${targetUserName}.`,
          });
          onOpenChange(false);
        } else {
          setCelebrationAmount(result.amountSettled);
          setDialogVisible(false);
          setShowCelebration(true);
        }
      }
    } catch (error: unknown) {
      console.error('Error settling up:', error);
      const msg = (error as Error)?.message ?? 'Failed to process. Please try again.';
      toast({
        title: isPaying ? 'Request failed' : 'Settlement failed',
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprove = async () => {
    if (!pendingIncoming || !user) return;
    setIsApproving(true);
    try {
      await settlementRequestService.approveRequest(pendingIncoming.id);
      const result = eventId
        ? await settlementService.requestEventSettlement(eventId, targetUserId)
        : await settlementService.requestSettlement(targetUserId);

      if (result.billsSettled === 0) {
        toast({ title: 'Nothing to settle', description: `No outstanding bills with ${targetUserName}.` });
        onOpenChange(false);
      } else {
        setCelebrationAmount(result.amountSettled);
        setDialogVisible(false);
        setShowCelebration(true);
      }
    } catch (error: unknown) {
      toast({ title: 'Approval failed', description: (error as Error)?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setIsApproving(false);
    }
  };

  const handleDecline = async () => {
    if (!pendingIncoming) return;
    setIsDeclining(true);
    try {
      await settlementRequestService.declineRequest(pendingIncoming.id);
      toast({ title: 'Request declined' });
      onOpenChange(false);
    } catch (error: unknown) {
      toast({ title: 'Decline failed', description: (error as Error)?.message ?? 'Please try again.', variant: 'destructive' });
    } finally {
      setIsDeclining(false);
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

  const handleCelebrationComplete = useCallback(() => {
    setShowCelebration(false);
    setDialogVisible(true);
    onOpenChange(false);
    onSuccess?.();
  }, [onSuccess, onOpenChange]);

  const myName = user?.displayName?.split(' ')[0] || 'You';
  const fromName = isPaying ? myName : targetUserName.split(' ')[0];
  const toName = isPaying ? targetUserName.split(' ')[0] : myName;
  const myPhotoURL = user?.photoURL;
  const fromPhotoURL = isPaying ? myPhotoURL : targetUserPhotoURL;
  const toPhotoURL = isPaying ? targetUserPhotoURL : myPhotoURL;

  return (
    <>
      <Dialog open={open && dialogVisible} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}>
          {/* Header strip */}
          <div className={`px-6 pt-6 pb-4 ${isPaying ? 'bg-red-500/5' : 'bg-emerald-500/5'}`}>
            <DialogTitle className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4 text-center">
              Settle Up
            </DialogTitle>
            <DialogDescription className="sr-only">
              Settle ${balanceAmount.toFixed(2)} with {targetUserName}
            </DialogDescription>

            {/* Avatar flow */}
            <div className="flex items-center justify-center gap-3 mb-5">
              <div className="flex flex-col items-center gap-1 w-16">
                <UserAvatar
                  name={fromName}
                  photoURL={fromPhotoURL}
                  size="lg"
                  className="w-12 h-12"
                  fallbackClassName={`text-sm font-semibold ${isPaying ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}
                />
                <span className={`text-xs font-semibold uppercase tracking-wide text-center w-full truncate ${isPaying ? 'text-red-500' : 'text-emerald-600'}`}>{fromName}</span>
              </div>
              <div className="flex flex-col items-center pb-4">
                <ArrowRight className={`w-5 h-5 ${isPaying ? 'text-red-500' : 'text-emerald-600'}`} />
              </div>
              <div className="flex flex-col items-center gap-1 w-16">
                <UserAvatar
                  name={toName}
                  photoURL={toPhotoURL}
                  size="lg"
                  className="w-12 h-12"
                  fallbackClassName={`text-sm font-semibold ${isPaying ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-600'}`}
                />
                <span className={`text-xs font-semibold uppercase tracking-wide text-center w-full truncate ${isPaying ? 'text-red-500' : 'text-emerald-600'}`}>{toName}</span>
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

            {pendingOutgoing ? (
              /* Debtor: already requested → disabled */
              <Button
                type="button"
                className="w-full h-12 text-sm font-semibold rounded-xl"
                disabled
              >
                <Clock className="w-4 h-4 mr-2" />
                Settlement Requested
              </Button>
            ) : pendingIncoming ? (
              /* Creditor: incoming request → approve / decline */
              <div className="flex gap-2">
                <Button
                  type="button"
                  className="flex-1 h-12 text-sm font-semibold rounded-xl bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleApprove}
                  disabled={isApproving || isDeclining}
                >
                  {isApproving ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Check className="w-4 h-4 mr-2" />
                  )}
                  Approve
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-12 text-sm font-semibold rounded-xl border-destructive text-destructive hover:bg-destructive/10"
                  onClick={handleDecline}
                  disabled={isApproving || isDeclining}
                >
                  {isDeclining ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <X className="w-4 h-4 mr-2" />
                  )}
                  Decline
                </Button>
              </div>
            ) : (
              /* Default */
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
                {isPaying ? 'Request Settlement' : 'Mark as Settled'}
              </Button>
            )}

          </div>
        </DialogContent>
      </Dialog>

      <VenmoChargeDialog
        charge={venmoCharge}
        open={venmoDialogOpen}
        onOpenChange={setVenmoDialogOpen}
      />

      <SuccessCelebration
        show={showCelebration}
        variant="full"
        message="All Settled!"
        subMessage={`$${celebrationAmount.toFixed(2)} with ${targetUserName}`}
        onComplete={handleCelebrationComplete}
      />
    </>
  );
}
