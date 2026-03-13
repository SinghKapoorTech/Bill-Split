import { useState } from 'react';
import { Users, UserPlus, UsersRound } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Person } from '@/types';
import { PersonCard } from './PersonCard';
import { AddPersonDialog } from './AddPersonDialog';
import { AddFromFriendsDialog } from './AddFromFriendsDialog';
import { Button } from '@/components/ui/button';
import { AddFromSquadDialog } from '@/components/squads/AddFromSquadDialog';
import { useAuth } from '@/contexts/AuthContext';
import { convertSquadMembersToPeople } from '@/utils/squadUtils';
import { SquadMember } from '@/types/squad.types';
import { generateUserId } from '@/utils/billCalculations';
import { useFriendSearch } from '@/hooks/useFriendSearch';

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
  onAddSquad?: (members: Person[]) => void;
  children?: React.ReactNode;
}

export function PeopleManager({
  people,
  newPersonName,
  newPersonVenmoId,
  onNameChange,
  onVenmoIdChange,
  onAdd,
  onAddFromFriend,
  onRemove,
  onUpdate,
  onSaveAsFriend,
  onRemoveFriend,
  setPeople,
  onAddSquad,
  children
}: Props) {
  const { user } = useAuth();
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [friendsDialogOpen, setFriendsDialogOpen] = useState(false);
  const [squadDialogOpen, setSquadDialogOpen] = useState(false);

  const { friends, filteredFriends, setShowSuggestions, loadFriends } = useFriendSearch(newPersonName);

  const handleSelectFriend = (friend: Friend) => {
    onAddFromFriend(friend);
    onNameChange('');
    onVenmoIdChange('');
  };

  const handleManualAdd = (name: string, venmoId: string, email?: string) => {
    onNameChange(name);
    onVenmoIdChange(venmoId);
    onAdd(name, venmoId);
  };

  const handleAddSquad = (members: SquadMember[]) => {
    const newPeople = convertSquadMembersToPeople(members);
    if (onAddSquad) {
      // Use the parent's atomic handler so members are persisted to Firestore
      onAddSquad(newPeople);
    } else {
      // Fallback: direct local state update (for non-bill contexts)
      const existingIds = new Set(people.map(p => p.id));
      const uniqueNewPeople = newPeople.filter(p => !existingIds.has(p.id));
      setPeople([...people, ...uniqueNewPeople]);
    }
  };

  const isPersonInFriends = (person: Person): boolean => {
    if (!person) return false;
    return friends.some(friend => {
      if (person.id && friend.id && person.id === friend.id) return true;
      if (friend.name && person.name && friend.name.toLowerCase() === person.name.toLowerCase()) return true;
      return false;
    });
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

  const existingNames = people.map(p => p.name);

  return (
    <Card className="bill-card-tight">
      <div className="section-header">
        <Users className="icon-md-responsive icon-primary" />
        <h3 className="section-title-responsive">People</h3>
      </div>

      {/* Quick-add shortcuts */}
      <div className="flex gap-3 mb-4">
        <Button
          onClick={() => setFriendsDialogOpen(true)}
          variant="outline"
          size="sm"
          className="flex-1 h-10 gap-2 text-sm"
        >
          <UserPlus className="w-4 h-4" />
          Friends
        </Button>
        <Button
          onClick={() => setSquadDialogOpen(true)}
          variant="outline"
          size="sm"
          className="flex-1 h-10 gap-2 text-sm"
        >
          <UsersRound className="w-4 h-4" />
          Squads
        </Button>
      </div>

      {/* People list */}
      {people.length > 0 && (
        <div className="space-y-2 mb-3">
          {people.map((person) => {
            const isCurrentUser = Boolean(user && (person.id === user.uid || person.id === generateUserId(user.uid) || (person as Person & { userId?: string }).userId === user.uid));
            return (
              <PersonCard
                key={person.id}
                person={person}
                isCurrentUser={!!isCurrentUser}
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
      )}

      {people.length === 1 && (
        <div className="px-4 py-2 border border-amber-500/20 bg-amber-500/5 rounded-lg mb-4">
          <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium text-center">
            Add at least one more person to proceed.
          </p>
        </div>
      )}

      {people.length === 0 && (
        <div className="text-center py-6">
          <Users className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground mb-1">No one here yet</p>
          <p className="text-xs text-muted-foreground/70">Add friends, a squad, or someone new below</p>
        </div>
      )}

      {/* Bottom add row */}
      <div className="mb-3">
        <AddPersonDialog
          isOpen={isAddPersonOpen}
          setIsOpen={setIsAddPersonOpen}
          friendSuggestions={filteredFriends}
          onSearchChange={onNameChange}
          onSelectSuggestion={handleSelectFriend}
          onAddManual={handleManualAdd}
          trigger={
            <button
              className="w-full flex items-center justify-center gap-2 py-3
                         border-2 border-dashed border-primary/40 rounded-lg
                         text-sm text-primary font-medium
                         hover:border-primary hover:bg-primary/10
                         transition-colors cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              {people.length > 0 ? 'Add another person' : 'Add a person'}
            </button>
          }
        />
      </div>

      <AddFromFriendsDialog
        open={friendsDialogOpen}
        onOpenChange={setFriendsDialogOpen}
        onAddPerson={onAddFromFriend}
        addedPeople={people}
      />

      <AddFromSquadDialog
        open={squadDialogOpen}
        onOpenChange={setSquadDialogOpen}
        onAddSquad={handleAddSquad}
        addedPeople={people}
      />

      {children}
    </Card>
  );
}
