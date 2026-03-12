import { useState } from 'react';
import { Users, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useActiveBalances } from '@/hooks/useActiveBalances';
import { BalanceListRow, BalanceDirection } from '@/components/shared/BalanceListRow';
import { SettleUpModal, SettleTarget } from '@/components/settlements/SettleUpModal';
import { CreateOptionsDialog } from '@/components/layout/CreateOptionsDialog';

export function FriendBalancePreviewCard({ isRefreshing }: { isRefreshing?: boolean } = {}) {
  const navigate = useNavigate();
  const { balances, isLoading, refreshBalances } = useActiveBalances();
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const sortedFriends = [...balances]
    .filter(f => Math.abs(f.balance || 0) > 0.005)
    .sort((a, b) => {
      const balA = Math.abs(a.balance || 0);
      const balB = Math.abs(b.balance || 0);
      if (balB !== balA) return balB - balA;
      return (a.name || '').localeCompare(b.name || '');
    });

  const previewFriends = isExpanded ? sortedFriends : sortedFriends.slice(0, 3);
  const hasMoreFriends = sortedFriends.length > 3;
  const hiddenCount = sortedFriends.length - 3;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between mb-1 ml-1">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          Balances
        </h2>
        <Button
          variant="secondary"
          size="sm"
          className="h-7 px-2.5 text-[11px] gap-1.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20 border-none font-medium transition-all"
          onClick={() => navigate('/settings', { state: { defaultTab: 'friends' } })}
        >
          <Users className="h-3 w-3" />
          Friends
        </Button>
      </div>

      <Card className="p-0 overflow-hidden flex-1 flex flex-col border-none bg-transparent shadow-none">
        <div className="flex-1 mb-0">
          {isLoading || isRefreshing ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : previewFriends.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center mb-3">
                <Users className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">All settled up!</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-[200px]">
                You have no active balances. Split a new expense to get started.
              </p>
              <Button
                size="sm"
                className="rounded-full shadow-sm"
                onClick={() => setIsCreateDialogOpen(true)}
              >
                Add an expense
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-1">
              {previewFriends.map((friend, index) => {
                const owesYou = friend.balance && friend.balance > 0;
                const youOwe = friend.balance && friend.balance < 0;
                const hasBalance = friend.balance && friend.balance !== 0;

                const direction: BalanceDirection = owesYou
                  ? 'owes-you'
                  : youOwe
                    ? 'you-owe'
                    : 'neutral';

                const fromLabel = owesYou ? friend.name : 'You';
                const toLabel = owesYou ? 'you' : friend.name;
                const amount = Math.abs(friend.balance || 0);

                return (
                  <BalanceListRow
                    key={index}
                    fromLabel={fromLabel}
                    toLabel={toLabel}
                    amount={amount}
                    direction={direction}
                    action={hasBalance && friend.id ? {
                      label: youOwe ? 'Pay' : 'Settle',
                      variant: youOwe ? 'default' : 'secondary',
                      onClick: () => setSettleTarget({
                        userId: friend.id!,
                        name: friend.name,
                        amount,
                        isPaying: !!youOwe,
                      }),
                    } : undefined}
                    onClick={() => {
                      if (friend.id) {
                        navigate(`/balances/${friend.id}`);
                      }
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>

        {hasMoreFriends && (
          <div className="border-t border-border flex justify-center">
            <Button
              variant="ghost"
              className="w-full h-11 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-none rounded-b-lg"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <span className="text-xs font-medium mr-2">Show less</span>
                  <ChevronUp className="w-5 h-5" />
                </>
              ) : (
                <>
                  <span className="text-xs font-medium mr-2">Show {hiddenCount} more {hiddenCount === 1 ? 'person' : 'people'}</span>
                  <ChevronDown className="w-5 h-5" />
                </>
              )}
            </Button>
          </div>
        )}
      </Card>

      {settleTarget && (
        <SettleUpModal
          open={!!settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          targetUserId={settleTarget.userId}
          targetUserName={settleTarget.name}
          isPaying={settleTarget.isPaying}
          balanceAmount={settleTarget.amount}
          onSuccess={() => { setSettleTarget(null); refreshBalances(); }}
        />
      )}

      <CreateOptionsDialog 
        open={isCreateDialogOpen} 
        onOpenChange={setIsCreateDialogOpen} 
      />
    </div>
  );
}
