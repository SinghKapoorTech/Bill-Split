import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useBills } from '@/hooks/useBills';
import { userService } from '@/services/userService';
import { Bill } from '@/types/bill.types';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import DesktopBillCard from '@/components/dashboard/DesktopBillCard';
import { useBillContext } from '@/contexts/BillSessionContext';
import { getSettlementStatusForUser } from '@/utils/billCalculations';

export default function BalanceDetailView() {
  const { targetUserId, eventId } = useParams<{ targetUserId: string; eventId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeSession, savedSessions, isLoadingSessions } = useBills();
  const [targetUserName, setTargetUserName] = useState<string>('Friend');
  const [showAll, setShowAll] = useState(false);
  const [isTabLoading, setIsTabLoading] = useState(false);

  const {
    isDeleting,
    isResuming,
    deleteSession,
    resumeSession
  } = useBillContext();

  useEffect(() => {
    if (!targetUserId) return;
    userService.getUserProfile(targetUserId).then(profile => {
      if (profile?.displayName) {
        setTargetUserName(profile.displayName);
      } else if (profile?.username) {
        setTargetUserName(profile.username);
      }
    }).catch(e => {
      console.warn('Could not fetch target user profile', e);
    });
  }, [targetUserId]);

  // Helper – checks if a raw uid matches this bill's target-user slot,
  // accounting for both 'user-{uid}' and raw-uid storage patterns.
  const matchesTargetId = (id: string, target: string) =>
    id === target || id === `user-${target}`;

  const allBillsWithTarget = [
    ...(activeSession ? [activeSession] : []),
    ...savedSessions
  ].filter(bill => {
    if (eventId && bill.eventId !== eventId) return false;

    // Include bill only if target is a participant (by participantIds or people array)
    const isTargetParticipant =
      bill.participantIds?.some(id => matchesTargetId(id, targetUserId || '')) ||
      bill.people?.some(p => matchesTargetId(p.id, targetUserId || ''));

    return isTargetParticipant;
  });

  // Determine which bills are "unsettled" for the filter toggle.
  // Uses the same logic as the badge to avoid showing "Settled" bills in the unsettled list.
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
    if (isSimpleTransaction) {
      navigate(`/transaction/${billId}`);
    } else if (isAirbnb) {
      navigate(`/airbnb/${billId}`);
    } else if (!isOwner) {
      navigate(`/shared/${billId}`);
    } else {
      navigate(`/bill/${billId}`);
    }
  };

  const handleViewBill = (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner: boolean = true) => {
    if (isSimpleTransaction) {
      navigate(`/transaction/${billId}`);
    } else if (isAirbnb) {
      navigate(`/airbnb/${billId}`);
    } else if (!isOwner) {
      navigate(`/shared/${billId}`);
    } else {
      navigate(`/bill/${billId}`);
    }
  };

  const handleDeleteBill = async (bill: Bill) => {
    await deleteSession(bill.id, bill.receiptFileName);
  };

  const handleTabSwitch = (all: boolean) => {
    if (showAll === all) return;
    setIsTabLoading(true);
    setTimeout(() => {
      setShowAll(all);
      setIsTabLoading(false);
    }, 250);
  };

  const formatDate = (timestamp: { toDate: () => Date } | null | undefined) => {
    if (!timestamp) return 'Unknown date';
    const date = timestamp.toDate();
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getBillTitle = (bill: Bill) => {
    return bill.title || bill.billData?.restaurantName || formatDate(bill.createdAt);
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl mb-20">
      {/* Row 1: back button + title */}
      <div className="flex items-center gap-3 mb-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight truncate">
          Bills with {targetUserName}
        </h1>
      </div>

      {/* Row 2: toggle pill, right-aligned */}
      <div className="flex justify-center mb-5">
        <div className="flex items-center bg-muted rounded-full p-0.5">
          <button
            onClick={() => handleTabSwitch(false)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              !showAll
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Unsettled
          </button>
          <button
            onClick={() => handleTabSwitch(true)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
              showAll
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            All
          </button>
        </div>
      </div>

      {(isLoadingSessions || isTabLoading) ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : displayedBills.length === 0 ? (
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
              onClick={() => handleTabSwitch(true)}
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              Show all bills →
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile — matches Dashboard card style */}
          <div className="flex flex-col gap-2 p-1 md:hidden">
            {displayedBills.map((b) => (
              <MobileBillCard
                key={`${b.id}-${showAll}`}
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
            ))}
          </div>
          {/* Desktop grid */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayedBills.map((b) => (
              <DesktopBillCard
                key={`${b.id}-${showAll}`}
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
            ))}
          </div>
        </>
      )}
    </div>
  );
}
