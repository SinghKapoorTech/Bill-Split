import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Mail, Loader2, Search, User } from 'lucide-react';
import { TripEvent } from '@/types/event.types';
import { useEventInvites } from '@/hooks/useEventInvites';
import { userService } from '@/services/userService';
import { UserProfile } from '@/types/person.types';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface InviteMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: TripEvent;
  memberProfiles?: Record<string, any>;
}

export function InviteMembersDialog({ open, onOpenChange, event, memberProfiles }: InviteMembersDialogProps) {
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const { inviteMember, addExistingMember, isInviting } = useEventInvites(event.id);

  // Debounce search
  useEffect(() => {
    if (searchInput.trim().length < 2) {
      setSearchResults([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await userService.searchUsersByUsername(searchInput);
        // Filter out users already in the event
        const filteredResults = results.filter(u => !event.memberIds.includes(u.uid));
        setSearchResults(filteredResults);
      } catch (err) {
        console.error('Failed to search users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchInput, event.memberIds]);

  const handleInviteEmail = async () => {
    if (!isValidEmail(searchInput)) return;
    const success = await inviteMember(searchInput.trim().toLowerCase());
    if (success) {
      setSearchInput('');
    }
  };

  const handleAddUser = async (user: UserProfile) => {
    if (isInviting) return;
    const success = await addExistingMember(user.uid);
    if (success) {
      setSearchInput('');
      setSearchResults([]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isInviting && isValidEmail(searchInput)) {
      handleInviteEmail();
    }
  };

  const isValidEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  };

  const isEmailInputPattern = /@/.test(searchInput);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Members</DialogTitle>
          <DialogDescription>
            Search for an app user by username, or invite by email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative z-50 pt-2">
            <Search className="absolute left-2.5 top-5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Name, @username, or email..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isInviting}
            />

            {/* SUGGESTIONS DROPDOWN */}
            {searchInput.trim().length >= 2 && searchResults.length > 0 ? (
              <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">App Users</Label>
                </div>
                <ScrollArea className="max-h-[250px] w-full">
                  <div className="p-2">
                    {searchResults.map((user) => (
                      <button
                        key={user.uid}
                        onClick={() => handleAddUser(user)}
                        disabled={isInviting}
                        className="w-full text-left flex items-center p-2 rounded-md border border-border/40 bg-card hover:border-primary/30 hover:bg-accent/50 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all mb-1.5 cursor-pointer h-12"
                      >
                        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 mr-3 flex-shrink-0">
                          <User className="h-4 w-4 text-primary" />
                        </div>
                        
                        <div className="flex flex-col flex-1 overflow-hidden">
                          <span className="text-sm font-medium truncate">{user.displayName || user.username}</span>
                          {user.username && (
                            <span className="text-xs text-muted-foreground truncate">
                              @{user.username}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            ) : searchInput.trim().length >= 2 && !isSearching ? (
               <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
                  {isValidEmail(searchInput) ? (
                    <div className="w-full flex justify-between items-center px-2">
                       <span className="text-sm">Invite {searchInput}</span>
                       <Button size="sm" onClick={handleInviteEmail} disabled={isInviting}>
                         {isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Invite'}
                       </Button>
                    </div>
                  ) : (
                    <>
                      <User className="h-8 w-8 mb-2 opacity-50" />
                      <p className="text-sm">No users found.</p>
                      {isEmailInputPattern ? (
                        <p className="text-xs mt-1 text-destructive">Please enter a valid email address.</p>
                      ) : (
                        <p className="text-xs mt-1">Enter a valid email address to invite them.</p>
                      )}
                    </>
                  )}
               </div>
            ) : null}
          </div>

          {/* Pending Invitations */}
          {event.pendingInvites && event.pendingInvites.length > 0 && (
            <div className="space-y-2 mt-4">
              <Label className="text-sm text-muted-foreground">Pending Invitations</Label>
              <div className="space-y-1">
                {event.pendingInvites.map((inviteEmail) => (
                  <div
                    key={inviteEmail}
                    className="flex items-center justify-between p-2 rounded-md bg-muted/50"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm">{inviteEmail}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">Pending</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Current Members */}
          <div className="space-y-2 mt-4">
            <Label className="text-sm text-muted-foreground">
              Members ({event.memberIds.length})
            </Label>
            <ScrollArea className="max-h-[250px] w-full mt-2 pr-4">
              <div className="flex flex-col gap-2 p-1">
                {event.memberIds.map(id => {
                  const profile = memberProfiles?.[id];
                  const name = profile?.displayName || profile?.username || 'Unknown Member';
                  const initials = name.substring(0, 2).toUpperCase();
                  return (
                    <div key={id} className="flex items-center gap-3 p-2 rounded-md bg-muted/30 border border-border/40">
                      <Avatar className="w-8 h-8 shadow-sm border border-border/50">
                        <AvatarImage src={profile?.photoURL} />
                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col flex-1 overflow-hidden">
                        <span className="text-sm text-foreground font-medium truncate">{name}</span>
                        {profile?.username && (
                          <span className="text-xs text-muted-foreground truncate">@{profile.username}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
