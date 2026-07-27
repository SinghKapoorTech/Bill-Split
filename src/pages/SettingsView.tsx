import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProfileSettingsCard } from '@/components/profile/ProfileSettingsCard';
import { ManageFriendsCard } from '@/components/profile/ManageFriendsCard';
import { SettlementHistoryCard } from '@/components/settings/SettlementHistoryCard';
import { SquadsSettingsCard } from '@/components/settings/SquadsSettingsCard';
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
        <TabsList className="shrink-0 grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="text-xs md:text-sm">
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="friends" className="text-xs md:text-sm">
            <span>Friends</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs md:text-sm">
            <span>History</span>
          </TabsTrigger>
          <TabsTrigger value="squads" className="text-xs md:text-sm">
            <span>Squads</span>
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
      </Tabs>
    </div>
  );
}
