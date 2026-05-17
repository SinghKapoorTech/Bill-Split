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
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { layout, chip } from '@/lib/styles';

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
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

  const handleRefresh = async () => {
    setIsManualRefreshing(true);
    try {
      // Add a slight artificial delay (min 600ms) to ensure the user clearly sees
      // the whole screen refresh taking place. Let both the fetch and delay finish.
      await Promise.all([
        refreshBalances(),
        new Promise(resolve => setTimeout(resolve, 600))
      ]);
    } finally {
      setIsManualRefreshing(false);
    }
  };

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
    <PullToRefresh onRefresh={handleRefresh}>
      <div className={`${layout.page} animate-fade-in`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className={layout.screen.title}>Balances</h1>
            <p className={layout.screen.subtitle}>{balanceSubtitle}</p>
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

        <FriendBalancePreviewCard isRefreshing={isManualRefreshing} />

        <OnboardingDialog open={showOnboarding} onComplete={handleOnboardingComplete} />
      </div>
    </PullToRefresh>
  );
}
