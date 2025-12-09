import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Person } from '@/types';
import { PersonCard } from './PersonCard';
import { AddPersonForm } from './AddPersonForm';
import { AddFromFriendsDialog } from './AddFromFriendsDialog';
import { AddFromSquadDialog } from '@/components/squads/AddFromSquadDialog';
import { SaveAsSquadButton } from '@/components/squads/SaveAsSquadButton';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { convertSquadMembersToPeople } from '@/utils/squadUtils';
import { SquadMember } from '@/types/squad.types';
import { generateUserId } from '@/utils/billCalculations';

interface Friend {
  name: string;
  venmoId?: string;
}

interface Props {
  people: Person[];
  newPersonName: string;
  newPersonVenmoId: string;
  useNameAsVenmoId: boolean;
  onNameChange: (name: string) => void;
  onVenmoIdChange: (venmoId: string) => void;
  onUseNameAsVenmoIdChange: (checked: boolean) => void;
  onAdd: () => void;
  onAddFromFriend: (friend: Friend) => void;
  onRemove: (personId: string) => void;
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
  useNameAsVenmoId,
  onNameChange,
  onVenmoIdChange,
  onUseNameAsVenmoIdChange,
  onAdd,
  onAddFromFriend,
  onRemove,
  onSaveAsFriend,
  setPeople
}: Props) {
  const { user } = useAuth();
  const [showVenmoField, setShowVenmoField] = useState(false);
  const [friendsDialogOpen, setFriendsDialogOpen] = useState(false);
  const [squadDialogOpen, setSquadDialogOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);

  // Load friends list
  useEffect(() => {
    if (user) {
      loadFriends();
    }
  }, [user]);

  // Filter friends based on input
  useEffect(() => {
    if (newPersonName.trim().length > 0) {
      const filtered = friends.filter(friend =>
        friend.name.toLowerCase().startsWith(newPersonName.toLowerCase())
      );
      setFilteredFriends(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [newPersonName, friends]);

  const loadFriends = async () => {
    if (!user) return;

    try {
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists()) {
        const data = userDoc.data();
        setFriends(data.friends || []);
      }
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const handleAdd = () => {
    onAdd();
    setShowSuggestions(false);
  };

  const handleSelectFriend = (friend: Friend) => {
    onAddFromFriend(friend);
    onNameChange('');
    onVenmoIdChange('');
    setShowSuggestions(false);
  };

  const handleAddSquad = (members: SquadMember[]) => {
    const newPeople = convertSquadMembersToPeople(members);
    const existingIds = new Set(people.map(p => p.id));
    const uniqueNewPeople = newPeople.filter(p => !existingIds.has(p.id));
    setPeople([...people, ...uniqueNewPeople]);
  };

  const isPersonInFriends = (personName: string): boolean => {
    return friends.some(friend => friend.name.toLowerCase() === personName.toLowerCase());
  };

  const handleSaveAsFriend = async (person: Person) => {
    await onSaveAsFriend(person);
    await loadFriends();
  };

  return (
    <Card className="bill-card-tight">
      <div className="section-header">
        <Users className="icon-md-responsive icon-primary" />
        <h3 className="section-title-responsive">People</h3>
      </div>

      <AddPersonForm
        name={newPersonName}
        venmoId={newPersonVenmoId}
        useNameAsVenmoId={useNameAsVenmoId}
        showVenmoField={showVenmoField}
        onNameChange={onNameChange}
        onVenmoIdChange={onVenmoIdChange}
        onUseNameAsVenmoIdChange={onUseNameAsVenmoIdChange}
        onShowVenmoFieldChange={setShowVenmoField}
        onSubmit={handleAdd}
        friendSuggestions={filteredFriends}
        showSuggestions={showSuggestions}
        onSelectSuggestion={handleSelectFriend}
        onCloseSuggestions={() => setShowSuggestions(false)}
        onOpenFriendsDialog={() => setFriendsDialogOpen(true)}
        onOpenSquadDialog={() => setSquadDialogOpen(true)}
      />

      {people.length > 0 && (
        <>
          <div className="space-y-2 mb-4">
            {people.map((person) => {
              const isCurrentUser = user && person.id === generateUserId(user.uid);
              return (
                <PersonCard
                  key={person.id}
                  person={person}
                  isCurrentUser={!!isCurrentUser}
                  isInFriends={isPersonInFriends(person.name)}
                  onRemove={onRemove}
                  onSaveAsFriend={handleSaveAsFriend}
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
