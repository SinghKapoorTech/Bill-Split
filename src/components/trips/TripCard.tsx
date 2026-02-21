import { Users, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trip } from '@/types/trip.types';


interface TripCardProps {
  trip: Trip;
  onClick?: () => void;
  onDelete?: (tripId: string) => void;
  currentUserId?: string;
}

export function TripCard({ trip, onClick, onDelete, currentUserId }: TripCardProps) {
  const isOwner = currentUserId === trip.ownerId;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(trip.id);
    }
  };

  return (
    <Card
      className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-2">{trip.name}</h3>
          {trip.description && (
            <p className="text-sm text-muted-foreground mb-3">{trip.description}</p>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{trip.memberIds.length} members</span>
            </div>
          </div>
        </div>
        {isOwner && onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>
    </Card>
  );
}
