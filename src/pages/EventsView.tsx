import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { navigateWithOrigin } from '@/hooks/useReturnTo';
import { CalendarDays, ChevronDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CreateEventDialog } from '@/components/events/CreateEventDialog';
import { EventCard } from '@/components/events/EventCard';
import { useEventManager } from '@/hooks/useEventManager';
import { useEventInvites } from '@/hooks/useEventInvites';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { partitionEvents } from '@shared/eventArchive';

export default function EventsView() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const { events, loading, createEvent, deleteEvent, archiveEvent, unarchiveEvent } =
    useEventManager();
  const { toast } = useToast();

  // Partitioned in memory, never in the query: `where('archived','==',false)`
  // does not match documents missing the field, so a server-side filter would
  // hide every event created before this feature shipped.
  const { active: activeEvents, archived: archivedEvents } = useMemo(
    () => partitionEvents(events),
    [events],
  );

  // The disclosure section unmounts when the archived list empties, but its
  // state does not — so unarchiving the last archived event and then archiving
  // a different one would re-mount the section already expanded, out of step
  // with its collapsed-by-default contract. Reset it when the list empties.
  useEffect(() => {
    if (archivedEvents.length === 0) {
      setShowArchived(false);
    }
  }, [archivedEvents.length]);

  const { inviteMember } = useEventInvites(''); // Just need the function for arbitrary events

  const handleCreateEvent = async (
    name: string,
    description: string,
    memberIds: string[],
    pendingEmails: string[],
  ) => {
    try {
      const newEventId = await createEvent(name, description, memberIds);

      // Handle pending email invitations
      if (pendingEmails.length > 0) {
        // We need a specific hooks instance for the new event to invite emails
        await Promise.all(
          pendingEmails.map(async (email) => {
            // We can't use the hook directly since it is bound to an ID, we'll dispatch directly or let the user handle it later
            // For simplicity in this flow, we'll update the event document with pendingInvites
            try {
              const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
              const { db } = await import('@/config/firebase');
              const eventRef = doc(db, 'events', newEventId);
              await updateDoc(eventRef, {
                pendingInvites: arrayUnion(email),
              });
            } catch (e) {
              console.error('Failed to invite email', e);
            }
          }),
        );
      }

      toast({
        title: 'Event created',
        description: `${name} has been created successfully.`,
      });
      setDialogOpen(false);
      navigateWithOrigin(navigate, location, `/events/${newEventId}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleEventClick = (eventId: string) => {
    navigateWithOrigin(navigate, location, `/events/${eventId}`);
  };

  const handleDeleteEvent = (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    setEventToDelete({ id: eventId, name: event.name });
    setDeleteDialogOpen(true);
  };

  const handleArchiveEvent = async (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    try {
      await archiveEvent(eventId);
      toast({
        title: 'Event archived',
        description: `${event?.name ?? 'The event'} was archived. Balances are unchanged.`,
      });
    } catch (error) {
      console.error('Failed to archive event', error);
      toast({
        title: 'Error',
        description: 'Failed to archive event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleUnarchiveEvent = async (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    try {
      await unarchiveEvent(eventId);
      toast({
        title: 'Event restored',
        description: `${event?.name ?? 'The event'} is active again.`,
      });
    } catch (error) {
      console.error('Failed to unarchive event', error);
      toast({
        title: 'Error',
        description: 'Failed to restore event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const confirmDeleteEvent = async () => {
    if (!eventToDelete) return;
    try {
      await deleteEvent(eventToDelete.id);
      toast({
        title: 'Event deleted',
        description: `${eventToDelete.name} has been deleted successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setEventToDelete(null);
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-in max-w-4xl mx-auto">
      {/* Header: pinned */}
      <div className="shrink-0 flex items-center justify-between pt-5 mb-3 px-1">
        <div>
          <h1 className="text-3xl font-bold">Your Events</h1>
          <p className="text-muted-foreground">Organize trips and group events</p>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          size="icon"
          className="rounded-full h-10 w-10 shrink-0"
        >
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-hide px-1">
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Loading events...</div>
        ) : (
          <div className="pb-4 space-y-4">
            {activeEvents.length === 0 ? (
              <Card className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                  <CalendarDays className="w-8 h-8 text-primary" />
                </div>
                {/* The empty state keys off ACTIVE events, but must not claim
                    the user has no events when they only have archived ones. */}
                {archivedEvents.length === 0 ? (
                  <>
                    <h3 className="text-lg font-semibold">No events yet</h3>
                    <p className="text-muted-foreground">
                      Create your first event to start organizing bills with friends for vacations,
                      dinners, and more.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="text-lg font-semibold">No active events</h3>
                    <p className="text-muted-foreground">
                      Your events are all archived. Restore one below, or create a new one.
                    </p>
                  </>
                )}
                <Button onClick={() => setDialogOpen(true)}>Create Event</Button>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeEvents.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={() => handleEventClick(event.id)}
                    onDelete={handleDeleteEvent}
                    onArchive={handleArchiveEvent}
                    currentUserId={user?.uid}
                  />
                ))}
              </div>
            )}

            {archivedEvents.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowArchived((prev) => !prev)}
                  aria-expanded={showArchived}
                  className="flex items-center gap-1 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown
                    className={`w-4 h-4 transition-transform ${showArchived ? 'rotate-180' : ''}`}
                  />
                  {showArchived
                    ? 'Hide archived'
                    : `Show ${archivedEvents.length} archived event${
                        archivedEvents.length === 1 ? '' : 's'
                      }`}
                </button>

                {showArchived && (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mt-1">
                    {archivedEvents.map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onClick={() => handleEventClick(event.id)}
                        onDelete={handleDeleteEvent}
                        onUnarchive={handleUnarchiveEvent}
                        currentUserId={user?.uid}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <CreateEventDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreateEvent={handleCreateEvent}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{eventToDelete?.name}"? This action cannot be undone
              and will remove all associated transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteEvent}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
