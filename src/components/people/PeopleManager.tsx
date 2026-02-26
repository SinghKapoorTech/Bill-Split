import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Person } from '@/types';
import { PersonCard } from './PersonCard';
import { AddPersonDialog } from './AddPersonDialog';
import { AddFromFriendsDialog } from './AddFromFriendsDialog';
import { UserPlus, UserCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddFromSquadDialog } from '@/components/squads/AddFromSquadDialog';
import { SaveAsSquadButton } from '@/components/squads/SaveAsSquadButton';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
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
  onSaveAsFriend: (person: Person) => void;
  setPeople: React.Dispatch<React.SetStateAction<Person[]>>;
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
  setPeople
}: Props) {
  const { user } = useAuth();
  const [isAddPersonOpen, setIsAddPersonOpen] = useState(false);
  const [friendsDialogOpen, setFriendsDialogOpen] = useState(false);
  const [squadDialogOpen, setSquadDialogOpen] = useState(false);
  
  const { friends, filteredFriends, setShowSuggestions, loadFriends } = useFriendSearch(newPersonName);

  const handleAdd = () => {
    onAdd();
    setShowSuggestions(false);
  };

  const handleSelectFriend = (friend: Friend) => {
    onAddFromFriend(friend);
    onNameChange('');
    onVenmoIdChange('');
    // Dialog handles its own close state now
  };

  const handleManualAdd = (name: string, venmoId: string) => {
    onNameChange(name);
    onVenmoIdChange(venmoId);
    // Directly pass the name and venmoId to bypass async state update race condition
    onAdd(name, venmoId);
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

  const handleSaveAsFriend = async (person: Person) => {
    await onSaveAsFriend(person);
    await loadFriends();
  };

  const existingNames = people.map(p => p.name);

  return (
    <Card className="bill-card-tight">
      <div className="section-header">
        <Users className="icon-md-responsive icon-primary" />
        <h3 className="section-title-responsive">People</h3>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="w-full sm:flex-1">
          <AddPersonDialog
            isOpen={isAddPersonOpen}
            setIsOpen={setIsAddPersonOpen}
            friendSuggestions={filteredFriends}
            onSearchChange={onNameChange}
            onSelectSuggestion={handleSelectFriend}
            onAddManual={handleManualAdd}
          />
        </div>
        <div className="flex gap-2 w-full sm:flex-1">
          <Button
              onClick={() => setFriendsDialogOpen(true)}
              variant="outline"
              className="flex-1"
          >
              <UserCheck className="w-4 h-4 mr-2" />
              Friends
          </Button>
          <Button
              onClick={() => setSquadDialogOpen(true)}
              variant="outline"
              className="flex-1"
          >
              <Users className="w-4 h-4 mr-2" />
              Squads
          </Button>
        </div>
      </div>

      {people.length > 0 && (
        <>
          <div className="space-y-2 mb-4">
            {people.map((person) => {
              const isCurrentUser = user && (person.id === user.uid || (person as any).userId === user.uid);
              return (
                <PersonCard
                  key={person.id}
                  person={person}
                  isCurrentUser={!!isCurrentUser}
                  isInFriends={isPersonInFriends(person)}
                  onRemove={onRemove}
                  onUpdate={onUpdate}
                  onSaveAsFriend={handleSaveAsFriend}
                  existingNames={existingNames}
                />
              );
            })}
          </div>
          <div className="flex justify-end">
            <SaveAsSquadButton people={people} />
          </div>
        </>
      )}

      {people.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          Add people to start splitting the bill
        </p>
      )}

      <AddFromFriendsDialog
        open={friendsDialogOpen}
        onOpenChange={setFriendsDialogOpen}
        onAddPerson={onAddFromFriend}
      />

      <AddFromSquadDialog
        open={squadDialogOpen}
        onOpenChange={setSquadDialogOpen}
        onAddSquad={handleAddSquad}
      />
    </Card>
  );
}
