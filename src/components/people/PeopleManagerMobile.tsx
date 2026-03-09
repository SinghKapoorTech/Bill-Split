import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { Person } from '@/types';
import { SquadMember } from '@/types/squad.types';
import { Button } from '@/components/ui/button';
import { CompactPersonChip } from './CompactPersonChip';
import { InlinePersonSearch } from './InlinePersonSearch';
import { AddFromSquadDialog } from '@/components/squads/AddFromSquadDialog';
import { useFriendSearch, FriendSuggestion } from '@/hooks/useFriendSearch';
import { useSquadManager } from '@/hooks/useSquadManager';
import { useAuth } from '@/contexts/AuthContext';
import { generateUserId } from '@/utils/billCalculations';
import { convertSquadMembersToPeople } from '@/utils/squadUtils';

interface Friend {
  id?: string;
  name: string;
  venmoId?: string;
  email?: string;
  username?: string;
}

interface Props {
  people: Person[];
  newPersonName: string;
  newPersonVenmoId: string;
  onNameChange: (name: string) => void;
  onVenmoIdChange: (venmoId: string) => void;
  onAdd: (name?: string, venmoId?: string) => void;
  onAddFromFriend: (friend: Friend) => void;
  onRemove: (personId: string) => void;
  onUpdate: (personId: string, updates: Partial<Person>) => Promise<void>;
  onSaveAsFriend: (person: Person, contactInfo?: string) => void;
  onRemoveFriend?: (friendId: string) => void;
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;
  children?: React.ReactNode;
  eventSelector?: React.ReactNode;
}

export function PeopleManagerMobile({
  people,
  newPersonName,
  onNameChange,
  onAdd,
  onAddFromFriend,
  onRemove,
  onUpdate,
  onSaveAsFriend,
  onRemoveFriend,
  setPeople,
  children,
  eventSelector,
}: Props) {
  const { user } = useAuth();
  const { friends, filteredFriends, isSearching, loadFriends } = useFriendSearch(newPersonName);
  const { squads } = useSquadManager();
  const [squadDialogOpen, setSquadDialogOpen] = useState(false);

  const existingPeopleIds = useMemo(
    () => new Set(people.map(p => p.id)),
    [people]
  );

  const existingNames = useMemo(
    () => people.map(p => p.name),
    [people]
  );

  const isPersonInFriends = (person: Person): boolean => {
    if (!person) return false;
    return friends.some(friend => {
      if (person.id && friend.id && person.id === friend.id) return true;
      if (friend.name && person.name && friend.name.toLowerCase() === person.name.toLowerCase()) return true;
      return false;
    });
  };

  const handleAddFromFriend = (friend: FriendSuggestion) => {
    onAddFromFriend(friend);
    onNameChange('');
  };

  const handleAddSquad = (members: SquadMember[]) => {
    const newPeople = convertSquadMembersToPeople(members);
    const uniqueNewPeople = newPeople.filter(p => !existingPeopleIds.has(p.id));
    setPeople([...people, ...uniqueNewPeople]);
  };

  const handleAddGuest = (name: string) => {
    onAdd(name, '');
    onNameChange('');
  };

  const handleSaveAsFriend = async (person: Person, contactInfo?: string) => {
    await onSaveAsFriend(person, contactInfo);
    await loadFriends();
  };

  const handleRemoveFriend = async (person: Person) => {
    if (!onRemoveFriend) return;
    const friend = friends.find(f => {
      if (person.id && f.id && person.id === f.id) return true;
      if (f.name && person.name && f.name.toLowerCase() === person.name.toLowerCase()) return true;
      return false;
    });
    if (friend?.id) {
      await onRemoveFriend(friend.id);
      await loadFriends();
    }
  };

  return (
    <div className="space-y-3">
      {/* Event + Squad row */}
      <div className="flex items-center gap-2">
        <div className="flex-1">
          {eventSelector}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSquadDialogOpen(true)}
          className="h-9 text-xs border-border/50"
        >
          <Users className="w-3.5 h-3.5 mr-1.5" />
          Squads
        </Button>
      </div>

      {/* Search */}
      <div className="rounded-xl bg-secondary/20 border border-border/40 p-3">
        <InlinePersonSearch
          friends={friends}
          filteredFriends={filteredFriends}
          squads={squads}
          existingPeopleIds={existingPeopleIds}
          onAddFromFriend={handleAddFromFriend}
          onAddSquad={handleAddSquad}
          onAddGuest={handleAddGuest}
          isSearching={isSearching}
          onSearchChange={onNameChange}
        />
      </div>

      {/* People list */}
      <div className="rounded-xl bg-secondary/20 border border-border/40 p-3">
        {people.length > 0 ? (
          <div className="space-y-1.5">
            {people.map((person) => {
              const isCurrentUser = Boolean(
                user && (
                  person.id === user.uid ||
                  person.id === generateUserId(user.uid) ||
                  (person as any).userId === user.uid
                )
              );
              return (
                <CompactPersonChip
                  key={person.id}
                  person={person}
                  isCurrentUser={isCurrentUser}
                  isInFriends={isPersonInFriends(person)}
                  onRemove={onRemove}
                  onUpdate={onUpdate}
                  onSaveAsFriend={handleSaveAsFriend}
                  onRemoveFriend={handleRemoveFriend}
                  existingNames={existingNames}
                />
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">
            Start typing to add friends or guests
          </p>
        )}

        {children}
      </div>

      <AddFromSquadDialog
        open={squadDialogOpen}
        onOpenChange={setSquadDialogOpen}
        onAddSquad={handleAddSquad}
      />
    </div>
  );
}
