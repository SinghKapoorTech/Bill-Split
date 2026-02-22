import { useState, useEffect } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { userService } from '@/services/userService';

interface Friend {
  id?: string;
  name: string;
  venmoId?: string;
  email?: string;
  username?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddPerson: (friend: Friend) => void;
}

export function AddFromFriendsDialog({ open, onOpenChange, onAddPerson }: Props) {
  const { user } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && user) {
      loadFriends();
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

  const handleAddFriend = (friend: Friend) => {
    onAddPerson(friend);
    onOpenChange(false);
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
            Select a friend from your saved list to add them to the bill
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading friends...
            </p>
          ) : friends.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground mb-2">
                No friends saved yet
              </p>
              <p className="text-xs text-muted-foreground">
                Save people to your friends list when adding them to quickly add them next time
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {friends.map((friend, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{friend.name}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleAddFriend(friend)}
                  >
                    <UserPlus className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
