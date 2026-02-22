import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Receipt, UserPlus, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { InviteMembersDialog } from '@/components/events/InviteMembersDialog';
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
import { generateUserId } from '@/utils/billCalculations';
import { SettleUpModal } from '@/components/settlements/SettleUpModal';

// Firestore collection name
const EVENTS_COLLECTION = 'events';

export default function EventDetailView() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [event, setEvent] = useState<TripEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [isCreatingBill, setIsCreatingBill] = useState(false);
  const [eventBills, setEventBills] = useState<Bill[]>([]);
  const { user } = useAuth();
  const { toast } = useToast();
  
  const { netBalances, optimizedDebts, loading: ledgerLoading } = useEventLedger(eventId || '');
  const [memberProfiles, setMemberProfiles] = useState<Record<string, any>>({});
  
  // Settlement state
  const [settleTarget, setSettleTarget] = useState<{ userId: string; name: string; amount: number } | null>(null);

  // Need to bring in session methods to resume/delete from the list
  const { deleteSession, resumeSession, activeSession, isDeleting, isResuming } = useBillContext();

  useEffect(() => {
    if (!event?.memberIds) return;
    
    const fetchProfiles = async () => {
      const profiles: Record<string, any> = {};
      await Promise.all(event.memberIds.map(async (id) => {
         const p = await userService.getUserProfile(id);
         if (p) {
           profiles[id] = p;
         }
      }));
      setMemberProfiles(profiles);
    };
    
    fetchProfiles();
  }, [event?.memberIds]);

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

    const fetchBills = async () => {
      try {
        const bills = await billService.getBillsByEvent(eventId);
        setEventBills(bills);
      } catch (err) {
        console.error('Failed to load event bills', err);
      }
    };

    fetchBills();

    return () => unsubscribe();
  }, [eventId]);



  const handleCreateEventBill = async () => {
    if (!user || !event) {
      toast({
        title: 'Error',
        description: 'You must be logged in to create a bill',
        variant: 'destructive'
      });
      return;
    }

    setIsCreatingBill(true);
    try {
      // 1. Fetch user profiles for all members
      const memberProfiles = await Promise.all(
        event.memberIds.map(id => userService.getUserProfile(id))
      );
      
      // 2. Map to Person objects (filter out nulls just in case)
      const mappedPeople: Person[] = memberProfiles
        .filter(p => p !== null)
        .map(p => ({
          id: generateUserId(p!.uid),
          name: p!.displayName || p!.username || 'User'
        }));

      // 3. Create default empty bill data
      const defaultBillData = {
        items: [],
        subtotal: 0,
        tax: 0,
        tip: 0,
        total: 0
      };

      // 4. Create the bill with 'event' type and pass eventId
      const billId = await billService.createBill(
        user.uid,
        user.displayName || 'Anonymous',
        'event',
        defaultBillData,
        mappedPeople,
        event.id
      );

      // 5. Navigate to the new bill session
      navigate(`/bill/${billId}`);
    } catch (error: any) {
      console.error('Error creating event bill:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to create bill. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsCreatingBill(false);
    }
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
      <div className="mb-8">
        <Button
          variant="ghost"
          className="mb-4 gap-2"
          onClick={() => navigate('/events')}
        >
          <ArrowLeft className="w-4 h-4" />
          {NAVIGATION.BACK_TO_EVENTS}
        </Button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-3xl font-bold">
              {event.name}
            </h1>
            {event.description && (
              <p className="text-lg text-muted-foreground">{event.description}</p>
            )}
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0">
            <Button onClick={() => setInviteDialogOpen(true)} variant="outline" className="gap-2 w-full sm:w-auto">
              <UserPlus className="w-4 h-4" />
              Invite Members
            </Button>
            <Button 
              onClick={handleCreateEventBill} 
              disabled={isCreatingBill}
              className="gap-2 w-full sm:w-auto"
            >
              {isCreatingBill ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
              Add Bill
            </Button>
          </div>
        </div>
      </div>

      <InviteMembersDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        event={event}
      />

      {/* Event Balances UI */}
      {!ledgerLoading && (optimizedDebts.length > 0 || eventBills.length > 0) && (
        <Card className="p-4 sm:p-6 mb-8 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">Event Balances</h3>
          </div>
          
          {optimizedDebts.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              You're all settled up for this event!
            </div>
          ) : (
            <div className="space-y-3">
              {optimizedDebts.map((debt, idx) => {
                const fromUser = memberProfiles[debt.fromUserId];
                const toUser = memberProfiles[debt.toUserId];
                const fromName = fromUser?.displayName || fromUser?.username || 'Unknown';
                const toName = toUser?.displayName || toUser?.username || 'Unknown';
                const isCurrentUserInvolved = user?.uid === debt.fromUserId || user?.uid === debt.toUserId;

                return (
                  <div key={idx} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 rounded-lg bg-background border gap-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{fromName}</span>
                      <span className="text-muted-foreground">owes</span>
                      <span className="font-medium">{toName}</span>
                      <span className="font-bold text-lg text-primary">${debt.amount.toFixed(2)}</span>
                    </div>
                    {isCurrentUserInvolved && (
                      <Button variant="default" size="sm" className="w-full sm:w-auto" onClick={() => {
                          const isCurrentUserPaying = user?.uid === debt.fromUserId;
                          // If current user is paying, they settle with 'toUser'. 
                          // If current user is receiving, they can't 'settle up' the other person's debt right now, 
                          // but usually "settling up" implies recording a payment YOU made.
                          if (isCurrentUserPaying) {
                            setSettleTarget({
                              userId: debt.toUserId,
                              name: toName,
                              amount: debt.amount
                            });
                          } else {
                            toast({ title: 'Notice', description: 'Only the person who owes money can record a settlement.' });
                          }
                      }}>
                        Settle Up
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      <div className="space-y-6">
        {eventBills.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                <Receipt className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">No bills yet</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Click 'Add Bill' to create the first bill for this event.
              </p>
              <Button onClick={handleCreateEventBill} disabled={isCreatingBill} className="gap-2" variant="outline">
                {isCreatingBill ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Bill
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {/* Mobile List View */}
            <div className="block md:hidden divide-y divide-border rounded-lg border bg-card">
              {eventBills.map((b) => (
                <MobileBillCard
                  key={b.id}
                  bill={b}
                  isLatest={b.id === activeSession?.id}
                  onView={(id) => navigate(`/bill/${id}`)}
                  onResume={async (id) => {
                    await resumeSession(id);
                    navigate(`/bill/${id}`);
                  }}
                  onDelete={(bill) => deleteSession(bill.id, bill.receiptFileName)}
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
                  onView={(id) => navigate(`/bill/${id}`)}
                  onResume={async (id) => {
                    await resumeSession(id);
                    navigate(`/bill/${id}`);
                  }}
                  onDelete={(bill) => deleteSession(bill.id, bill.receiptFileName)}
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

      {settleTarget && user && (
        <SettleUpModal
          open={!!settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          targetUserId={settleTarget.userId}
          targetUserName={settleTarget.name}
          recommendedAmount={settleTarget.amount}
          eventId={event.id}
          onSuccess={() => {
            // Ledger automatically refreshes because of real-time listener in useEventLedger
            setSettleTarget(null);
          }}
        />
      )}
    </div>
  );
}
