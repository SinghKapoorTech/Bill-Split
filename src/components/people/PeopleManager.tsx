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
import { userService } from '@/services/userService';

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
  onAdd: () => void;
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
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);

  // Load friends list
  useEffect(() => {
    if (user) {
      loadFriends();
    }
  }, [user]);

  // Filter friends based on input and search global users if email or username prefix
  useEffect(() => {
    const searchInput = newPersonName.trim();
    if (searchInput.length > 0) {
      // 1. Filter local friends
      const filtered = friends.filter(friend =>
        friend?.name?.toLowerCase().includes(searchInput.toLowerCase())
      );
      
      // 2. Global search if it looks like an email
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(searchInput);
      
      // 3. Or if it's at least 2 chars, do a global username search
      const shouldSearchGlobal = isEmail || searchInput.length >= 2;

      if (shouldSearchGlobal) {
        // We use a small debounce effect implicitly by tracking the active request
        let isActive = true;

        const performSearch = async () => {
          try {
            let globalUsers = [];
            
            if (isEmail) {
              const userByEmail = await userService.getUserByContact(searchInput);
              if (userByEmail) {
                globalUsers.push(userByEmail);
              }
            } else {
              // Not an email, so we do a prefix search on username
              globalUsers = await userService.searchUsersByUsername(searchInput);
            }

            if (!isActive) return;

            const newFiltered = [...filtered];

            for (const globalUser of globalUsers) {
              // Skip if this is the currently logged-in user
              if (user && globalUser.uid === user.uid) {
                continue;
              }

              const potentialFriendId = globalUser.uid;
              
              // Check if they are already in the friend suggestions
              const alreadyInFriends = newFiltered.some(f => 
                f.email === globalUser.email || 
                (f.id && f.id === globalUser.uid) ||
                (f.id && f.id === potentialFriendId)
              );
              
              if (!alreadyInFriends) {
                // Add to suggestion list with a special flag/email/username
                newFiltered.push({
                  id: potentialFriendId,
                  name: globalUser.displayName || 'App User',
                  venmoId: globalUser.venmoId,
                  email: globalUser.email,
                  username: globalUser.username
                });
              }
            }
            
            setFilteredFriends(newFiltered);
            setShowSuggestions(newFiltered.length > 0);
          } catch (err) {
            console.error("Global search failed", err);
            if (isActive) {
              setFilteredFriends(filtered);
              setShowSuggestions(filtered.length > 0);
            }
          }
        };

        performSearch();

        return () => {
          isActive = false;
        };
      } else {
        setFilteredFriends(filtered);
        setShowSuggestions(filtered.length > 0);
      }
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
    // Dialog handles its own close state now
  };

  const handleManualAdd = (name: string, venmoId: string) => {
    onNameChange(name);
    onVenmoIdChange(venmoId);
    // Use timeout to ensure state is set before onAdd is called, since useState is async
    setTimeout(() => {
        onAdd();
    }, 0);
  };

  const handleAddSquad = (members: SquadMember[]) => {
    const newPeople = convertSquadMembersToPeople(members);
    const existingIds = new Set(people.map(p => p.id));
    const uniqueNewPeople = newPeople.filter(p => !existingIds.has(p.id));
    setPeople([...people, ...uniqueNewPeople]);
  };

  const isPersonInFriends = (personName: string): boolean => {
    if (!personName) return false;
    return friends.some(friend => friend?.name?.toLowerCase() === personName.toLowerCase());
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
                  isInFriends={isPersonInFriends(person.name)}
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
