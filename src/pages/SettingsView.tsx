import { useState } from 'react';
import { Settings, Users, History, Shield } from 'lucide-react';
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
    <div className="animate-fade-in">
      <div className={layout.screen.headerWrap}>
        <h1 className={layout.screen.title}>Settings</h1>
        <p className={layout.screen.subtitle}>Manage your profile, friends, and squads</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Settings className="w-3 h-3 md:w-4 md:h-4" />
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
        </TabsList>

        <TabsContent value="profile" className="mt-4 md:mt-6">
          <ProfileSettingsCard />
        </TabsContent>

        <TabsContent value="friends" className="mt-4 md:mt-6">
          <ManageFriendsCard />
        </TabsContent>

        <TabsContent value="history" className="mt-4 md:mt-6">
          <SettlementHistoryCard />
        </TabsContent>

        <TabsContent value="squads" className="mt-4 md:mt-6">
          <SquadsSettingsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
