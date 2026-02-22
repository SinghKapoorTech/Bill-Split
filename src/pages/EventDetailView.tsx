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
  
  // Need to bring in session methods to resume/delete from the list
  const { deleteSession, resumeSession, activeSession, isDeleting, isResuming } = useBillContext();

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
          id: p!.uid,
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
    <>
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
          <div className="space-y-2">
            <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
              {event.name}
            </h2>
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
    </>
  );
}
