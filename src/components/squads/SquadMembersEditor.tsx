import { useState } from 'react';
import { X, User } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SquadMember } from '@/types/squad.types';
import { useFriendSearch } from '@/hooks/useFriendSearch';

interface SquadMembersEditorProps {
  members: SquadMember[];
  onChange: (members: SquadMember[]) => void;
  excludeUserId?: string;
}

export function SquadMembersEditor({ members, onChange, excludeUserId }: SquadMembersEditorProps) {
  const [newMemberName, setNewMemberName] = useState('');
  const { filteredFriends, showSuggestions, setShowSuggestions } = useFriendSearch(newMemberName);

  const handleRemoveMember = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  return (
    <div className="border border-border rounded-md p-3 space-y-3 bg-card">
      <div className="relative">
        <Input
          placeholder="Search friends to add..."
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
                        venmoId: friend.venmoId,
                      };
                      const isDuplicate = members.some(
                        (m) =>
                          (m.id && m.id === newMember.id) ||
                          m.name.toLowerCase() === newMember.name.toLowerCase()
                      );
                      if (!isDuplicate) onChange([...members, newMember]);
                      setNewMemberName('');
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

      {members.length > 0 && (
        <div className="space-y-1 pt-2 max-h-[300px] overflow-y-auto">
          <Label className="text-xs text-muted-foreground">Current Members</Label>
          {members.map((member, index) => {
            if (excludeUserId && member.id === excludeUserId) return null;
            return (
              <div
                key={index}
                className="flex items-center justify-between p-2 bg-secondary/30 rounded text-sm"
              >
                <span className="font-medium">{member.name}</span>
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
            );
          })}
        </div>
      )}
    </div>
  );
}
