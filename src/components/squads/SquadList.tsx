import { useNavigate } from 'react-router-dom';
import { Users, Trash2, Pencil } from 'lucide-react';
import { Card } from '@/components/ui/card';
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
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {squads.map((squad) => (
        <SquadCard
          key={squad.id}
          squad={squad}
          onEdit={() => onEdit(squad)}
          onDelete={() => onDelete(squad.id)}
        />
      ))}
    </div>
  );
}

interface SquadCardProps {
  squad: HydratedSquad;
  onEdit: () => void;
  onDelete: () => void;
}

function SquadCard({ squad, onEdit, onDelete }: SquadCardProps) {
  const navigate = useNavigate();

  return (
    <Card
      className="p-6 hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={() => navigate(`/squads/${squad.id}`)}
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
        <div className="flex gap-1 relative z-10">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            aria-label={`Edit ${squad.name}`}
          >
            <Pencil className="w-4 h-4" />
          </Button>
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
