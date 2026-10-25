import { Users, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TripEvent } from '@/types/event.types';
import { isEventArchived } from '@shared/eventArchive';
import { formatShortDate } from '@/utils/format';

interface EventCardProps {
  event: TripEvent;
  onClick?: () => void;
  onDelete?: (eventId: string) => void;
  onArchive?: (eventId: string) => void;
  onUnarchive?: (eventId: string) => void;
  currentUserId?: string;
}

export function EventCard({
  event,
  onClick,
  onDelete,
  onArchive,
  onUnarchive,
  currentUserId,
}: EventCardProps) {
  const isOwner = currentUserId === event.ownerId;
  const archived = isEventArchived(event);
  // Give archivedAt a reader. A field only ever written is a field that drifts
  // — and "when did this stop being active?" is the first thing anyone asks of
  // the archived list. Null (missing or unparseable) simply omits the line.
  const archivedOn = archived ? formatShortDate(event.archivedAt) : null;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(event.id);
    }
  };

  // Archive is owner-only, matching firestore.rules. A member's write would be
  // denied, and offering a button that always fails is worse than not offering
  // one — so non-owners see no control at all.
  const handleArchiveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (archived) {
      onUnarchive?.(event.id);
    } else {
      onArchive?.(event.id);
    }
  };

  const showArchiveButton = isOwner && (archived ? !!onUnarchive : !!onArchive);

  return (
    <Card
      className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold mb-2 break-words">{event.name}</h3>
          {event.description && (
            <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
          )}
          {/* Wraps because the archived row adds a second item: "N members" plus
              "Archived <date>" does not fit beside two icon buttons on a 360px
              phone. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{event.memberIds.length} members</span>
            </div>
            {archivedOn && (
              <div className="flex items-center gap-1">
                <Archive className="w-4 h-4" />
                <span>Archived {archivedOn}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {showArchiveButton && (
            // LABELLED, not icon-only: archiving is how a free user makes room
            // for a new group, so it has to be findable without guessing what a
            // box icon means — and it must not read as a twin of Delete beside it.
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleArchiveToggle}
              aria-label={archived ? `Unarchive ${event.name}` : `Archive ${event.name}`}
              title={archived ? 'Unarchive event' : 'Archive event'}
            >
              {archived ? (
                <ArchiveRestore className="w-3.5 h-3.5" aria-hidden />
              ) : (
                <Archive className="w-3.5 h-3.5" aria-hidden />
              )}
              {archived ? 'Restore' : 'Archive'}
            </Button>
          )}
          {isOwner && onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              aria-label={`Delete ${event.name}`}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
