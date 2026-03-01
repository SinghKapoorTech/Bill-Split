import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
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

export default function EventsView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [eventToDelete, setEventToDelete] = useState<{ id: string; name: string } | null>(null);
  const { events, loading, createEvent, deleteEvent } = useEventManager();
  const { toast } = useToast();

  const { inviteMember } = useEventInvites(''); // Just need the function for arbitrary events

  const handleCreateEvent = async (name: string, description: string, memberIds: string[], pendingEmails: string[]) => {
    try {
      const newEventId = await createEvent(name, description, memberIds);
      
      // Handle pending email invitations
      if (pendingEmails.length > 0) {
        // We need a specific hooks instance for the new event to invite emails
        await Promise.all(pendingEmails.map(async (email) => {
           // We can't use the hook directly since it is bound to an ID, we'll dispatch directly or let the user handle it later
           // For simplicity in this flow, we'll update the event document with pendingInvites
           try {
              const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
              const { db } = await import('@/config/firebase');
              const eventRef = doc(db, 'events', newEventId);
              await updateDoc(eventRef, {
                 pendingInvites: arrayUnion(email)
              });
           } catch(e) {
              console.error('Failed to invite email', e);
           }
        }));
      }

      toast({
        title: 'Event created',
        description: `${name} has been created successfully.`,
      });
      setDialogOpen(false);
      navigate(`/events/${newEventId}`);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create event. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleEventClick = (eventId: string) => {
    navigate(`/events/${eventId}`);
  };

  const handleDeleteEvent = (eventId: string) => {
    const event = events.find((e) => e.id === eventId);
    if (!event) return;
    setEventToDelete({ id: eventId, name: event.name });
    setDeleteDialogOpen(true);
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
    <div className="container mx-auto px-4 py-8 max-w-4xl mb-20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Your Events</h1>
          <p className="text-muted-foreground">Organize trips and group events</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} size="icon" className="rounded-full h-10 w-10 shrink-0">
          <Plus className="w-6 h-6" />
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading events...</div>
      ) : events.length === 0 ? (
        <Card className="p-8 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <CalendarDays className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold">No events yet</h3>
          <p className="text-muted-foreground">
            Create your first event to start organizing bills with friends for vacations, dinners, and more.
          </p>
          <Button onClick={() => setDialogOpen(true)}>
            Create Event
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              onClick={() => handleEventClick(event.id)}
              onDelete={handleDeleteEvent}
              currentUserId={user?.uid}
            />
          ))}
        </div>
      )}

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
              Are you sure you want to delete "{eventToDelete?.name}"? This action cannot be undone and will remove all associated transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteEvent} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
