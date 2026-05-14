import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, UserPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InviteMembersDialog } from '@/components/events/InviteMembersDialog';
import { ManageEventMembersDialog } from '@/components/events/ManageEventMembersDialog';
import { CreateOptionsDialog } from '@/components/layout/CreateOptionsDialog';
import { doc, onSnapshot, updateDoc, arrayRemove } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { TripEvent } from '@/types/event.types';
import { Bill } from '@/types';
import { NAVIGATION } from '@/utils/uiConstants';
import { Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { billService } from '@/services/billService';
import { userService } from '@/services/userService';
import MobileBillCard from '@/components/dashboard/MobileBillCard';
import { useBillContext } from '@/contexts/BillSessionContext';
import { useEventLedger } from '@/hooks/useEventLedger';
import { OptimizedDebt } from '@/services/eventLedgerService';
import { SettleUpModal, SettleTarget } from '@/components/settlements/SettleUpModal';
import { BalanceListRow, BalanceDirection } from '@/components/shared/BalanceListRow';
import { UserProfile } from '@/types/person.types';
import { User } from 'firebase/auth';

// Firestore collection name
const EVENTS_COLLECTION = 'events';

function formatShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim();
  const first = parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${first} ${lastInitial}.`;
}

function resolveDebtNames(
  debt: OptimizedDebt,
  memberProfiles: Record<string, UserProfile>,
  eventBills: Bill[]
) {
  const fromProfile = memberProfiles[debt.fromUserId];
  const toProfile = memberProfiles[debt.toUserId];

  let fromName = fromProfile?.displayName || fromProfile?.username;
  let toName = toProfile?.displayName || toProfile?.username;

  if (!fromName || !toName) {
    for (const bill of eventBills) {
      if (!fromName) {
        const p = bill.people.find(person => person.id === debt.fromUserId || person.id === `user-${debt.fromUserId}`);
        if (p) fromName = p.name;
      }
      if (!toName) {
        const p = bill.people.find(person => person.id === debt.toUserId || person.id === `user-${debt.toUserId}`);
        if (p) toName = p.name;
      }
      if (fromName && toName) break;
    }
  }

  return { fromName: fromName || 'Unknown', toName: toName || 'Unknown' };
}

function EventBalancesSection({
  optimizedDebts,
  memberProfiles,
  eventBills,
  user,
  eventId,
  navigate,
  setSettleTarget,
}: {
  optimizedDebts: OptimizedDebt[];
  memberProfiles: Record<string, UserProfile>;
  eventBills: Bill[];
  user: User | null;
  eventId: string | undefined;
  navigate: ReturnType<typeof useNavigate>;
  setSettleTarget: (target: SettleTarget) => void;
}) {
  const [isOthersExpanded, setIsOthersExpanded] = useState(false);

  const userDebts = optimizedDebts.filter(
    debt => user?.uid === debt.fromUserId || user?.uid === debt.toUserId
  );
  const otherDebts = optimizedDebts.filter(
    debt => user?.uid !== debt.fromUserId && user?.uid !== debt.toUserId
  );

  const renderDebtRow = (debt: OptimizedDebt, idx: number) => {
    const { fromName, toName } = resolveDebtNames(debt, memberProfiles, eventBills);

    const isCurrentUserPaying = user?.uid === debt.fromUserId;
    const isCurrentUserReceiving = user?.uid === debt.toUserId;
    const isCurrentUserInvolved = isCurrentUserPaying || isCurrentUserReceiving;

    const direction: BalanceDirection = isCurrentUserPaying
      ? 'you-owe'
      : isCurrentUserReceiving
        ? 'owes-you'
        : 'neutral';

    // Resolve friend photo from member profiles
    const friendUserId = isCurrentUserPaying ? debt.toUserId : isCurrentUserReceiving ? debt.fromUserId : undefined;
    const friendPhoto = friendUserId ? memberProfiles[friendUserId]?.photoURL : undefined;

    return (
      <BalanceListRow
        key={idx}
        fromLabel={fromName}
        toLabel={toName}
        amount={debt.amount}
        direction={direction}
        friendPhotoURL={friendPhoto}
        action={isCurrentUserInvolved ? {
          label: isCurrentUserPaying ? 'Pay' : 'Settle',
          variant: isCurrentUserPaying ? 'default' : 'secondary',
          onClick: () => {
            setSettleTarget({
              userId: isCurrentUserPaying ? debt.toUserId : debt.fromUserId,
              name: isCurrentUserPaying ? toName : fromName,
              amount: debt.amount,
              isPaying: isCurrentUserPaying,
              photoURL: friendPhoto,
            });
          }
        } : undefined}
        onClick={() => {
          const targetUser = isCurrentUserPaying ? debt.toUserId : debt.fromUserId;
          if (user && targetUser) {
            navigate(`/events/${eventId}/balances/${targetUser}`, {
              state: {
                name: isCurrentUserPaying ? toName : fromName,
                photoURL: friendPhoto,
                balance: isCurrentUserPaying ? -debt.amount : debt.amount,
              }
            });
          }
        }}
      />
    );
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1 ml-1">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Balances
        </h2>
      </div>
      <Card className="p-0 overflow-hidden flex-1 flex flex-col border-none bg-transparent shadow-none">
        {optimizedDebts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            All settled up! No outstanding balances.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 p-1">
              {userDebts.map((debt, idx) => renderDebtRow(debt, idx))}
            </div>
            {otherDebts.length > 0 && (
              <>
                {isOthersExpanded && (
                  <div className="flex flex-col gap-2 p-1 pt-0">
                    {otherDebts.map((debt, idx) => renderDebtRow(debt, userDebts.length + idx))}
                  </div>
                )}
                <div className="border-t border-border flex justify-center">
                  <Button
                    variant="ghost"
                    className="w-full h-11 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-none rounded-b-lg"
                    onClick={() => setIsOthersExpanded(!isOthersExpanded)}
                  >
                    {isOthersExpanded ? (
                      <>
                        <span className="text-xs font-medium mr-2">Show less</span>
                        <ChevronUp className="w-5 h-5" />
                      </>
                    ) : (
                      <>
                        <span className="text-xs font-medium mr-2">
                          Show {otherDebts.length} other {otherDebts.length === 1 ? 'balance' : 'balances'}
                        </span>
                        <ChevronDown className="w-5 h-5" />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

export default function EventDetailView() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<TripEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [manageMembersDialogOpen, setManageMembersDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [eventBills, setEventBills] = useState<Bill[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();

  const { optimizedDebts, loading: ledgerLoading } = useEventLedger(eventId || '', eventBills);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, UserProfile>>({});

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
      const profiles: Record<string, UserProfile> = {};
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
      setEventBills(bills.filter(b => b.status !== 'draft' || b.ownerId === user?.uid));
    });

    return () => {
      unsubscribe();
      unsubscribeBills();
    };
  }, [eventId]);

  const handleViewBill = (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner: boolean = true) => {
    const path = !isOwner ? `/shared/${billId}` : isSimpleTransaction ? `/transaction/${billId}` : isAirbnb ? `/airbnb/${billId}` : `/bill/${billId}`;
    navigate(path, { state: { targetEventId: event.id, targetEventName: event.name } });
  };

  const handleResumeBill = async (billId: string, isSimpleTransaction?: boolean, isAirbnb?: boolean, isOwner: boolean = true) => {
    await resumeSession(billId);
    const path = !isOwner ? `/shared/${billId}` : isSimpleTransaction ? `/transaction/${billId}` : isAirbnb ? `/airbnb/${billId}` : `/bill/${billId}`;
    navigate(path, { state: { targetEventId: event.id, targetEventName: event.name } });
  };

  const handleRemoveMember = async (memberIdToRemove: string) => {
    if (!eventId || !event) return;
    
    try {
      const eventRef = doc(db, EVENTS_COLLECTION, eventId);
      await updateDoc(eventRef, {
        memberIds: arrayRemove(memberIdToRemove)
      });
      
      toast({
        title: "Success",
        description: "Member removed from event.",
      });
      
      // If the current user removed themselves, redirect out
      if (memberIdToRemove === user?.uid) {
        navigate('/events');
      }
    } catch (error) {
      console.error("Failed to remove member:", error);
      toast({
        title: "Error",
        description: "Failed to remove member. Please try again.",
        variant: "destructive"
      });
    }
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
    <div className="container mx-auto px-4 py-4 md:py-8 max-w-7xl mb-20">
      <div className="mb-6 -ml-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-0 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/events')}
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <h1 className="text-2xl md:text-3xl font-bold break-words line-clamp-2 md:line-clamp-none min-w-0 flex-1">
              {event.name}
            </h1>
          </div>

          <div className="flex items-center">
            <Button
              onClick={() => setInviteDialogOpen(true)}
              variant="outline"
              className="h-9 px-4 text-sm gap-2 rounded-full whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              Invite
            </Button>
          </div>
        </div>
        {event.memberIds && event.memberIds.length > 0 && (
          <button
            onClick={() => setManageMembersDialogOpen(true)}
            className="text-xs text-primary hover:underline transition-colors text-left mt-0 truncate block w-full pl-7 pr-4"
            title="View and manage members"
          >
            {(() => {
              const rawNames = event.memberIds
                .map(id => memberProfiles[id]?.displayName || memberProfiles[id]?.username)
                .filter((name): name is string => Boolean(name));

              const shortVersions = rawNames.map(formatShortName);
              const counts = new Map<string, number>();
              shortVersions.forEach(s => counts.set(s, (counts.get(s) || 0) + 1));

              return rawNames
                .map((full, i) => (counts.get(shortVersions[i])! > 1 ? full : shortVersions[i]))
                .join(', ') || '...';
            })()}
          </button>
        )}
      </div>
      {event.description && (
        <p className="text-sm text-muted-foreground mb-6 mt-2">{event.description}</p>
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
      />

      {user && (
        <ManageEventMembersDialog
          open={manageMembersDialogOpen}
          onOpenChange={setManageMembersDialogOpen}
          memberProfiles={memberProfiles}
          memberIds={event.memberIds}
          ownerId={event.ownerId}
          currentUserId={user.uid}
          onRemoveMember={handleRemoveMember}
          eventName={event.name}
        />
      )}

      <div className="flex flex-col gap-6 md:gap-10">
        {/* Balances Section */}
        {!ledgerLoading && (
          <EventBalancesSection
            optimizedDebts={optimizedDebts}
            memberProfiles={memberProfiles}
            eventBills={eventBills}
            user={user}
            eventId={eventId}
            navigate={navigate}
            setSettleTarget={setSettleTarget}
          />
        )}

        {/* Bills Section */}
        <div>
          <div className="flex items-center justify-between mb-1 ml-1">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Bills
            </h2>
          </div>
          <div className="flex flex-col gap-4">
            {eventBills.length === 0 ? (
              <div className="flex flex-col gap-3">
                <button
                  className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-primary/[0.03] hover:border-primary/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98]"
                  onClick={() => handleCreateEventBill()}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 shadow-sm">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col relative z-10 w-full">
                    <span className="font-semibold text-foreground text-base group-hover:text-primary transition-colors">Start First Bill</span>
                    <span className="text-sm text-muted-foreground mt-0.5">Split a detailed expense with the squad</span>
                  </div>
                </button>

                <button
                  className="group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card hover:bg-amber-500/[0.03] hover:border-amber-500/30 transition-all duration-300 text-left overflow-hidden shadow-sm hover:shadow-md active:scale-[0.98]"
                  onClick={() => navigate('/transaction/new', { state: { targetEventId: event.id, targetEventName: event.name } })}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                  <div className="relative flex-shrink-0 h-12 w-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-300 shadow-sm">
                    <Zap className="w-6 h-6" />
                  </div>
                  <div className="flex flex-col relative z-10 w-full">
                    <span className="font-semibold text-foreground text-base group-hover:text-amber-600 transition-colors">Quick Expense</span>
                    <span className="text-sm text-muted-foreground mt-0.5">Record a fast, simple transaction</span>
                  </div>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 p-1">
                {eventBills.map((b) => (
                  <MobileBillCard
                    key={b.id}
                    bill={b}
                    isLatest={b.id === activeSession?.id}
                    onView={(id) => handleViewBill(id, b.isSimpleTransaction, b.isAirbnb, b.ownerId === user?.uid)}
                    onResume={(id) => handleResumeBill(id, b.isSimpleTransaction, b.isAirbnb, b.ownerId === user?.uid)}
                    onDelete={handleDeleteBill}
                    isResuming={isResuming}
                    isDeleting={isDeleting}
                    isOwner={b.ownerId === user?.uid}
                    currentUserId={user?.uid}
                    formatDate={(timestamp: any) => {
                      if (!timestamp) return 'Unknown date';
                      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp as any);
                      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                    }}
                    getBillTitle={(bill) => bill.title || bill.billData?.restaurantName || 'Untitled Bill'}
                  />
                ))}
              </div>
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
          targetUserPhotoURL={settleTarget.photoURL}
          onSuccess={() => {
            setSettleTarget(null);
          }}
        />
      )}
    </div>
  );
}
