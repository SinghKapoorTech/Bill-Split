import { useState, useMemo } from 'react';
import { Users, Trash2, UserPlus, Pencil, Check, X, Search, User, AtSign, Mail, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';
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
    isLoadingFriends,
  } = useFriendsEditor();

  const [showAllFriends, setShowAllFriends] = useState(false);
  const [expandedFriends, setExpandedFriends] = useState<Record<number, boolean>>({});

  // Sort friends: those with balances first, then by name
  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      // First priority: Balance (absolute value)
      const balA = Math.abs(a.balance || 0);
      const balB = Math.abs(b.balance || 0);
      if (balB !== balA) return balB - balA;
      
      // Second priority: Name
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [friends]);

  const displayedFriends = showAllFriends ? sortedFriends : sortedFriends.slice(0, 3);
  const hasMoreFriends = sortedFriends.length > 3;

  const toggleFriendDetails = (index: number) => {
    setExpandedFriends(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            Manage Friends
          </DialogTitle>
          <DialogDescription>
            {DIALOG_DESCRIPTIONS.MANAGE_FRIENDS}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-8 py-4">
          {/* SECTION 1: MY FRIENDS */}
          <div className="space-y-4">
            <div className="relative py-2 z-0">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-semibold">My Friends</span>
              </div>
            </div>

            {/* Friends List */}
            <div className="space-y-2">
              {isLoadingFriends ? (
                <p className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">
                  Loading friends...
                </p>
              ) : sortedFriends.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">
                  No friends saved yet. Add friends below to get started.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {displayedFriends.map((friend, index) => (
                      <div
                        key={index}
                        className="flex flex-col p-2 md:p-3 bg-secondary/30 rounded-lg border border-border transition-all"
                      >
                        <div className="flex items-center gap-2">
                          {editingIndex === index ? (
                            <>
                              <div className="flex-1 flex flex-col sm:flex-row gap-2">
                                <Input
                                  placeholder="Name"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  className="flex-1 text-base md:text-sm"
                                />
                                <Input
                                  placeholder="Email"
                                  value={editingEmail}
                                  onChange={(e) => setEditingEmail(e.target.value)}
                                  className="flex-1 text-base md:text-sm"
                                />
                                <Input
                                  placeholder="Venmo ID"
                                  value={editingVenmoId}
                                  onChange={(e) => setEditingVenmoId(e.target.value)}
                                  className="flex-1 text-base md:text-sm"
                                />
                              </div>
                              <div className="flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={handleSaveEdit}
                                >
                                  <Check className="w-4 h-4 text-success" />
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
                              <div className="flex-1 min-w-0">
                                <p className="text-sm md:text-base font-medium truncate">{friend.name}</p>
                                {friend.balance && friend.balance !== 0 ? (
                                  <p className={`text-[10px] uppercase font-bold ${friend.balance > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {friend.balance > 0 ? 'Owes you' : 'You owe'} ${Math.abs(friend.balance).toFixed(2)}
                                  </p>
                                ) : (
                                  <p className="text-[10px] uppercase font-bold text-muted-foreground">Settled</p>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => toggleFriendDetails(index)}
                                >
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Expanded Details */}
                        {editingIndex !== index && expandedFriends[index] && (
                          <div className="mt-3 pt-3 border-t border-border/50 animate-in slide-in-from-top-1 duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                              {friend.username && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <AtSign className="w-3.5 h-3.5" />
                                  <span>@{friend.username}</span>
                                </div>
                              )}
                              {friend.email && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <Mail className="w-3.5 h-3.5" />
                                  <span className="truncate">{friend.email}</span>
                                </div>
                              )}
                              {friend.venmoId && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                  <span className="font-bold">Venmo:</span>
                                  <span>@{friend.venmoId}</span>
                                </div>
                              )}
                              {friend.id && (
                                <div className="flex items-center gap-2 text-muted-foreground sm:col-span-2">
                                  <span className="font-bold">ID:</span>
                                  <span className="font-mono opacity-60 truncate">{friend.id}</span>
                                </div>
                              )}
                            </div>
                            
                            <div className="flex justify-end gap-2 mt-4">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground"
                                onClick={() => handleEditFriend(index)}
                              >
                                <Pencil className="w-3.5 h-3.5 mr-1" />
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleRemoveFriend(index)}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                                Remove
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {hasMoreFriends && !showAllFriends && (
                    <Button
                      variant="ghost"
                      className="w-full mt-2 text-primary hover:text-primary hover:bg-primary/5 text-sm"
                      onClick={() => setShowAllFriends(true)}
                    >
                      Load {sortedFriends.length - 3} more friends
                    </Button>
                  )}
                  
                  {showAllFriends && sortedFriends.length > 3 && (
                    <Button
                      variant="ghost"
                      className="w-full mt-2 text-muted-foreground text-sm"
                      onClick={() => setShowAllFriends(false)}
                    >
                      Show less
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* SECTION 2: ADD A FRIEND */}
          <div className="space-y-6">
            <div className="relative py-2 z-0">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-semibold">Add a Friend</span>
              </div>
            </div>

            {/* SEARCH AREA */}
            <div className="relative z-50 space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Search Users</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, @username, or email..."
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

            {/* MANUAL ADD AREA */}
            <div className="flex flex-col gap-3 z-0">
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Or Add Manually</Label>
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

                <Button onClick={handleAddFriend} variant="default" disabled={!newFriendName.trim() || !newFriendEmail.trim()} className="mt-2 text-sm">
                  Save External Friend
                </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
