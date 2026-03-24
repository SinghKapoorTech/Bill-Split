import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Receipt, Banknote, CheckCircle2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useBills } from '@/hooks/useBills';
import { userService } from '@/services/userService';
import { Bill } from '@/types/bill.types';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import DesktopBillCard from '@/components/dashboard/DesktopBillCard';
import { useBillContext } from '@/contexts/BillSessionContext';
import { getSettlementStatusForUser } from '@/utils/billCalculations';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { SettleUpModal } from '@/components/settlements/SettleUpModal';
import { useActiveBalances } from '@/hooks/useActiveBalances';
import { useSettlementRequests } from '@/hooks/useSettlementRequests';
import { settlementRequestService } from '@/services/settlementRequestService';
import { settlementService } from '@/services/settlementService';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import type { SettleTarget } from '@/components/settlements/SettleUpModal';

interface FriendNavState {
  name?: string;
  photoURL?: string;
  balance?: number;
  venmoId?: string;
}

export default function BalanceDetailView() {
  const { targetUserId, eventId } = useParams<{ targetUserId: string; eventId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { activeSession, savedSessions, isLoadingSessions } = useBills();

  const navState = location.state as FriendNavState | null;

  const [targetUserName, setTargetUserName] = useState<string>(navState?.name || 'Friend');
  const [targetUserPhoto, setTargetUserPhoto] = useState<string | undefined>(navState?.photoURL);
  const [friendBalance, setFriendBalance] = useState<number | null>(navState?.balance ?? null);
  const [showAll, setShowAll] = useState(false);
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);

  const {
    isDeleting,
    isResuming,
    deleteSession,
    resumeSession
  } = useBillContext();

  // Real-time balance updates (global context only)
  const { balances, refreshBalances, isLoading: isBalancesLoading } = useActiveBalances();
  const { toast } = useToast();
  const { getIncomingRequestFromUser } = useSettlementRequests();

  const [isProcessingRequest, setIsProcessingRequest] = useState(false);

  // Fallback: fetch profile if no nav state (direct URL access)
  useEffect(() => {
    if (!targetUserId) return;
    userService.getUserProfile(targetUserId).then(profile => {
      if (profile?.displayName) {
        setTargetUserName(prev => prev === 'Friend' ? profile.displayName! : prev);
      } else if (profile?.username) {
        setTargetUserName(prev => prev === 'Friend' ? profile.username! : prev);
      }
      if (profile?.photoURL && !targetUserPhoto) {
        setTargetUserPhoto(profile.photoURL);
      }
    }).catch(e => {
      console.warn('Could not fetch target user profile', e);
    });
  }, [targetUserId]);

  // Sync balance from real-time subscription (non-event views)
  useEffect(() => {
    if (eventId || !targetUserId || isBalancesLoading) return;
    const match = balances.find(b => b.id === targetUserId);
    if (match) {
      setFriendBalance(match.balance ?? 0);
      if (!navState?.name && match.name) setTargetUserName(match.name);
      if (!navState?.photoURL && match.photoURL) setTargetUserPhoto(match.photoURL);
    } else {
      // No balance doc means fully settled
      setFriendBalance(0);
    }
  }, [balances, targetUserId, eventId]);

  const matchesTargetId = (id: string, target: string) =>
    id === target || id === `user-${target}`;

  const allBillsWithTarget = [
    ...(activeSession ? [activeSession] : []),
    ...savedSessions
  ].filter(bill => {
    if (eventId && bill.eventId !== eventId) return false;
    return bill.people?.some(p => matchesTargetId(p.id, targetUserId || ''));
  });

  const isUnsettledForTarget = (bill: Bill): boolean => {
    const currentUser = user?.uid || '';
    return getSettlementStatusForUser(bill, currentUser) !== 'settled';
  };

  const displayedBills = showAll
    ? allBillsWithTarget
    : allBillsWithTarget.filter(isUnsettledForTarget);

  const settledCount = allBillsWithTarget.length - allBillsWithTarget.filter(isUnsettledForTarget).length;

  const handleResumeBill = async (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner: boolean = true) => {
    await resumeSession(billId);
    if (!isOwner) {
      navigate(`/shared/${billId}`);
    } else if (isSimpleTransaction) {
      navigate(`/transaction/${billId}`);
    } else if (isAirbnb) {
      navigate(`/airbnb/${billId}`);
    } else {
      navigate(`/bill/${billId}`);
    }
  };

  const handleViewBill = (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner: boolean = true) => {
    if (!isOwner) {
      navigate(`/shared/${billId}`);
    } else if (isSimpleTransaction) {
      navigate(`/transaction/${billId}`);
    } else if (isAirbnb) {
      navigate(`/airbnb/${billId}`);
    } else {
      navigate(`/bill/${billId}`);
    }
  };

  const handleDeleteBill = async (bill: Bill) => {
    await deleteSession(bill.id, bill.receiptFileName);
  };

  // Settlement request state — treat as resolved if balance is zero (defensive)
  const incomingRequest = targetUserId && friendBalance !== 0
    ? getIncomingRequestFromUser(targetUserId, eventId)
    : undefined;

  const handleSettleUp = () => {
    if (!targetUserId || friendBalance === null || friendBalance === 0) return;
    setSettleTarget({
      userId: targetUserId,
      name: targetUserName,
      amount: Math.abs(friendBalance),
      isPaying: friendBalance < 0,
      photoURL: targetUserPhoto,
    });
  };

  const handleApproveRequest = async () => {
    if (!incomingRequest || !user) return;
    setIsProcessingRequest(true);
    try {
      await settlementRequestService.approveRequest(incomingRequest.id);
      const result = eventId
        ? await settlementService.requestEventSettlement(eventId, incomingRequest.fromUserId)
        : await settlementService.requestSettlement(incomingRequest.fromUserId);

      if (result.billsSettled === 0) {
        toast({
          title: 'Nothing to settle',
          description: 'Balance was already resolved.',
        });
      } else {
        toast({
          title: 'Settlement approved',
          description: `$${result.amountSettled.toFixed(2)} settled with ${targetUserName}.`,
        });
      }
      refreshBalances();
    } catch (error: unknown) {
      console.error('Error approving settlement:', error);
      toast({
        title: 'Approval failed',
        description: (error as Error)?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingRequest(false);
    }
  };

  const handleDeclineRequest = async () => {
    if (!incomingRequest) return;
    setIsProcessingRequest(true);
    try {
      await settlementRequestService.declineRequest(incomingRequest.id);
      refreshBalances();
    } catch (error: unknown) {
      console.error('Error declining settlement:', error);
      toast({
        title: 'Decline failed',
        description: (error as Error)?.message ?? 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingRequest(false);
    }
  };

  const formatDate = (timestamp: { toDate: () => Date } | null | undefined) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getBillTitle = (bill: Bill) => {
    return bill.title || bill.billData?.restaurantName || formatDate(bill.createdAt);
  };

  const hasBalance = friendBalance !== null && friendBalance !== 0;
  const isSettledUp = friendBalance === 0;
  const firstName = targetUserName.split(' ')[0];
  const isNameLoaded = targetUserName !== 'Friend' || navState?.name;

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl mb-20">
      {/* Hero Card */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="glass-card rounded-2xl p-6 mb-6 relative overflow-hidden"
      >
        {/* Subtle gradient accent behind the card */}
        <div className={`absolute inset-0 opacity-[0.04] ${
          hasBalance
            ? friendBalance! > 0 ? 'bg-gradient-to-br from-green-500 to-emerald-500' : 'bg-gradient-to-br from-red-500 to-orange-500'
            : 'bg-gradient-to-br from-primary to-violet-500'
        }`} />

        {/* Back button */}
        <div className="relative flex items-center mb-5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 -ml-2"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </div>

        {/* Avatar + Info */}
        <div className="relative flex flex-col items-center text-center">
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, type: 'spring', stiffness: 220, damping: 22 }}
          >
            <UserAvatar
              name={targetUserName}
              photoURL={targetUserPhoto}
              size="lg"
              className="border-3 border-background shadow-lg"
            />
          </motion.div>

          {/* Name */}
          {isNameLoaded ? (
            <motion.h1
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.12 }}
              className="text-xl font-bold tracking-tight mt-3"
            >
              {targetUserName}
            </motion.h1>
          ) : (
            <div className="h-7 w-36 bg-muted animate-pulse rounded-lg mt-3" />
          )}

          {/* Balance */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mt-2"
          >
            {hasBalance ? (
              <>
                <p className={`text-3xl font-bold tracking-tight ${
                  friendBalance! > 0 ? 'text-green-600' : 'text-destructive'
                }`}>
                  ${Math.abs(friendBalance!).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {friendBalance! > 0 ? `${firstName} owes you` : `You owe ${firstName}`}
                </p>
              </>
            ) : isSettledUp ? (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium">All settled up!</span>
              </div>
            ) : friendBalance === null && !navState ? (
              <div className="h-10 w-24 bg-muted animate-pulse rounded-lg mx-auto" />
            ) : null}
          </motion.div>

          {/* Settle Up / Request / Approve+Decline buttons */}
          {hasBalance && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mt-4"
            >
              {isProcessingRequest ? (
                /* Processing: show loader until refresh */
                <div className="flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              ) : incomingRequest ? (
                /* Creditor: incoming request to approve/decline */
                <div className="flex flex-col items-center gap-3">
                  <p className="text-sm text-muted-foreground">
                    {firstName} requested to settle
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleApproveRequest}
                      disabled={isProcessingRequest}
                      className="rounded-full px-5 h-10 font-semibold shadow-sm bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      onClick={handleDeclineRequest}
                      disabled={isProcessingRequest}
                      variant="outline"
                      className="rounded-full px-5 h-10 font-semibold shadow-sm border-destructive text-destructive hover:bg-destructive/10"
                    >
                      <X className="w-4 h-4 mr-2" />
                      Decline
                    </Button>
                  </div>
                </div>
              ) : (
                /* Default: normal settle button */
                <Button
                  onClick={handleSettleUp}
                  className="rounded-full px-6 h-10 font-semibold shadow-sm"
                  variant={friendBalance! < 0 ? 'default' : 'secondary'}
                >
                  <Banknote className="w-4 h-4 mr-2" />
                  {friendBalance! < 0 ? 'Pay' : 'Settle Up'}
                </Button>
              )}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Toggle pills */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="flex justify-center mb-5"
      >
        <div className="flex items-center bg-muted rounded-full p-0.5 relative">
          {(['Unsettled', 'All'] as const).map((label) => {
            const isActive = label === 'All' ? showAll : !showAll;
            return (
              <button
                key={label}
                onClick={() => setShowAll(label === 'All')}
                className="relative px-4 py-1.5 rounded-full text-xs font-bold z-10 transition-colors"
              >
                {isActive && (
                  <motion.div
                    layoutId="balance-tab-indicator"
                    className="absolute inset-0 bg-background rounded-full shadow-sm"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <span className={`relative z-10 ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Bill cards */}
      {isLoadingSessions ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={showAll ? 'all' : 'unsettled'}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {displayedBills.length === 0 ? (
              <div className="text-center py-12 px-4 border border-border/40 rounded-2xl bg-card">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                  <Receipt className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-medium text-lg mb-1">
                  {!showAll && settledCount > 0 ? 'All settled up!' : 'No bills found'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {!showAll && settledCount > 0
                    ? `You have ${settledCount} settled bill${settledCount !== 1 ? 's' : ''} with ${targetUserName}.`
                    : `You don't have any bills with ${targetUserName}${eventId ? ' in this event' : ''}.`
                  }
                </p>
                {!showAll && settledCount > 0 && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="mt-3 text-xs font-semibold text-primary hover:underline"
                  >
                    Show all bills →
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Mobile */}
                <div className="flex flex-col gap-2 p-1 md:hidden">
                  {displayedBills.map((b, index) => (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.04, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <MobileBillCard
                        bill={b}
                        isLatest={b.id === activeSession?.id}
                        onView={(id) => handleViewBill(id, b.isSimpleTransaction, b.isAirbnb, b.ownerId === user?.uid)}
                        onResume={(id) => handleResumeBill(id, b.isSimpleTransaction, b.isAirbnb, b.ownerId === user?.uid)}
                        onDelete={handleDeleteBill}
                        isResuming={isResuming}
                        isDeleting={isDeleting}
                        formatDate={formatDate}
                        getBillTitle={getBillTitle}
                        isOwner={b.ownerId === user?.uid}
                        currentUserId={user?.uid}
                      />
                    </motion.div>
                  ))}
                </div>
                {/* Desktop grid */}
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {displayedBills.map((b, index) => (
                    <motion.div
                      key={b.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.04, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <DesktopBillCard
                        bill={b}
                        isLatest={b.id === activeSession?.id}
                        onView={(id) => handleViewBill(id, b.isSimpleTransaction, b.isAirbnb, b.ownerId === user?.uid)}
                        onResume={(id) => handleResumeBill(id, b.isSimpleTransaction, b.isAirbnb, b.ownerId === user?.uid)}
                        onDelete={handleDeleteBill}
                        isResuming={isResuming}
                        isDeleting={isDeleting}
                        formatDate={formatDate}
                        getBillTitle={getBillTitle}
                        isOwner={b.ownerId === user?.uid}
                        currentUserId={user?.uid}
                      />
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Settle Up Modal */}
      {settleTarget && (
        <SettleUpModal
          open={!!settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          targetUserId={settleTarget.userId}
          targetUserName={settleTarget.name}
          isPaying={settleTarget.isPaying}
          balanceAmount={settleTarget.amount}
          eventId={eventId}
          targetUserPhotoURL={settleTarget.photoURL}
          onSuccess={() => {
            setSettleTarget(null);
            refreshBalances();
          }}
        />
      )}
    </div>
  );
}
