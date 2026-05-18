import { useState, useMemo } from 'react';
import { Users, Trash2, UserPlus, AtSign, Mail, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';
import { SettleUpModal, SettleTarget } from '@/components/settlements/SettleUpModal';
import { AddPersonDialog } from '@/components/people/AddPersonDialog';
import { UserAvatar } from '@/components/shared/UserAvatar';

export function ManageFriendsCard() {
  const {
    friends,
    friendSuggestions,
    setSearchInput,
    handleAddFromSearch,
    handleAddFriend,
    handleRemoveFriend,
    isLoadingFriends,
    refreshFriends,
  } = useFriendsEditor();

  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [expandedFriends, setExpandedFriends] = useState<Record<number, boolean>>({});
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const sortedFriends = useMemo(() => {
    return [...friends].sort((a, b) => {
      const balA = Math.abs(a.balance || 0);
      const balB = Math.abs(b.balance || 0);
      if (balB !== balA) return balB - balA;
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

  const getFriendId = (f: { id?: string; userId?: string }) => f.id || f.userId || '';

  return (
    <div className="space-y-4 md:space-y-6">
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
                {displayedFriends.map((friend, index) => {
                  const isExpanded = !!expandedFriends[index];
                  return (
                    <div
                      key={index}
                      className="flex flex-col p-2 md:p-3 bg-secondary/30 rounded-lg border border-border transition-all"
                    >
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          name={friend.name}
                          photoURL={friend.photoURL}
                          size="sm"
                          className="shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm md:text-base font-medium truncate">{friend.name}</p>
                          {friend.balance && friend.balance !== 0 ? (
                            <p className={`text-[10px] uppercase font-bold ${friend.balance > 0 ? 'text-success' : 'text-destructive'}`}>
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
                                photoURL: friend.photoURL,
                              })}
                            >
                              Settle Up
                            </Button>
                          ) : null}

                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={isExpanded ? 'Hide details' : 'Show details'}
                            aria-expanded={isExpanded}
                            onClick={() => toggleFriendDetails(index)}
                          >
                            <ChevronDown
                              className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </Button>
                        </div>
                      </div>

                      {isExpanded && (
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
                          </div>

                          <div className="flex justify-end mt-4">
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
                  );
                })}
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

      {settleTarget && (
        <SettleUpModal
          open={!!settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          targetUserId={settleTarget.userId}
          targetUserName={settleTarget.name}
          isPaying={settleTarget.isPaying}
          balanceAmount={settleTarget.amount}
          targetUserPhotoURL={settleTarget.photoURL}
          onSuccess={() => {
            setSettleTarget(null);
            refreshFriends();
          }}
        />
      )}
    </div>
  );
}
