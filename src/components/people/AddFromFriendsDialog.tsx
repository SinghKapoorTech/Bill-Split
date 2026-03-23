import { useState, useEffect, useMemo } from 'react';
import { UserCheck, UserPlus, Search, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import { userService } from '@/services/userService';
import { Person } from '@/types';
import { UserAvatar } from '@/components/shared/UserAvatar';

interface Friend {
  id?: string;
  name: string;
  venmoId?: string;
  email?: string;
  username?: string;
  photoURL?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPerson: (friend: Friend) => void;
  addedPeople?: Person[];
}

export function AddFromFriendsDialog({ open, onOpenChange, onAddPerson, addedPeople = [] }: Props) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (open && user) {
      loadFriends();
      setSearch('');
    }
  }, [open, user]);

  const loadFriends = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const hydratedFriends = await userService.getHydratedFriends(user.uid, false);
      setFriends(hydratedFriends);
    } catch (error) {
      console.error('Error loading friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const addedNames = useMemo(
    () => new Set(addedPeople.map(p => p.name.toLowerCase())),
    [addedPeople]
  );

  const addedIds = useMemo(
    () => new Set(addedPeople.map(p => p.id)),
    [addedPeople]
  );

  const isAlreadyAdded = (friend: Friend): boolean => {
    if (friend.id && addedIds.has(friend.id)) return true;
    return addedNames.has(friend.name.toLowerCase());
  };

  const filteredFriends = useMemo(() => {
    if (!search.trim()) return friends;
    const q = search.toLowerCase();
    return friends.filter(f =>
      f.name.toLowerCase().includes(q) ||
      f.venmoId?.toLowerCase().includes(q)
    );
  }, [friends, search]);

  const handleAddFriend = (friend: Friend) => {
    onAddPerson(friend);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="w-5 h-5" />
            Add from Friends
          </DialogTitle>
          <DialogDescription>
            Tap a friend to add them to the bill
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading friends...
            </p>
          ) : friends.length === 0 ? (
            <div className="text-center py-8">
              <UserCheck className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-1">
                No friends saved yet
              </p>
              <p className="text-xs text-muted-foreground/70">
                Add people to a bill and tap the heart icon to save them as friends
              </p>
            </div>
          ) : (
            <>
              {friends.length > 4 && (
                <div className="relative mb-3">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search friends..."
                    className="pl-9 h-9"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              )}
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-1.5">
                  {filteredFriends.map((friend, index) => {
                    const added = isAlreadyAdded(friend);
                    return (
                      <div
                        key={friend.id || index}
                        className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
                          added
                            ? 'bg-secondary/30 opacity-60'
                            : 'bg-secondary/30 hover:bg-secondary/50 cursor-pointer'
                        }`}
                        onClick={() => !added && handleAddFriend(friend)}
                      >
                        <UserAvatar
                          name={friend.name}
                          photoURL={friend.photoURL}
                          size="sm"
                          fallbackClassName="text-xs font-semibold bg-primary/15 text-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{friend.name}</p>
                          {friend.venmoId && (
                            <p className="text-xs text-muted-foreground truncate">
                              @{friend.venmoId.replace(/^@+/, '')}
                            </p>
                          )}
                        </div>
                        {added ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Check className="w-3.5 h-3.5" />
                            Added
                          </span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="shrink-0 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddFriend(friend);
                            }}
                          >
                            <UserPlus className="w-4 h-4 mr-1" />
                            Add
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {filteredFriends.length === 0 && search.trim() && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No friends matching "{search}"
                    </p>
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
