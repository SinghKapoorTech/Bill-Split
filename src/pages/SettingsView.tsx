import { useState } from 'react';
import { Settings, Users, UsersRound, LogIn } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProfileSettingsCard } from '@/components/profile/ProfileSettingsCard';
import { ManageFriendsCard } from '@/components/profile/ManageFriendsCard';
import { ManageSquadsCard } from '@/components/squads/ManageSquadsCard';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function SettingsView() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('profile');

  // If user is not logged in, show sign-in prompt
  if (!user) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            Profile & Settings
          </h2>
          <p className="text-base md:text-lg text-muted-foreground">
            Sign in to manage your profile, friends, and squads
          </p>
        </div>

        <Card className="p-8 md:p-12 text-center space-y-6">
          <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Settings className="w-8 h-8 md:w-10 md:h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">Sign In Required</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Please sign in to access your profile settings, manage your friends list, and create squads.
            </p>
          </div>
          <Button onClick={() => navigate('/auth')} className="gap-2">
            <LogIn className="w-4 h-4" />
            Sign In
          </Button>
        </Card>
      </div>
    );
  }

  // Desktop layout: All cards stacked vertically
  if (!isMobile) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
            Profile & Settings
          </h2>
          <p className="text-base md:text-lg text-muted-foreground">
            Manage your profile, friends, and squads
          </p>
        </div>

        <div className="space-y-6">
          <ProfileSettingsCard />
          <ManageFriendsCard />
          <ManageSquadsCard />
        </div>
      </div>
    );
  }

  // Mobile layout: Tabs for switching between sections
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-primary via-primary-glow to-accent bg-clip-text text-transparent">
          Profile & Settings
        </h2>
        <p className="text-sm md:text-lg text-muted-foreground">
          Manage your profile, friends, and squads
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="profile" className="gap-1 text-xs">
            <Settings className="w-3 h-3" />
            <span>Profile</span>
          </TabsTrigger>
          <TabsTrigger value="friends" className="gap-1 text-xs">
            <Users className="w-3 h-3" />
            <span>Friends</span>
          </TabsTrigger>
          <TabsTrigger value="squads" className="gap-1 text-xs">
            <UsersRound className="w-3 h-3" />
            <span>Squads</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileSettingsCard />
        </TabsContent>

        <TabsContent value="friends" className="mt-4">
          <ManageFriendsCard />
        </TabsContent>

        <TabsContent value="squads" className="mt-4">
          <ManageSquadsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
