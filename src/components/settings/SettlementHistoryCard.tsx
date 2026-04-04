import { useState, useEffect } from 'react';
import { History, Undo2, Loader2, RefreshCcw } from 'lucide-react';
import { format } from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { settlementService } from '@/services/settlementService';
import { Settlement } from '@/types/settlement.types';
import { useToast } from '@/hooks/use-toast';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';
import { userService } from '@/services/userService';

export function SettlementHistoryCard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { friends, isLoadingFriends } = useFriendsEditor();

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [nameCache, setNameCache] = useState<Record<string, string>>({});

  const fetchSettlements = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await settlementService.getSettlementsForUser(user.uid);
      setSettlements(data);
    } catch (error: unknown) {
      toast({
        title: 'Error loading history',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettlements();
  }, [user]);

  // Resolve names for settlement participants not in friends list.
  // nameCache intentionally omitted from deps — including it would cause an infinite loop
  // since this effect updates nameCache. The effect runs when settlements/friends change,
  // which is sufficient to resolve all unknown names.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!user || settlements.length === 0 || isLoadingFriends) return;

    const unknownIds = new Set<string>();
    for (const s of settlements) {
      const otherId = s.fromUserId === user.uid ? s.toUserId : s.fromUserId;
      const inFriends = friends.some((f) => f.id === otherId || f.userId === otherId);
      if (!inFriends && !nameCache[otherId]) {
        unknownIds.add(otherId);
      }
    }

    if (unknownIds.size === 0) return;

    let cancelled = false;
    (async () => {
      const newNames: Record<string, string> = {};
      for (const uid of unknownIds) {
        try {
          const userProfile = await userService.getUserProfile(uid);
          newNames[uid] = userProfile?.displayName || userProfile?.username || 'Unknown';
        } catch {
          newNames[uid] = 'Unknown';
        }
      }
      if (!cancelled) {
        setNameCache((prev) => ({ ...prev, ...newNames }));
      }
    })();

    return () => { cancelled = true; };
  }, [user, settlements, friends, isLoadingFriends]);

  const handleUndo = async (settlementId: string) => {
    setReversingId(settlementId);
    try {
      const result = await settlementService.reverseSettlement(settlementId);
      toast({
        title: 'Settlement Reversed',
        description: `Successfully restored ${result.billsReversed} bill(s).`,
      });
      fetchSettlements();
    } catch (error: unknown) {
      toast({
        title: 'Error reversing settlement',
        description: (error as Error).message,
        variant: 'destructive',
      });
    } finally {
      setReversingId(null);
    }
  };

  const getFriendName = (otherUserId: string) => {
    if (isLoadingFriends) return 'Loading...';
    const friend = friends.find((f) => f.id === otherUserId || f.userId === otherUserId);
    return friend?.name || nameCache[otherUserId] || 'Loading...';
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 md:mb-6">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 md:w-6 md:h-6 text-primary" />
          <h2 className="text-xl md:text-2xl font-semibold">Settlement History</h2>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchSettlements}
          disabled={loading || reversingId !== null}
        >
          <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="space-y-4">
        {loading && settlements.length === 0 ? (
          <div className="py-8 flex justify-center border-2 border-dashed rounded-lg">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : settlements.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 border-2 border-dashed rounded-lg">
            No settlement history found.
          </p>
        ) : (
          <div className="space-y-3">
            {settlements.map((settlement) => {
              const isPayer = settlement.fromUserId === user?.uid;
              const otherUserId = isPayer ? settlement.toUserId : settlement.fromUserId;
              const otherUserName = getFriendName(otherUserId);

              return (
                <div
                  key={settlement.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 md:p-4 bg-secondary/30 rounded-lg border border-border transition-all gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">
                      {isPayer ? `You paid ${otherUserName}` : `${otherUserName} paid you`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="text-sm text-muted-foreground">
                        {settlement.date ? format(settlement.date.toDate(), 'MMM d, yyyy h:mm a') : 'Unknown date'}
                      </p>
                      {settlement.eventId && (
                        <span className="text-xs bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full">
                          Event
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {settlement.amount ? `$${settlement.amount.toFixed(2)} across ` : ''}
                      {settlement.settledBillIds?.length || 0} bill(s)
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                    <p className={`font-semibold text-lg ${isPayer ? 'text-green-500' : 'text-red-500'}`}>
                      {/* Usually, when you pay, you lose money, but standardly we show amount transferred */}
                      ${(settlement.amount || 0).toFixed(2)}
                    </p>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUndo(settlement.id)}
                      disabled={reversingId === settlement.id}
                      className="shrink-0"
                    >
                      {reversingId === settlement.id ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Undo2 className="w-4 h-4 mr-2" />
                      )}
                      Undo
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
