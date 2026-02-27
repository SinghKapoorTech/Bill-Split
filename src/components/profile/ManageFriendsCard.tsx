import { useState, useMemo } from 'react';
import { Users, Trash2, UserPlus, Pencil, Check, X, Search, User, AtSign, Mail, ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';
import { useToast } from '@/hooks/use-toast';
import { UI_TEXT, SUCCESS_MESSAGES } from '@/utils/uiConstants';
import { SettleUpModal } from '@/components/settlements/SettleUpModal';
import { AddPersonDialog } from '@/components/people/AddPersonDialog';

export function ManageFriendsCard() {
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
    refreshFriends,
  } = useFriendsEditor();

  const [settleTarget, setSettleTarget] = useState<{ userId: string; name: string; amount: number; isPaying: boolean; venmoId?: string } | null>(null);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [expandedFriends, setExpandedFriends] = useState<Record<number, boolean>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

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

  // Fallback for ID if the raw friend doesn't have it mapped consistently
  const getFriendId = (f: any) => f.id || f.userId || '';

  return (
    <div className="space-y-4 md:space-y-6">
      {/* CARD 1: MANAGE FRIENDS */}
      <Card className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 md:w-6 md:h-6 text-primary" />
            <h2 className="text-xl md:text-2xl font-semibold">Manage Friends</h2>
          </div>
          <AddPersonDialog
            isOpen={isAddDialogOpen}
            setIsOpen={setIsAddDialogOpen}
            friendSuggestions={friendSuggestions}
            onSearchChange={setSearchInput}
            onSelectSuggestion={handleAddFromSearch}
            onAddManual={(name, venmoId, email) => handleAddFriend(name, email, venmoId)}
            title="Add a Friend"
            description="Search for an app user or add an external friend by email."
            submitLabel="Save Friend"
            showEmailField={true}
            trigger={
              <Button 
                variant="outline" 
                size="sm"
                className="gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span className="hidden sm:inline">Add Friend</span>
              </Button>
            }
          />
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
                            {friend.balance && friend.balance !== 0 ? (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-3 text-xs"
                                onClick={() => setSettleTarget({
                                  userId: getFriendId(friend),
                                  name: friend.name,
                                  amount: Math.abs(friend.balance as number),
                                  isPaying: friend.balance! < 0,
                                  venmoId: friend.venmoId
                                })}
                              >
                                Settle Up
                              </Button>
                            ) : null}
                            
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
      </Card>

      {/* Inline Add Friend UI removed and replaced by dialog above */}

      {settleTarget && (
        <SettleUpModal
          open={!!settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          targetUserId={settleTarget.userId}
          targetUserName={settleTarget.name}
          targetVenmoId={settleTarget.venmoId}
          isPaying={settleTarget.isPaying}
          recommendedAmount={settleTarget.amount}
          onSuccess={() => {
            setSettleTarget(null);
            refreshFriends();
          }}
        />
      )}
    </div>
  );
}
