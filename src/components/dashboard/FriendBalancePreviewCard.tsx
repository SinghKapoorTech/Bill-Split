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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6" />
            Friend Balances
          </h2>
        </div>
      </div>

      <Card className="p-0 overflow-hidden flex-1 flex flex-col border-border bg-card shadow-sm">
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
                <ChevronUp className="w-5 h-5" />
              ) : (
                <ChevronDown className="w-5 h-5" />
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
