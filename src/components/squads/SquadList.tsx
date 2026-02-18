import { Users, Trash2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HydratedSquad } from '@/types/squad.types';

interface SquadListProps {
  squads: HydratedSquad[];
  onEdit: (squad: HydratedSquad) => void;
  onDelete: (squadId: string) => void;
}

export function SquadList({ squads, onEdit, onDelete }: SquadListProps) {
  if (squads.length === 0) {
    return <EmptySquadList />;
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {squads.map((squad) => (
        <SquadListItem
          key={squad.id}
          squad={squad}
          onEdit={() => onEdit(squad)}
          onDelete={() => onDelete(squad.id)}
        />
      ))}
    </div>
  );
}

interface SquadListItemProps {
  squad: HydratedSquad;
  onEdit: () => void;
  onDelete: () => void;
}

function SquadListItem({ squad, onEdit, onDelete }: SquadListItemProps) {
  return (
    <div className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg border border-border hover:bg-secondary/50 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium">{squad.name}</p>
          <span className="text-xs text-muted-foreground">
            ({squad.members.length} {squad.members.length === 1 ? 'member' : 'members'})
          </span>
        </div>
        {squad.description && (
          <p className="text-sm text-muted-foreground mt-1">{squad.description}</p>
        )}
        <div className="flex flex-wrap gap-1 mt-2">
          {squad.members.slice(0, 3).map((member, index) => (
            <span
              key={index}
              className="text-xs px-2 py-1 bg-primary/10 rounded-md"
            >
              {member.name}
            </span>
          ))}
          {squad.members.length > 3 && (
            <span className="text-xs px-2 py-1 text-muted-foreground">
              +{squad.members.length - 3} more
            </span>
          )}
        </div>
      </div>
      <div className="flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${squad.name}`}
        >
          <Pencil className="w-4 h-4 text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          aria-label={`Delete ${squad.name}`}
        >
          <Trash2 className="w-4 h-4 text-destructive" />
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
        Create a squad to quickly add groups of friends to bills
      </p>
    </div>
  );
}
