import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Plus } from 'lucide-react';
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
import { CreateTripDialog } from '@/components/trips/CreateTripDialog';
import { TripCard } from '@/components/trips/TripCard';
import { useTripManager } from '@/hooks/useTripManager';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export default function TripsView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [tripToDelete, setTripToDelete] = useState<{ id: string; name: string } | null>(null);
  const { trips, loading, createTrip, deleteTrip } = useTripManager();
  const { toast } = useToast();

  const handleCreateTrip = async (name: string, description: string) => {
    try {
      await createTrip(name, description);

      toast({
        title: 'Trip created',
        description: `${name} has been created successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create trip. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const handleTripClick = (tripId: string) => {
    navigate(`/trips/${tripId}`);
  };

  const handleDeleteTrip = (tripId: string) => {
    const trip = trips.find((t) => t.id === tripId);
    if (!trip) return;

    setTripToDelete({ id: tripId, name: trip.name });
    setDeleteDialogOpen(true);
  };

  const confirmDeleteTrip = async () => {
    if (!tripToDelete) return;

    try {
      await deleteTrip(tripToDelete.id);
      toast({
        title: 'Trip deleted',
        description: `${tripToDelete.name} has been deleted successfully.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete trip. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleteDialogOpen(false);
      setTripToDelete(null);
    }
  };

  return (
    <>
      <div className="text-center mb-4 md:mb-12 space-y-3 md:space-y-4">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            Your Trips
          </h2>
        </div>
        {trips.length > 0 && (
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            <span className="sm:inline">New Trip</span>
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading trips...</div>
      ) : trips.length === 0 ? (
        <Card className="p-12 text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">No trips yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Create your first trip to start organizing bills with friends for events, vacations, and more.
            </p>
          </div>
          <Button className="gap-2" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4" />
            Create First Trip
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((trip) => (
            <TripCard
              key={trip.id}
              trip={trip}
              onClick={() => handleTripClick(trip.id)}
              onDelete={handleDeleteTrip}
              currentUserId={user?.uid}
            />
          ))}
        </div>
      )}

      <CreateTripDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreateTrip={handleCreateTrip}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{tripToDelete?.name}"? This action cannot be undone and will remove all associated transactions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteTrip} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
