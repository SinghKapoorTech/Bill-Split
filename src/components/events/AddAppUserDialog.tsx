import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Mail, Loader2, Search, User } from 'lucide-react';
import { userService } from '@/services/userService';
import { UserProfile } from '@/types/person.types';
import { ScrollArea } from '@/components/ui/scroll-area';

export type SelectedMember = {
  id?: string;
  email?: string;
  name: string;
  username?: string;
  photoURL?: string;
};

interface AddAppUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddAppUser: (member: SelectedMember) => void;
  alreadySelectedIds: string[];
}

export function AddAppUserDialog({ open, onOpenChange, onAddAppUser, alreadySelectedIds }: AddAppUserDialogProps) {
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [isSearching, setIsSearching] = useState(false);

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
        // Filter out users already selected
        const filteredResults = results.filter(u => !alreadySelectedIds.includes(u.uid));
        setSearchResults(filteredResults);
      } catch (err) {
        console.error('Failed to search users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [searchInput, alreadySelectedIds]);

  const handleInviteEmail = () => {
    if (!isValidEmail(searchInput)) return;
    onAddAppUser({
      email: searchInput.trim().toLowerCase(),
      name: searchInput.trim().toLowerCase(),
    });
    setSearchInput('');
    onOpenChange(false);
  };

  const handleAddUser = (user: UserProfile) => {
    onAddAppUser({
      id: user.uid,
      name: user.displayName || user.username || 'User',
      username: user.username,
      photoURL: user.photoURL,
    });
    setSearchInput('');
    setSearchResults([]);
    onOpenChange(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValidEmail(searchInput)) {
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
          <DialogTitle>Add Member</DialogTitle>
          <DialogDescription>
            Search for an app user by username, or invite by email.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative z-50 pt-2 pb-4">
            <Search className="absolute left-2.5 top-5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Name, @username, or email..."
              className="pl-9"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyPress={handleKeyPress}
            />

            {/* SUGGESTIONS DROPDOWN */}
            {searchInput.trim().length >= 2 && searchResults.length > 0 ? (
              <div className="absolute top-[80px] left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-md flex flex-col overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b border-border">
                  <Label className="text-xs text-muted-foreground uppercase tracking-wider">App Users</Label>
                </div>
                <ScrollArea className="max-h-[250px] w-full">
                  <div className="p-2">
                    {searchResults.map((user) => (
                      <button
                        key={user.uid}
                        onClick={() => handleAddUser(user)}
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
               <div className="absolute top-[80px] left-0 right-0 z-50 bg-popover border border-border rounded-md shadow-md flex flex-col items-center justify-center p-4 text-center text-muted-foreground">
                  {isValidEmail(searchInput) ? (
                    <div className="w-full flex justify-between items-center px-2">
                       <span className="text-sm text-foreground">Invite {searchInput}</span>
                       <Button size="sm" onClick={handleInviteEmail}>
                         Invite
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
