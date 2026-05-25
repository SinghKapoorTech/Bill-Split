import { useState } from 'react';
import { UserCircle, Users, History, Shield, Repeat } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettingsCard } from '@/components/profile/ProfileSettingsCard';
import { ManageFriendsCard } from '@/components/profile/ManageFriendsCard';
import { SettlementHistoryCard } from '@/components/settings/SettlementHistoryCard';
import { SquadsSettingsCard } from '@/components/settings/SquadsSettingsCard';
import { RecurringBillsSettingsCard } from '@/components/settings/RecurringBillsSettingsCard';
import { layout } from '@/lib/styles';
import { useLocation } from 'react-router-dom';

export default function SettingsView() {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState(location.state?.defaultTab || 'profile');

  return (
    <div className="h-full flex flex-col animate-fade-in max-w-7xl mx-auto">
      <div className="shrink-0 pt-5 mb-2 px-1">
        <h1 className={layout.screen.title}>Settings</h1>
        <p className={layout.screen.subtitle}>Manage your profile, friends, and squads</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0 w-full">
        <TabsList className="shrink-0 grid w-full grid-cols-5">
          <TabsTrigger value="profile" className="gap-1 text-xs md:gap-2 md:text-sm">
            <UserCircle className="w-3 h-3 md:w-4 md:h-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="friends" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Users className="w-3 h-3 md:w-4 md:h-4" />
            <span>Friends</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1 text-xs md:gap-2 md:text-sm">
            <History className="w-3 h-3 md:w-4 md:h-4" />
            <span>History</span>
          </TabsTrigger>
          <TabsTrigger value="squads" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Shield className="w-3 h-3 md:w-4 md:h-4" />
            <span>Squads</span>
          </TabsTrigger>
          <TabsTrigger value="recurring" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Repeat className="w-3 h-3 md:w-4 md:h-4" />
            <span>Recurring</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="data-[state=active]:flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 pb-4">
          <ProfileSettingsCard />
        </TabsContent>

        <TabsContent value="friends" className="data-[state=active]:flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 pb-4">
          <ManageFriendsCard />
        </TabsContent>

        <TabsContent value="history" className="data-[state=active]:flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 pb-4">
          <SettlementHistoryCard />
        </TabsContent>

        <TabsContent value="squads" className="data-[state=active]:flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 pb-4">
          <SquadsSettingsCard />
        </TabsContent>

        <TabsContent value="recurring" className="data-[state=active]:flex-1 min-h-0 overflow-y-auto scrollbar-hide mt-4 pb-4">
          <RecurringBillsSettingsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
