import { useState } from 'react';
import { X, UserPlus, Mail, Phone, Ticket, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SquadMember } from '@/types/squad.types';
import { sanitizeSquadMember } from '@/utils/squadUtils';
import { useFriendSearch } from '@/hooks/useFriendSearch';

interface SquadMembersEditorProps {
  members: SquadMember[];
  onChange: (members: SquadMember[]) => void;
}

export function SquadMembersEditor({ members, onChange }: SquadMembersEditorProps) {
  const [newMemberName, setNewMemberName] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberPhone, setNewMemberPhone] = useState('');
  const [newMemberVenmoId, setNewMemberVenmoId] = useState('');
  const [showExtraFields, setShowExtraFields] = useState(false);

  const { filteredFriends, showSuggestions, setShowSuggestions } = useFriendSearch(newMemberName);

  const handleAddMember = () => {
    if (!newMemberName.trim()) return;

    const newMember: SquadMember = sanitizeSquadMember({
      name: newMemberName,
      email: newMemberEmail.trim() || undefined,
      phoneNumber: newMemberPhone.trim() || undefined,
      venmoId: newMemberVenmoId.replace(/^@+/, '').trim() || undefined,
    });

    const isDuplicate = members.some(
      (m) =>
        m.name.toLowerCase() === newMember.name.toLowerCase() ||
        (m.email && newMember.email && m.email.toLowerCase() === newMember.email.toLowerCase()) ||
        (m.phoneNumber && newMember.phoneNumber && m.phoneNumber === newMember.phoneNumber)
    );

    if (!isDuplicate) onChange([...members, newMember]);

    setNewMemberName('');
    setNewMemberEmail('');
    setNewMemberPhone('');
    setNewMemberVenmoId('');
    setShowExtraFields(false);
  };

  const handleRemoveMember = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-3 bg-card">
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              placeholder="Search for users or type guest name..."
              value={newMemberName}
              onChange={(e) => setNewMemberName(e.target.value)}
              className="w-full"
            />
            {showSuggestions && filteredFriends.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col overflow-hidden z-50">
                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">
                    Search Results
                  </Label>
                </div>
                <ScrollArea className="max-h-[200px] w-full">
                  <div className="p-2">
                    {filteredFriends.map((friend, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          const newMember: SquadMember = {
                            id: friend.id,
                            name: friend.name,
                            email: friend.email,
                            venmoId: friend.venmoId,
                          };
                          const isDuplicate = members.some(
                            (m) =>
                              (m.id && m.id === newMember.id) ||
                              m.name.toLowerCase() === newMember.name.toLowerCase()
                          );
                          if (!isDuplicate) onChange([...members, newMember]);
                          setNewMemberName('');
                          setNewMemberEmail('');
                          setNewMemberPhone('');
                          setNewMemberVenmoId('');
                          setShowSuggestions(false);
                        }}
                        className="w-full text-left flex items-center p-2 rounded-md border border-border/40 bg-card hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all mb-1.5 cursor-pointer h-12"
                      >
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 mr-3 flex-shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex flex-col flex-1 overflow-hidden">
                          <span className="text-sm font-medium truncate">{friend.name}</span>
                          {friend.username && (
                            <span className="text-xs text-muted-foreground truncate">
                              @{friend.username}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          <Button
            onClick={handleAddMember}
            variant="secondary"
            size="icon"
            type="button"
            disabled={!newMemberName.trim()}
          >
            <UserPlus className="w-4 h-4" />
          </Button>
        </div>

        {!showExtraFields ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowExtraFields(true)}
            className="text-xs text-muted-foreground h-auto py-1"
            type="button"
          >
            + Add Guest Contact Info (Email/Phone/Venmo)
          </Button>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1">
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Email"
                className="pl-9 text-xs"
                value={newMemberEmail}
                onChange={(e) => setNewMemberEmail(e.target.value)}
              />
            </div>
            <div className="relative">
              <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Phone"
                className="pl-9 text-xs"
                value={newMemberPhone}
                onChange={(e) => setNewMemberPhone(e.target.value)}
              />
            </div>
            <div className="relative">
              <Ticket className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Venmo ID"
                className="pl-9 text-xs"
                value={newMemberVenmoId}
                onChange={(e) => setNewMemberVenmoId(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {members.length > 0 && (
        <div className="space-y-1 pt-2 max-h-[200px] overflow-y-auto">
          <Label className="text-xs text-muted-foreground">Current Members</Label>
          {members.map((member, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 bg-secondary/30 rounded text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">{member.name}</span>
                <div className="flex gap-2 text-xs text-muted-foreground">
                  {member.email && (
                    <span className="flex items-center gap-0.5">
                      <Mail className="w-3 h-3" /> {member.email}
                    </span>
                  )}
                  {member.phoneNumber && (
                    <span className="flex items-center gap-0.5">
                      <Phone className="w-3 h-3" /> {member.phoneNumber}
                    </span>
                  )}
                  {member.venmoId && (
                    <span className="flex items-center gap-0.5">
                      <Ticket className="w-3 h-3" /> {member.venmoId}
                    </span>
                  )}
                  {!member.email && !member.phoneNumber && !member.venmoId && (
                    <span>No contact info</span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveMember(index)}
                type="button"
                className="h-8 w-8 p-0"
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
