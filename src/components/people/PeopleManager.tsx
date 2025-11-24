import { useState, useEffect, useRef } from 'react';
import { Users, UserPlus, Trash2, UserCheck, ChevronDown, Check, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Person } from '@/types';
import { AddFromFriendsDialog } from './AddFromFriendsDialog';
import { AddFromSquadDialog } from '@/components/squads/AddFromSquadDialog';
import { SaveAsSquadButton } from '@/components/squads/SaveAsSquadButton';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { convertSquadMembersToPeople } from '@/utils/squadUtils';
import { SquadMember } from '@/types/squad.types';
import { UserVenmoIdEditor } from './UserVenmoIdEditor';
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
  const [venmoPopoverOpen, setVenmoPopoverOpen] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredFriends, setFilteredFriends] = useState<Friend[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

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

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setShowVenmoField(false);
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

    // Always append to existing people list
    setPeople([...people, ...newPeople]);
  };

  const isPersonInFriends = (personName: string): boolean => {
    return friends.some(friend => friend.name.toLowerCase() === personName.toLowerCase());
  };

  const handleSaveAsFriend = async (person: Person) => {
    await onSaveAsFriend(person);
    // Reload friends list to update the heart icon state
    await loadFriends();
  };

  return (
    <Card className="p-3 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-4 h-4 md:w-5 md:h-5 text-primary" />
        <h3 className="text-lg md:text-xl font-semibold">People</h3>
      </div>

      <div className="space-y-3 mb-4">
        {/* Row 1: Name Input + Venmo Options + Add Button */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              placeholder="Person's name"
              value={newPersonName}
              onChange={(e) => onNameChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !showVenmoField && handleAdd()}
              className="w-full text-xs placeholder:text-xs"
            />
            {showSuggestions && filteredFriends.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-[200px] overflow-y-auto"
              >
                {filteredFriends.map((friend, index) => (
                  <div
                    key={index}
                    onClick={() => handleSelectFriend(friend)}
                    className="px-3 py-2 cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors"
                  >
                    <div className="font-medium">{friend.name}</div>
                    {friend.venmoId && (
                      <div className="text-xs text-muted-foreground">
                        @{friend.venmoId}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Popover open={venmoPopoverOpen} onOpenChange={setVenmoPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`hover:bg-secondary shrink-0 text-xs whitespace-nowrap ${
                  useNameAsVenmoId || showVenmoField ? 'bg-primary/10' : ''
                }`}
              >
                {useNameAsVenmoId
                  ? 'Use name'
                  : showVenmoField
                  ? 'Add Ve...'
                  : 'Venmo ID'}
                <ChevronDown className="ml-1 h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <div className="p-2 space-y-1">
                <div
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-md cursor-pointer transition-all ${
                    showVenmoField && !useNameAsVenmoId
                      ? 'bg-primary/10 hover:bg-primary/20'
                      : 'hover:bg-secondary'
                  }`}
                  onClick={() => {
                    if (showVenmoField && !useNameAsVenmoId) {
                      // Deselect if already selected
                      setShowVenmoField(false);
                    } else {
                      // Select this option
                      onUseNameAsVenmoIdChange(false);
                      setShowVenmoField(true);
                    }
                    setVenmoPopoverOpen(false);
                  }}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      showVenmoField && !useNameAsVenmoId
                        ? 'bg-primary border-primary'
                        : 'border-input'
                    }`}
                  >
                    {showVenmoField && !useNameAsVenmoId && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <span className="text-sm font-medium flex-1">
                    Add Venmo ID
                  </span>
                </div>
                <div
                  className={`flex items-center space-x-3 px-3 py-2.5 rounded-md cursor-pointer transition-all ${
                    useNameAsVenmoId
                      ? 'bg-primary/10 hover:bg-primary/20'
                      : 'hover:bg-secondary'
                  }`}
                  onClick={() => {
                    if (useNameAsVenmoId) {
                      // Deselect if already selected
                      onUseNameAsVenmoIdChange(false);
                    } else {
                      // Select this option
                      onUseNameAsVenmoIdChange(true);
                      setShowVenmoField(false);
                    }
                    setVenmoPopoverOpen(false);
                  }}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                      useNameAsVenmoId
                        ? 'bg-primary border-primary'
                        : 'border-input'
                    }`}
                  >
                    {useNameAsVenmoId && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <span className="text-sm font-medium flex-1">
                    Use name as Venmo ID
                  </span>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Button onClick={handleAdd} variant="success" className="shrink-0">
            <UserPlus className="w-4 h-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Row 2: Friends + Squad Buttons */}
        {showVenmoField && !useNameAsVenmoId && (
          <Input
            id="venmoId"
            placeholder="Enter Venmo username (without @)"
            value={newPersonVenmoId}
            onChange={(e) => onVenmoIdChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            className='text-xs placeholder:text-xs'
          />
        )}
        <div className="flex gap-2">
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
            Squad
          </Button>
        </div>
      </div>

      {people.length > 0 && (
        <>
          <div className="space-y-2 mb-4">
            {people.map((person) => {
              const isCurrentUser = user && person.id === generateUserId(user.uid);
              
              return (
                <div
                  key={person.id}
                  className={`flex items-center justify-between p-2 md:p-3 rounded-lg ${
                    isCurrentUser ? 'bg-primary/10 border border-primary/20' : 'bg-secondary/50'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm md:text-base font-medium">{person.name}</span>
                      {isCurrentUser && (
                        <span className="px-2 py-0.5 text-xs font-semibold bg-primary text-primary-foreground rounded-full">
                          You
                        </span>
                      )}
                    </div>
                    {isCurrentUser ? (
                      <UserVenmoIdEditor currentVenmoId={person.venmoId} />
                    ) : (
                      person.venmoId && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (@{person.venmoId})
                        </span>
                      )
                    )}
                  </div>
                  <div className="flex gap-1">
                    {!isCurrentUser && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => !isPersonInFriends(person.name) && handleSaveAsFriend(person)}
                        title={isPersonInFriends(person.name) ? "Already a friend" : "Save as friend"}
                        className="hover:bg-transparent"
                        disabled={isPersonInFriends(person.name)}
                      >
                        <Heart className={`w-4 h-4 text-red-500 ${isPersonInFriends(person.name) ? 'fill-red-500' : ''}`} />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(person.id)}
                      title={isCurrentUser ? "Cannot remove yourself" : "Remove person"}
                      disabled={isCurrentUser}
                      className={isCurrentUser ? 'opacity-50 cursor-not-allowed' : ''}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
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
