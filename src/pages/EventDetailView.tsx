import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, UserPlus, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InviteMembersDialog } from '@/components/events/InviteMembersDialog';
import { CreateOptionsDialog } from '@/components/layout/CreateOptionsDialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useIsMobile } from '@/hooks/use-mobile';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { TripEvent } from '@/types/event.types';
import { Person, Bill } from '@/types';
import { NAVIGATION } from '@/utils/uiConstants';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { billService } from '@/services/billService';
import { userService } from '@/services/userService';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import DesktopBillCard from '@/components/dashboard/DesktopBillCard';
import { useBillContext } from '@/contexts/BillSessionContext';
import { useEventLedger } from '@/hooks/useEventLedger';
import { SettleUpModal, SettleTarget } from '@/components/settlements/SettleUpModal';
import { BalanceListRow, BalanceDirection } from '@/components/shared/BalanceListRow';

// Firestore collection name
const EVENTS_COLLECTION = 'events';

export default function EventDetailView() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [event, setEvent] = useState<TripEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [isCreatingBill, setIsCreatingBill] = useState(false);
  const [eventBills, setEventBills] = useState<Bill[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const { netBalances, optimizedDebts, loading: ledgerLoading } = useEventLedger(eventId || '', eventBills);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, any>>({});

  // Settlement state
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);

  // Need to bring in session methods to resume/delete from the list
  const { deleteSession, resumeSession, activeSession, isDeleting, isResuming } = useBillContext();

  const handleDeleteBill = async (bill: Bill) => {
    await deleteSession(bill.id, bill.receiptFileName);
    setEventBills(prev => prev.filter(b => b.id !== bill.id));
  };

  useEffect(() => {
    const userIdsToFetch = new Set<string>();

    if (event?.memberIds) {
      event.memberIds.forEach(id => userIdsToFetch.add(id));
    }

    // Also try fetching profiles for anyone involved in a debt
    optimizedDebts.forEach(debt => {
      // Basic check to see if it looks like a Firebase UID (typically 28 chars long alphanumeric)
      if (debt.fromUserId.length >= 20) userIdsToFetch.add(debt.fromUserId);
      if (debt.toUserId.length >= 20) userIdsToFetch.add(debt.toUserId);
    });

    if (userIdsToFetch.size === 0) return;

    const fetchProfiles = async () => {
      const profiles: Record<string, any> = {};
      await Promise.all(Array.from(userIdsToFetch).map(async (id) => {
        try {
          const p = await userService.getUserProfile(id);
          if (p) {
            profiles[id] = p;
          }
        } catch (e) {
          // Skip guest IDs that fail to fetch
          console.warn(`Could not fetch profile for ${id}`);
        }
      }));
      setMemberProfiles(prev => ({ ...prev, ...profiles }));
    };

    fetchProfiles();
  }, [event?.memberIds, optimizedDebts]);

  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(
      doc(db, EVENTS_COLLECTION, eventId),
      (eventDoc) => {
        if (eventDoc.exists()) {
          const data = eventDoc.data();
          setEvent({
            id: eventDoc.id,
            name: data.name,
            description: data.description,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
            ownerId: data.ownerId,
            memberIds: data.memberIds || [],
            pendingInvites: data.pendingInvites || [],
          });
        } else {
          setEvent(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching event:', error);
        setLoading(false);
      }
    );

    // Subscribe to bills
    const unsubscribeBills = billService.subscribeBillsByEvent(eventId, (bills) => {
      setEventBills(bills);
    });

    return () => {
      unsubscribe();
      unsubscribeBills();
    };
  }, [eventId]);

  const handleViewBill = (billId: string, isSimpleTransaction?: boolean) => {
    const path = isSimpleTransaction ? `/transaction/${billId}` : `/bill/${billId}`;
    navigate(path, { state: { targetEventId: event.id, targetEventName: event.name } });
  };

  const handleResumeBill = async (billId: string, isSimpleTransaction?: boolean) => {
    await resumeSession(billId);
    const path = isSimpleTransaction ? `/transaction/${billId}` : `/bill/${billId}`;
    navigate(path, { state: { targetEventId: event.id, targetEventName: event.name } });
  };



  const handleCreateEventBill = async () => {
    if (!user || !event) {
      toast({
        title: 'Error',
        description: 'You must be logged in to create a bill',
        variant: 'destructive'
      });
      return;
    }

    // Instead of eager creation, we navigate to the draft view.
    // We pass the eventId in navigation state so the bill session knows 
    // to attach this event context when it finally JIT creates the document.
    navigate('/bill/new', {
      state: {
        targetEventId: event.id,
        targetEventName: event.name
      }
    });
  };

  if (loading) {
    return <div className="text-center py-12 text-muted-foreground">Loading event...</div>;
  }

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">Event not found.</p>
        <Button onClick={() => navigate('/events')}>{NAVIGATION.BACK_TO_EVENTS}</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl mb-20">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => navigate('/events')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            {event.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setInviteDialogOpen(true)} variant="ghost" size="icon" className="h-8 w-8">
            <UserPlus className="w-4 h-4 text-muted-foreground" />
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            size="icon"
            className="h-8 w-8 rounded-full"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
      {event.description && (
        <p className="text-sm text-muted-foreground pl-11 mb-6">{event.description}</p>
      )}

      {/* Reusing CreateOptionsDialog with event context */}
      <CreateOptionsDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        eventContext={{ targetEventId: event.id, targetEventName: event.name }}
      />

      <InviteMembersDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        event={event}
        memberProfiles={memberProfiles}
      />

      <div className="space-y-8">
        {/* Balances Section */}
        {!ledgerLoading && (
          <div className="space-y-3">
            <h3 className="font-semibold text-lg tracking-tight px-1">Balances</h3>
            <Card className="p-0 overflow-hidden border-border bg-card shadow-sm">
              {optimizedDebts.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="text-base font-medium mb-1">You're all settled up!</h3>
                  <p className="text-xs text-muted-foreground">
                    There are no outstanding debts.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {optimizedDebts.map((debt, idx) => {
                    const fromProfile = memberProfiles[debt.fromUserId];
                    const toProfile = memberProfiles[debt.toUserId];

                    let fromName = fromProfile?.displayName || fromProfile?.username;
                    let toName = toProfile?.displayName || toProfile?.username;

                    if (!fromName || !toName) {
                      for (const bill of eventBills) {
                        if (!fromName) {
                          const p = bill.people.find(person => person.id === debt.fromUserId);
                          if (p) fromName = p.name;
                        }
                        if (!toName) {
                          const p = bill.people.find(person => person.id === debt.toUserId);
                          if (p) toName = p.name;
                        }
                        if (fromName && toName) break;
                      }
                    }

                    fromName = fromName || 'Unknown';
                    toName = toName || 'Unknown';

                    const isCurrentUserPaying = user?.uid === debt.fromUserId;
                    const isCurrentUserReceiving = user?.uid === debt.toUserId;
                    const isCurrentUserInvolved = isCurrentUserPaying || isCurrentUserReceiving;

                    const direction: BalanceDirection = isCurrentUserPaying
                      ? 'you-owe'
                      : isCurrentUserReceiving
                        ? 'owes-you'
                        : 'neutral';

                    return (
                      <BalanceListRow
                        key={idx}
                        fromLabel={fromName}
                        toLabel={toName}
                        amount={debt.amount}
                        direction={direction}
                        action={isCurrentUserInvolved ? {
                          label: isCurrentUserPaying ? 'Pay' : 'Settle',
                          variant: isCurrentUserPaying ? 'default' : 'secondary',
                          onClick: () => {
                            setSettleTarget({
                              userId: isCurrentUserPaying ? debt.toUserId : debt.fromUserId,
                              name: isCurrentUserPaying ? toName! : fromName!,
                              amount: debt.amount,
                              isPaying: isCurrentUserPaying,
                            });
                          }
                        } : undefined}
                      />
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Bills Section */}
        <div className="space-y-3">
          <h3 className="font-semibold text-lg tracking-tight px-1">Bills</h3>
          <div className="space-y-4">
            {eventBills.length === 0 ? (
              <Card className="p-12 border-dashed">
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary/10 flex items-center justify-center">
                    <Receipt className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-base font-medium mb-1">No bills yet</h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Tap the + icon above to start.
                  </p>
                </div>
              </Card>
            ) : (
              <>
                {/* Mobile List View */}
                <div className="block md:hidden divide-y divide-border rounded-lg border bg-card shadow-sm overflow-hidden">
                  {eventBills.map((b) => (
                    <MobileBillCard
                      key={b.id}
                      bill={b}
                      isLatest={b.id === activeSession?.id}
                      onView={(id) => handleViewBill(id, b.isSimpleTransaction)}
                      onResume={(id) => handleResumeBill(id, b.isSimpleTransaction)}
                      onDelete={handleDeleteBill}
                      isResuming={isResuming}
                      isDeleting={isDeleting}
                      formatDate={(timestamp) => {
                        if (!timestamp) return 'Unknown date';
                        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      }}
                      getBillTitle={(bill) => bill.title || bill.billData?.restaurantName || 'Untitled Bill'}
                    />
                  ))}
                </div>

                {/* Desktop Grid View */}
                <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {eventBills.map((b) => (
                    <DesktopBillCard
                      key={b.id}
                      bill={b}
                      isLatest={b.id === activeSession?.id}
                      onView={(id) => handleViewBill(id, b.isSimpleTransaction)}
                      onResume={(id) => handleResumeBill(id, b.isSimpleTransaction)}
                      onDelete={handleDeleteBill}
                      isResuming={isResuming}
                      isDeleting={isDeleting}
                      formatDate={(timestamp) => {
                        if (!timestamp) return 'Unknown date';
                        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                      }}
                      getBillTitle={(bill) => bill.title || bill.billData?.restaurantName || 'Untitled Bill'}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {settleTarget && user && (
        <SettleUpModal
          open={!!settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          targetUserId={settleTarget.userId}
          targetUserName={settleTarget.name}
          isPaying={settleTarget.isPaying}
          balanceAmount={settleTarget.amount}
          eventId={eventId}
          onSuccess={() => {
            setSettleTarget(null);
          }}
        />
      )}
    </div>
  );
}
