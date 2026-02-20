import { Users, Trash2, UserPlus, Pencil, Check, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';
import { DIALOG_DESCRIPTIONS } from '@/utils/uiConstants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageFriends({ open, onOpenChange }: Props) {
  const {
    friends,
    newFriendName,
    newFriendVenmoId,
    editingIndex,
    editingName,
    editingVenmoId,
    setNewFriendName,
    setNewFriendVenmoId,
    setEditingName,
    setEditingVenmoId,
    handleAddFriend,
    handleRemoveFriend,
    handleEditFriend,
    handleSaveEdit,
    handleCancelEdit,
  } = useFriendsEditor();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Manage Friends
          </DialogTitle>
          <DialogDescription>
            {DIALOG_DESCRIPTIONS.MANAGE_FRIENDS}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Add Friend Form */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Friend's name"
                  value={newFriendName}
                  onChange={(e) => setNewFriendName(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddFriend()}
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder="Venmo ID (optional)"
                  value={newFriendVenmoId}
                  onChange={(e) => setNewFriendVenmoId(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddFriend()}
                />
              </div>
              <Button onClick={handleAddFriend} size="icon">
                <UserPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Friends List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No friends saved yet. Add friends to quickly add them to bills.
              </p>
            ) : (
              friends.map((friend, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg border border-border"
                >
                  {editingIndex === index ? (
                    <>
                      <div className="flex-1 flex gap-2">
                        <Input
                          placeholder="Name"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Venmo ID"
                          value={editingVenmoId}
                          onChange={(e) => setEditingVenmoId(e.target.value)}
                          className="flex-1"
                        />
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleSaveEdit}
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEdit}
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1">
                        <p className="font-medium">{friend.name}</p>
                        {friend.venmoId && (
                          <p className="text-xs text-muted-foreground">
                            @{friend.venmoId.replace(/^@+/, '')}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditFriend(index)}
                        >
                          <Pencil className="w-4 h-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveFriend(index)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
