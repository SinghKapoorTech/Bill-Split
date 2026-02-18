import { useState, useEffect } from 'react';
import { Users, UserPlus, Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSquadManager } from '@/hooks/useSquadManager';
import { HydratedSquad, SquadMember } from '@/types/squad.types';

interface AddFromSquadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddSquad: (members: SquadMember[]) => void;
}

export function AddFromSquadDialog({ open, onOpenChange, onAddSquad }: AddFromSquadDialogProps) {
  const { squads, loading, loadSquads } = useSquadManager();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSquad, setSelectedSquad] = useState<HydratedSquad | null>(null);

  // Refresh squads when dialog opens
  useEffect(() => {
    if (open) {
      loadSquads();
    }
  }, [open, loadSquads]);

  const filteredSquads = squads.filter((squad) =>
    squad.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelectSquad = (squad: HydratedSquad) => {
    setSelectedSquad(squad);
  };

  const handleConfirmAdd = () => {
    if (selectedSquad) {
      onAddSquad(selectedSquad.members);
      setSelectedSquad(null);
      setSearchQuery('');
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setSelectedSquad(null);
    setSearchQuery('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Add from Squad
          </DialogTitle>
          <DialogDescription>
            Select a squad to add all members to the bill at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {loading ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">Loading squads...</p>
            </div>
          ) : squads.length === 0 ? (
            <EmptySquadsMessage />
          ) : selectedSquad ? (
            <SquadPreview squad={selectedSquad} />
          ) : (
            <>
              <SquadSearchInput value={searchQuery} onChange={setSearchQuery} />
              <SquadSelectionList
                squads={filteredSquads}
                onSelect={handleSelectSquad}
                searchQuery={searchQuery}
              />
            </>
          )}
        </div>

        {selectedSquad && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelectedSquad(null)}>
              Back to squads
            </Button>
            <Button variant="success" onClick={handleConfirmAdd}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Squad to Bill
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SquadSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

function SquadSearchInput({ value, onChange }: SquadSearchInputProps) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input
        placeholder="Search squads..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-9"
      />
    </div>
  );
}

interface SquadSelectionListProps {
  squads: HydratedSquad[];
  onSelect: (squad: HydratedSquad) => void;
  searchQuery: string;
}

function SquadSelectionList({ squads, onSelect, searchQuery }: SquadSelectionListProps) {
  if (squads.length === 0 && searchQuery) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No squads found matching "{searchQuery}"</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {squads.map((squad) => (
        <button
          key={squad.id}
          onClick={() => onSelect(squad)}
          className="w-full text-left p-3 bg-secondary/30 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="font-medium">{squad.name}</p>
              {squad.description && (
                <p className="text-sm text-muted-foreground mt-1">{squad.description}</p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                {squad.members.length} {squad.members.length === 1 ? 'member' : 'members'}
              </p>
            </div>
            <UserPlus className="w-4 h-4 text-muted-foreground " />
          </div>
        </button>
      ))}
    </div>
  );
}

interface SquadPreviewProps {
  squad: HydratedSquad;
}

function SquadPreview({ squad }: SquadPreviewProps) {
  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg p-4">
        <h3 className="font-semibold text-lg mb-2">{squad.name}</h3>
        {squad.description && (
          <p className="text-sm text-muted-foreground mb-4">{squad.description}</p>
        )}
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Members ({squad.members.length}):
          </p>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {squad.members.map((member, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-secondary/30 rounded"
              >
                <span className="text-sm">{member.name}</span>
                {member.venmoId && (
                  <span className="text-xs text-muted-foreground">@{member.venmoId}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptySquadsMessage() {
  return (
    <div className="text-center py-8">
      <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
      <p className="text-sm text-muted-foreground mb-2">No squads saved yet</p>
      <p className="text-xs text-muted-foreground">
        Create a squad in Manage Squads to quickly add groups of friends
      </p>
    </div>
  );
}
