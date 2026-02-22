import { Users, User, ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useFriendsEditor } from '@/hooks/useFriendsEditor';

export function FriendBalancePreviewCard() {
  const navigate = useNavigate();
  const { friends, isLoadingFriends } = useFriendsEditor();

  const previewFriends = friends.slice(0, 5);

  return (
    <Card className="p-4 md:p-6 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-semibold">Friend Balances</h2>
        </div>
      </div>

      <div className="flex-1 space-y-3 mb-4">
        {isLoadingFriends ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Loading friends...
          </p>
        ) : friends.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No friends saved yet.
          </p>
        ) : (
          previewFriends.map((friend, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-2 rounded-lg hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 flex-shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{friend.name}</p>
                </div>
              </div>
              
              <div className="flex flex-col items-end">
                <div className="flex items-baseline gap-1.5">
                  {friend.balance && friend.balance !== 0 ? (
                    <span className="text-[10px] uppercase font-bold text-foreground">
                      {friend.balance > 0 ? 'Owes you' : 'You owe'}
                    </span>
                  ) : null}
                  {!friend.balance ? (
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">
                      Settled
                    </span>
                  ) : null}
                  <span className={`text-sm font-semibold ${friend.balance && friend.balance > 0 ? 'text-green-500' : friend.balance && friend.balance < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    ${Math.abs(friend.balance || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Button 
        variant="outline" 
        className="w-full mt-auto"
        onClick={() => navigate('/settings', { state: { defaultTab: 'friends' } })}
      >
        <span>Manage Friends</span>
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </Card>
  );
}
