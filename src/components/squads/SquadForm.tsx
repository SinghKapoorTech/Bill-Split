import { useState, useEffect, useRef } from 'react';
import { X, UserPlus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { SquadMember } from '@/types/squad.types';
import { sanitizeSquadMember } from '@/utils/squadUtils';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface SquadFormProps {
  initialName?: string;
  initialDescription?: string;
  initialMembers?: SquadMember[];
  onSubmit: (name: string, description: string, members: SquadMember[]) => void;
  submitLabel?: string;
}

export function SquadForm({
  initialName = '',
  initialDescription = '',
  initialMembers = [],
  onSubmit,
  submitLabel = 'Create Squad',
}: SquadFormProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [members, setMembers] = useState<SquadMember[]>(initialMembers);
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberVenmoId, setNewMemberVenmoId] = useState('');
  const [showVenmoField, setShowVenmoField] = useState(false);

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;

    const newMember: SquadMember = sanitizeSquadMember({
      name: newMemberName,
      venmoId: newMemberVenmoId.trim() || undefined,
    });

    // Check for duplicates - compare by name and venmoId
    const isDuplicate = members.some(
      (member) =>
        member.name.toLowerCase() === newMember.name.toLowerCase() &&
        member.venmoId?.toLowerCase() === newMember.venmoId?.toLowerCase()
    );

    if (!isDuplicate) {
      setMembers([...members, newMember]);
    }

    setNewMemberName('');
    setNewMemberVenmoId('');
    setShowVenmoField(false);
  };

  const handleRemoveMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    onSubmit(name, description, members);
  };

  const isValid = name.trim().length > 0 && members.length >= 2;

  return (
    <div className="space-y-4">
      <SquadNameField value={name} onChange={setName} />
      <SquadDescriptionField value={description} onChange={setDescription} />
      <SquadMemberSelector
        members={members}
        setMembers={setMembers}
        newMemberName={newMemberName}
        newMemberVenmoId={newMemberVenmoId}
        showVenmoField={showVenmoField}
        onNewMemberNameChange={setNewMemberName}
        onNewMemberVenmoIdChange={setNewMemberVenmoId}
        onShowVenmoFieldChange={setShowVenmoField}
        onAddMember={handleAddMember}
        onRemoveMember={handleRemoveMember}
      />
      <Button onClick={handleSubmit} variant="success" disabled={!isValid} className="w-full">
        {submitLabel}
      </Button>
      {!isValid && members.length < 2 && (
        <p className="text-xs text-muted-foreground text-center">
          Add at least 2 members to create a squad
        </p>
      )}
    </div>
  );
}

interface SquadNameFieldProps {
  value: string;
  onChange: (value: string) => void;
}

function SquadNameField({ value, onChange }: SquadNameFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="squad-name">Squad Name *</Label>
      <Input
        id="squad-name"
        placeholder="e.g., College Friends, Roommates, Game Night Crew"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={50}
        autoFocus
      />
    </div>
  );
}

interface SquadDescriptionFieldProps {
  value: string;
  onChange: (value: string) => void;
}

function SquadDescriptionField({ value, onChange }: SquadDescriptionFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor="squad-description">Description (Optional)</Label>
      <Textarea
        id="squad-description"
        placeholder="Add details about this squad..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </div>
  );
}

interface Friend {
  name: string;
  venmoId?: string;
}

interface SquadMemberSelectorProps {
  members: SquadMember[];
  setMembers: React.Dispatch<React.SetStateAction<SquadMember[]>>;
  newMemberName: string;
  newMemberVenmoId: string;
  showVenmoField: boolean;
  onNewMemberNameChange: (value: string) => void;
  onNewMemberVenmoIdChange: (value: string) => void;
  onShowVenmoFieldChange: (value: boolean) => void;
  onAddMember: () => void;
  onRemoveMember: (index: number) => void;
}

function SquadMemberSelector({
  members,
  setMembers,
  newMemberName,
  newMemberVenmoId,
  showVenmoField,
  onNewMemberNameChange,
  onNewMemberVenmoIdChange,
  onShowVenmoFieldChange,
  onAddMember,
  onRemoveMember,
}: SquadMemberSelectorProps) {
  const { user } = useAuth();
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
    if (newMemberName.trim().length > 0) {
      const filtered = friends.filter(friend =>
        friend.name.toLowerCase().startsWith(newMemberName.toLowerCase())
      );
      setFilteredFriends(filtered);
      setShowSuggestions(filtered.length > 0);
    } else {
      setShowSuggestions(false);
    }
  }, [newMemberName, friends]);

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

  const handleSelectFriend = (friend: Friend) => {
    // Add the friend directly to members list
    const newMember: SquadMember = sanitizeSquadMember({
      name: friend.name,
      venmoId: friend.venmoId,
    });

    // Check for duplicates - compare by name and venmoId
    const isDuplicate = members.some(
      (member) =>
        member.name.toLowerCase() === newMember.name.toLowerCase() &&
        member.venmoId?.toLowerCase() === newMember.venmoId?.toLowerCase()
    );

    if (!isDuplicate) {
      setMembers([...members, newMember]);
    }

    // Clear input fields
    onNewMemberNameChange('');
    onNewMemberVenmoIdChange('');
    setShowSuggestions(false);
  };

  return (
    <div className="space-y-2">
      <Label>Members *</Label>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Input
            ref={inputRef}
            placeholder="Member name"
            value={newMemberName}
            onChange={(e) => onNewMemberNameChange(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !showVenmoField && onAddMember()}
            className="flex-1"
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
        <Button onClick={onAddMember} variant="success" size="icon" type="button">
          <UserPlus className="w-4 h-4" />
        </Button>
      </div>

      {showVenmoField && (
        <Input
          placeholder="Venmo username (without @)"
          value={newMemberVenmoId}
          onChange={(e) => onNewMemberVenmoIdChange(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && onAddMember()}
          className="text-sm"
        />
      )}

      <Badge
        variant={showVenmoField ? 'default' : 'outline'}
        className="cursor-pointer px-3 py-1 text-xs hover:opacity-80 transition-opacity"
        onClick={() => onShowVenmoFieldChange(!showVenmoField)}
      >
        Add Venmo ID
      </Badge>



      {members.length > 0 && (
        <div className="space-y-1 max-h-[200px] overflow-y-auto border border-border rounded-md p-2">
          {members.map((member, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-secondary/30 rounded"
            >
              <div className="flex-1">
                <span className="text-sm font-medium">{member.name}</span>
                {member.venmoId && (
                  <span className="text-xs text-muted-foreground ml-2">
                    @{member.venmoId}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemoveMember(index)}
                type="button"
                aria-label={`Remove ${member.name}`}
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
