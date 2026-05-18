import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Loader2, Users } from 'lucide-react';
import { FriendBalancePreviewCard } from '@/components/dashboard/FriendBalancePreviewCard';
import { useActiveBalances } from '@/hooks/useActiveBalances';
import { useUserProfile } from '@/hooks/useUserProfile';
import { userService } from '@/services/userService';
import { OnboardingDialog } from '@/components/onboarding/OnboardingDialog';
import { chip } from '@/lib/styles';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { balances, isLoading: isLoadingBalances, refreshBalances } = useActiveBalances();
  const { profile } = useUserProfile();
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Show onboarding for first-time users
  useEffect(() => {
    if (profile && profile.hasSeenOnboarding === false) {
      setShowOnboarding(true);
    }
  }, [profile]);

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    if (user) {
      await userService.markOnboardingSeen(user.uid);
    }
  };

  // Refresh balances automatically when routing back to the dashboard,
  // e.g. after finishing a simple transaction wizard.
  useEffect(() => {
    refreshBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const netBalance = balances.reduce((sum, b) => sum + (b.balance || 0), 0);
  const balanceSubtitle = Math.abs(netBalance) < 0.005
    ? "You're all settled up"
    : netBalance > 0
      ? <span>You are owed <strong>${netBalance.toFixed(2)}</strong> in total</span>
      : <span>You owe <strong>${Math.abs(netBalance).toFixed(2)}</strong> in total</span>;

  if (isLoadingBalances && balances.length === 0) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <Loader2 className="w-12 h-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-fade-in container mx-auto px-4 max-w-7xl">
      <div className="shrink-0 flex items-center justify-between pt-8 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Balances</h1>
          <p className="text-muted-foreground">{balanceSubtitle}</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          className={`${chip.sm} bg-primary/10 text-primary hover:bg-primary/20 border-none transition-all shrink-0`}
          onClick={() => navigate('/settings', { state: { defaultTab: 'friends' } })}
        >
          <Users className="h-3 w-3" />
          Friends
        </Button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <FriendBalancePreviewCard />
      </div>

      <OnboardingDialog open={showOnboarding} onComplete={handleOnboardingComplete} />
    </div>
  );
}
