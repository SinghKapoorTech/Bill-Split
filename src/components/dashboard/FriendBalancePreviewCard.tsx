import { useState } from 'react';
import { Users, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';
import { BalanceListRow, BalanceDirection } from '@/components/shared/BalanceListRow';
import { SettleUpModal, SettleTarget } from '@/components/settlements/SettleUpModal';

export function FriendBalancePreviewCard() {
  const navigate = useNavigate();
  const { friends, isLoadingFriends, refreshFriends } = useFriendsEditor();
  const [settleTarget, setSettleTarget] = useState<SettleTarget | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const sortedFriends = [...friends]
    .filter(f => Math.abs(f.balance || 0) > 0.005)
    .sort((a, b) => {
      const balA = Math.abs(a.balance || 0);
      const balB = Math.abs(b.balance || 0);
      if (balB !== balA) return balB - balA;
      return (a.name || '').localeCompare(b.name || '');
    });

  const previewFriends = isExpanded ? sortedFriends : sortedFriends.slice(0, 3);
  const hasMoreFriends = sortedFriends.length > 3;

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between mb-1.5 px-2">
        <div>
          <h2 className="text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80">
            Friend Balances
          </h2>
        </div>
      </div>

      <Card className="p-0 overflow-hidden flex-1 flex flex-col border-border/60 bg-card rounded-xl shadow-sm">
        <div className="flex-1 mb-0">
          {isLoadingFriends ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading friends...
            </p>
          ) : previewFriends.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              All settled up! No active balances.
            </p>
          ) : (
            <div className="divide-y divide-border">
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
                      label: youOwe ? 'Pay' : 'Settle Up',
                      variant: youOwe ? 'default' : 'soft-success',
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
          <div className="border-t border-border/50 flex justify-center">
            <Button
              variant="ghost"
              className="w-full h-9 text-muted-foreground hover:text-foreground hover:bg-muted/30 rounded-none rounded-b-xl group text-xs font-medium"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? 'Collapse' : 'Show More'}
              {isExpanded ? (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/50 group-hover:bg-muted transition-colors ml-1.5">
                  <ChevronUp className="w-3 h-3" />
                </div>
              ) : (
                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-muted/50 group-hover:bg-muted transition-colors ml-1.5">
                  <ChevronDown className="w-3 h-3" />
                </div>
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
          onSuccess={() => { setSettleTarget(null); refreshFriends(); }}
        />
      )}
    </div>
  );
}
