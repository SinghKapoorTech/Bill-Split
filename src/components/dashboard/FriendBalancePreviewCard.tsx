import { useState } from 'react';
import { Users, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useActiveBalances } from '@/hooks/useActiveBalances';
import { BalanceListRow, BalanceDirection } from '@/components/shared/BalanceListRow';
import { SettleUpModal, SettleTarget } from '@/components/settlements/SettleUpModal';
import { CreateOptionsDialog } from '@/components/layout/CreateOptionsDialog';
import { motion } from 'framer-motion';

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
              <motion.div
                className="w-[4.5rem] h-[4.5rem] bg-emerald-500/10 rounded-full flex items-center justify-center mb-3"
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              >
                <Users className="w-8 h-8 text-emerald-600" />
              </motion.div>
              <motion.h3
                className="font-semibold text-foreground mb-1"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.3 }}
              >
                All settled up!
              </motion.h3>
              <motion.p
                className="text-sm text-muted-foreground mb-4 max-w-[200px]"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.3 }}
              >
                You have no active balances. Split a new expense to get started.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.3 }}
              >
                <Button
                  size="sm"
                  className="rounded-full shadow-sm"
                  onClick={() => setIsCreateDialogOpen(true)}
                >
                  Add an expense
                </Button>
              </motion.div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-1">
              {previewFriends.map((friend, index: number) => {
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
                  <motion.div
                    key={friend.id || index}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.25,
                      delay: index * 0.05,
                      ease: [0.4, 0, 0.2, 1],
                    }}
                  >
                    <BalanceListRow
                      fromLabel={fromLabel}
                      toLabel={toLabel}
                      amount={amount}
                      direction={direction}
                      friendPhotoURL={friend.photoURL}
                      action={hasBalance && friend.id ? {
                        label: youOwe ? 'Pay' : 'Settle',
                        variant: youOwe ? 'default' : 'secondary',
                        onClick: () => setSettleTarget({
                          userId: friend.id!,
                          name: friend.name,
                          amount,
                          isPaying: !!youOwe,
                          photoURL: friend.photoURL,
                        }),
                      } : undefined}
                      onClick={() => {
                        if (friend.id) {
                          navigate(`/balances/${friend.id}`);
                        }
                      }}
                    />
                  </motion.div>
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
          targetUserPhotoURL={settleTarget.photoURL}
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
