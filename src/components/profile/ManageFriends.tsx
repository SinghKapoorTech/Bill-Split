import { Users, Trash2, UserPlus, Pencil, Check, X, Search, User, AtSign, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';
import { DIALOG_DESCRIPTIONS } from '@/utils/uiConstants';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ManageFriends({ open, onOpenChange }: Props) {
  const {
    friends,
    searchInput,
    friendSuggestions,
    showSuggestions,
    newFriendName,
    newFriendVenmoId,
    newFriendEmail,
    editingIndex,
    editingName,
    editingVenmoId,
    editingEmail,
    setSearchInput,
    setNewFriendName,
    setNewFriendVenmoId,
    setNewFriendEmail,
    setEditingName,
    setEditingVenmoId,
    setEditingEmail,
    handleAddFromSearch,
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

        <div className="space-y-6 py-4">
          
          {/* SEARCH AREA */}
          <div className="relative z-50 space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">Search Users</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name, @username, or email..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />

              {/* SUGGESTIONS DROPDOWN */}
              {showSuggestions && friendSuggestions.length > 0 ? (
                <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col overflow-hidden">
                  <div className="px-3 py-2 bg-muted/50 border-b border-border">
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Search Results</Label>
                  </div>
                  <ScrollArea className="max-h-[250px] w-full">
                    <div className="p-2">
                      {friendSuggestions.map((friend, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleAddFromSearch(friend)}
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
              ) : searchInput.trim().length > 0 && showSuggestions === false ? (
                 <div className="absolute top-full left-0 right-0 mt-2 bg-popover border border-border rounded-md shadow-md flex flex-col items-center justify-center p-6 text-center text-muted-foreground">
                    <User className="h-8 w-8 mb-2 opacity-50" />
                    <p className="text-sm">No users found.</p>
                 </div>
              ) : null}
            </div>
          </div>

          <div className="relative py-2 z-0">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or add manually</span>
            </div>
          </div>

          {/* MANUAL ADD AREA */}
          <div className="flex flex-col gap-3 z-0">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Add External Friend Manually</Label>
              <div className="space-y-2">
                <Label htmlFor="manual-name">Name</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="manual-name"
                    placeholder="Friend's Name"
                    className="pl-9"
                    value={newFriendName}
                    onChange={(e) => setNewFriendName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFriendEmail) {
                        handleAddFriend();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="manual-email"
                    type="email"
                    placeholder="Friend's Email"
                    className="pl-9"
                    value={newFriendEmail}
                    onChange={(e) => setNewFriendEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newFriendEmail) {
                        handleAddFriend();
                      }
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="manual-venmo-id">Venmo ID (optional)</Label>
                <div className="relative">
                  <AtSign className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="manual-venmo-id"
                    placeholder="Venmo ID"
                    className="pl-9"
                    value={newFriendVenmoId}
                    onChange={(e) => setNewFriendVenmoId(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()}
                  />
                </div>
              </div>

              <Button onClick={handleAddFriend} variant="default" disabled={!newFriendName.trim() || !newFriendEmail.trim()} className="mt-2">
                Save External Friend
              </Button>
          </div>

          <div className="relative py-2 z-0">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">My Saved Friends</span>
            </div>
          </div>

          {/* Friends List */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8 border border-dashed rounded-lg">
                No friends saved yet. Search or add friends above to build your list.
              </p>
            ) : (
              friends.map((friend, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-3 bg-secondary/30 rounded-lg border border-border"
                >
                  {editingIndex === index ? (
                    <>
                      <div className="flex-1 flex flex-col gap-2">
                        <Input
                          placeholder="Name"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                        />
                        <Input
                          placeholder="Email"
                          value={editingEmail}
                          onChange={(e) => setEditingEmail(e.target.value)}
                        />
                        <Input
                          placeholder="Venmo ID"
                          value={editingVenmoId}
                          onChange={(e) => setEditingVenmoId(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
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
                        {friend.username ? (
                           <p className="text-xs text-muted-foreground">
                             @{friend.username}
                           </p>
                        ) : friend.email ? (
                           <p className="text-xs text-muted-foreground">
                             {friend.email}
                           </p>
                        ) : null}
                        {friend.venmoId && (
                          <p className="text-xs text-muted-foreground">
                            Venmo: @{friend.venmoId.replace(/^@+/, '')}
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
