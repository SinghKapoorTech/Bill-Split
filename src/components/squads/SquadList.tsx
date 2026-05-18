import { useNavigate } from 'react-router-dom';
import { Users, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HydratedSquad } from '@/types/squad.types';
import { useAuth } from '@/contexts/AuthContext';

interface SquadListProps {
  squads: HydratedSquad[];
  onDelete: (squadId: string) => void;
  onCardClick?: (squad: HydratedSquad) => void;
  variant?: 'card' | 'list';
}

export function SquadList({ squads, onDelete, onCardClick, variant = 'card' }: SquadListProps) {
  const { user } = useAuth();

  if (squads.length === 0) {
    return <EmptySquadList />;
  }

  if (variant === 'list') {
    return (
      <div className="space-y-3">
        {squads.map((squad) => (
          <SquadRow
            key={squad.id}
            squad={squad}
            currentUserId={user?.uid}
            onDelete={() => onDelete(squad.id)}
            onRowClick={onCardClick ? () => onCardClick(squad) : undefined}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {squads.map((squad) => (
        <SquadCard
          key={squad.id}
          squad={squad}
          currentUserId={user?.uid}
          onDelete={() => onDelete(squad.id)}
          onCardClick={onCardClick ? () => onCardClick(squad) : undefined}
        />
      ))}
    </div>
  );
}

interface SquadCardProps {
  squad: HydratedSquad;
  currentUserId?: string;
  onDelete: () => void;
  onCardClick?: () => void;
}

function SquadCard({ squad, currentUserId, onDelete, onCardClick }: SquadCardProps) {
  const navigate = useNavigate();
  const others = squad.members.filter((m) => !currentUserId || m.id !== currentUserId);
  const visible = others.slice(0, 4);
  const hiddenCount = others.length - visible.length;

  return (
    <Card
      className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={() => (onCardClick ? onCardClick() : navigate(`/squads/${squad.id}`))}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-semibold mb-2">{squad.name}</h3>
          {squad.description && (
            <p className="text-sm text-muted-foreground mb-3">{squad.description}</p>
          )}
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{squad.members.length} {squad.members.length === 1 ? 'member' : 'members'}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {visible.map((member, index) => (
              <span
                key={index}
                className="text-xs px-2 py-1 bg-primary/10 rounded-md"
              >
                {member.name}
              </span>
            ))}
            {hiddenCount > 0 && (
              <>
                <div className="w-full border-t border-border/50 my-1" />
                <span className="text-xs px-2 py-1 text-muted-foreground">
                  +{hiddenCount} more
                </span>
              </>
            )}
          </div>
        </div>
        <div className="relative z-10">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            aria-label={`Delete ${squad.name}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

interface SquadRowProps {
  squad: HydratedSquad;
  currentUserId?: string;
  onDelete: () => void;
  onRowClick?: () => void;
}

function SquadRow({ squad, currentUserId, onDelete, onRowClick }: SquadRowProps) {
  const navigate = useNavigate();
  const isCurrentUserMember = currentUserId && squad.members.some((m) => m.id === currentUserId);
  const others = squad.members.filter((m) => !currentUserId || m.id !== currentUserId);
  const visibleOthers = others.slice(0, 3);
  const hiddenCount = others.length - visibleOthers.length;

  const nameParts = visibleOthers.map((m) => m.name);
  if (hiddenCount > 0) nameParts.push(`+${hiddenCount} more`);
  if (isCurrentUserMember) nameParts.push('You');
  const namesLine = nameParts.join(', ');

  return (
    <div
      className="flex items-center justify-between bg-secondary/30 rounded-lg border border-border p-3 md:p-4 cursor-pointer hover:bg-secondary/50 transition-colors"
      onClick={() => (onRowClick ? onRowClick() : navigate(`/squads/${squad.id}`))}
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{squad.name}</p>
        <p className="text-sm text-muted-foreground font-semibold">
          {squad.members.length} {squad.members.length === 1 ? 'member' : 'members'}
        </p>
        {namesLine && (
          <p className="text-xs text-muted-foreground truncate">{namesLine}</p>
        )}
      </div>
      <div className="ml-2 relative z-10">
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          aria-label={`Delete ${squad.name}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

function EmptySquadList() {
  return (
    <div className="text-center py-8">
      <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground mb-2">
        No squads saved yet
      </p>
      <p className="text-xs text-muted-foreground">
        Create a squad to quickly add friends to bills
      </p>
    </div>
  );
}
