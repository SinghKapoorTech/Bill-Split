import { useState } from 'react';
import { Users, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';
import { BalanceListRow, BalanceDirection } from '@/components/shared/BalanceListRow';
import { SettleUpModal } from '@/components/settlements/SettleUpModal';

export function FriendBalancePreviewCard() {
  const navigate = useNavigate();
  const { friends, isLoadingFriends, refreshFriends } = useFriendsEditor();
  const [settleTarget, setSettleTarget] = useState<{
    userId: string;
    name: string;
    amount: number;
    isPaying: boolean;
    venmoId?: string;
  } | null>(null);

  const previewFriends = friends.slice(0, 5);

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Users className="w-6 h-6" />
            Friend Balances
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Keep track of who owes who
          </p>
        </div>
      </div>

      <Card className="p-0 overflow-hidden flex-1 flex flex-col border-border bg-card shadow-sm">
        <div className="flex-1 mb-0">
          {isLoadingFriends ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Loading friends...
            </p>
          ) : friends.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No friends saved yet.
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
                        venmoId: friend.venmoId,
                      }),
                    } : undefined}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border">
          <Button
            variant="ghost"
            className="w-full text-sm text-muted-foreground justify-between"
            onClick={() => navigate('/settings', { state: { defaultTab: 'friends' } })}
          >
            <span>Manage Friends</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {settleTarget && (
        <SettleUpModal
          open={!!settleTarget}
          onOpenChange={(open) => !open && setSettleTarget(null)}
          targetUserId={settleTarget.userId}
          targetUserName={settleTarget.name}
          targetVenmoId={settleTarget.venmoId}
          isPaying={settleTarget.isPaying}
          recommendedAmount={settleTarget.amount}
          onSuccess={() => { setSettleTarget(null); refreshFriends(); }}
        />
      )}
    </div>
  );
}
