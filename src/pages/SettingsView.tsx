import { useState } from 'react';
import { Settings, Users } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProfileSettingsCard } from '@/components/profile/ProfileSettingsCard';
import { ManageFriendsCard } from '@/components/profile/ManageFriendsCard';

export default function SettingsView() {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
          Settings
        </h2>
        <p className="text-sm md:text-lg text-muted-foreground">
          Manage your profile, friends, and squads
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="profile" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Settings className="w-3 h-3 md:w-4 md:h-4" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="friends" className="gap-1 text-xs md:gap-2 md:text-sm">
            <Users className="w-3 h-3 md:w-4 md:h-4" />
            <span>Friends</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4 md:mt-6">
          <ProfileSettingsCard />
        </TabsContent>

        <TabsContent value="friends" className="mt-4 md:mt-6">
          <ManageFriendsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
