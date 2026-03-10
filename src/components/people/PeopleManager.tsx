import { useState, useMemo } from 'react';
import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Person } from '@/types';
import { PersonCard } from './PersonCard';
import { InlinePersonSearch } from './InlinePersonSearch';
import { UserPlus, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddFromSquadDialog } from '@/components/squads/AddFromSquadDialog';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { convertSquadMembersToPeople } from '@/utils/squadUtils';
import { SquadMember } from '@/types/squad.types';
import { generateUserId } from '@/utils/billCalculations';
import { useFriendSearch, FriendSuggestion } from '@/hooks/useFriendSearch';
import { useSquadManager } from '@/hooks/useSquadManager';

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
}

/**
 * PeopleManager Component (Refactored)
 * Orchestrates person management using PersonCard and AddPersonForm
 * Reduced from 394 lines to ~150 lines
 */
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
  children
}: Props) {
  const { user } = useAuth();
  const [squadDialogOpen, setSquadDialogOpen] = useState(false);
  const { friends, filteredFriends, isSearching, loadFriends } = useFriendSearch(newPersonName);
  const { squads } = useSquadManager();

  const existingPeopleIds = useMemo(
    () => new Set(people.map(p => p.id)),
    [people]
  );

  const handleAddFromFriend = (friend: FriendSuggestion) => {
    onAddFromFriend(friend);
    onNameChange('');
  };

  const handleAddGuest = (name: string) => {
    onAdd(name, '');
    onNameChange('');
  };

  const handleAddSquad = (members: SquadMember[]) => {
    const newPeople = convertSquadMembersToPeople(members);
    const existingIds = new Set(people.map(p => p.id));
    const uniqueNewPeople = newPeople.filter(p => !existingIds.has(p.id));
    setPeople([...people, ...uniqueNewPeople]);
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
    <div className="flex flex-col gap-2">
      {/* Add People Section */}
      <div className="rounded-2xl bg-card border border-blue-200/60 dark:border-blue-800/40 p-4 shadow-sm mb-2">
        <div className="flex gap-2">
          <div className="flex-1">
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
          <Button
            onClick={() => setSquadDialogOpen(true)}
            variant="outline"
            className="h-11 px-4 border border-border/50 bg-card hover:bg-muted/50 font-medium shadow-sm transition-colors text-foreground"
          >
            <Users className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Squads</span>
          </Button>
        </div>
      </div>

      {/* People List Section */}
      <div className="rounded-2xl bg-card border border-border/50 shadow-sm p-4">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 bg-secondary rounded-full flex items-center justify-center">
              <Users className="h-4 w-4 text-foreground/70" />
            </div>
            <h3 className="font-semibold text-base">People</h3>
          </div>
          <div className="bg-secondary text-secondary-foreground text-xs font-semibold px-2 py-0.5 rounded-full">
            {people.length}
          </div>
        </div>

        {people.length > 0 ? (
          <div className="space-y-2 mb-4">
            {people.map((person) => {
              const isCurrentUser = Boolean(user && (person.id === user.uid || person.id === generateUserId(user.uid) || (person as Person & { userId?: string }).userId === user.uid));
              return (
                <div key={person.id} className="rounded-2xl border border-border/40 bg-card/60 backdrop-blur-md shadow-sm transition-all hover:shadow-md overflow-hidden">
                  <PersonCard
                    person={person}
                    isCurrentUser={!!isCurrentUser}
                    isInFriends={isPersonInFriends(person)}
                    onRemove={onRemove}
                    onUpdate={onUpdate}
                    onSaveAsFriend={handleSaveAsFriend}
                    onRemoveFriend={handleRemoveFriend}
                    existingNames={existingNames}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            Add people to start splitting the bill
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
