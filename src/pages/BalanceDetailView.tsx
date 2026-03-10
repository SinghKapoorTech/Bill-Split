import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useBills } from '@/hooks/useBills';
import { userService } from '@/services/userService';
import { Bill } from '@/types/bill.types';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import DesktopBillCard from '@/components/dashboard/DesktopBillCard';
import { useBillContext } from '@/contexts/BillSessionContext';

export default function BalanceDetailView() {
  const { targetUserId, eventId } = useParams<{ targetUserId: string; eventId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { activeSession, savedSessions, isLoadingSessions } = useBills();
  const [targetUserName, setTargetUserName] = useState<string>('Friend');

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
      } else {
        // Fallback or retry logic if needed, but 'Friend' is default
      }
    }).catch(e => {
      console.warn('Could not fetch target user profile', e);
    });
  }, [targetUserId]);

  const allBills = [
    ...(activeSession ? [activeSession] : []),
    ...savedSessions
  ].filter(bill => {
    if (eventId && bill.eventId !== eventId) return false;

    // We only want bills where the target user was a participant.
    const isTargetParticipant = bill.participantIds?.includes(targetUserId || '') ||
      bill.people?.some(p => p.id === targetUserId || p.id === `user-${targetUserId}`);
    if (!isTargetParticipant) return false;

    // Filter out settled bills
    const unsettledIds = bill.unsettledParticipantIds || bill.participantIds || [];
    let targetUnsettled = unsettledIds.includes(targetUserId || '');
    let meUnsettled = user?.uid ? unsettledIds.includes(user.uid) : false;

    // Fallback for older bills that might not have unsettledParticipantIds mapped
    if (!bill.unsettledParticipantIds) {
      const settledIds = bill.settledPersonIds || [];
      targetUnsettled = !(settledIds.includes(targetUserId || '') || settledIds.includes(`user-${targetUserId}`));
      meUnsettled = !(settledIds.includes(user?.uid || '') || settledIds.includes(`user-${user?.uid}`));
    }

    if (bill.ownerId === user?.uid) {
      if (!targetUnsettled) return false;
    } else if (bill.ownerId === targetUserId) {
      if (!meUnsettled) return false;
    } else {
      if (bill.billType === 'private') return false;
      if (!targetUnsettled && !meUnsettled) return false;
    }

    return true;
  });

  const handleResumeBill = async (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean) => {
    await resumeSession(billId);
    if (isSimpleTransaction) {
      navigate(`/transaction/${billId}`);
    } else if (isAirbnb) {
      navigate(`/airbnb/${billId}`);
    } else {
      navigate(`/bill/${billId}`);
    }
  };

  const handleViewBill = (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean) => {
    if (isSimpleTransaction) {
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
      <div className="flex items-center gap-3 mb-6">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          Bills with {targetUserName}
        </h1>
      </div>

      {isLoadingSessions ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : allBills.length === 0 ? (
        <div className="text-center py-12 px-4 border border-border/40 rounded-2xl bg-card">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
            <Receipt className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-medium text-lg mb-1">No bills found</h3>
          <p className="text-sm text-muted-foreground">
            You don't have any bills with {targetUserName} {eventId ? 'in this event' : ''}.
          </p>
        </div>
      ) : (
        <>
          <div className="block md:hidden divide-y divide-border rounded-lg border bg-card shadow-sm overflow-hidden">
            {allBills.map((b) => (
              <MobileBillCard
                key={b.id}
                bill={b}
                isLatest={b.id === activeSession?.id}
                onView={(id) => handleViewBill(id, b.isSimpleTransaction, b.isAirbnb)}
                onResume={(id) => handleResumeBill(id, b.isSimpleTransaction, b.isAirbnb)}
                onDelete={handleDeleteBill}
                isResuming={isResuming}
                isDeleting={isDeleting}
                formatDate={formatDate}
                getBillTitle={getBillTitle}
                isOwner={b.ownerId === user?.uid}
              />
            ))}
          </div>
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allBills.map((b) => (
              <DesktopBillCard
                key={b.id}
                bill={b}
                isLatest={b.id === activeSession?.id}
                onView={(id) => handleViewBill(id, b.isSimpleTransaction, b.isAirbnb)}
                onResume={(id) => handleResumeBill(id, b.isSimpleTransaction, b.isAirbnb)}
                onDelete={handleDeleteBill}
                isResuming={isResuming}
                isDeleting={isDeleting}
                formatDate={formatDate}
                getBillTitle={getBillTitle}
                isOwner={b.ownerId === user?.uid}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
