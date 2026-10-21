import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useProStatus } from '@/hooks/useProStatus';
import { ProBadge } from '@/components/monetization/ProBadge';

export const AuthButton = () => {
  const { user, loading, signOut } = useAuth();
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const pro = useProStatus();

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => navigate('/auth')}
        className="gap-2"
      >
        <LogIn className="w-4 h-4" />
        Sign In
      </Button>
    );
  }

  const getInitials = (name: string | null) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleOpenSettings = () => {
    setDropdownOpen(false);
    navigate('/settings');
  };

  return (
    <>
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className={`relative h-10 w-10 rounded-full ring-2 transition-all ${
            pro ? 'ring-[#E8B04B] hover:ring-[#F2C94C]' : 'ring-primary/20 hover:ring-primary/40'
          }`}
        >
          <Avatar className="h-9 w-9">
            <AvatarImage src={profile?.photoURL || user.photoURL || undefined} alt={user.displayName || 'User'} />
            <AvatarFallback className="bg-gradient-to-br from-primary to-primary-glow text-primary-foreground">
              {getInitials(user.displayName)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium leading-none">
              {user.displayName || 'User'}
              {pro && <ProBadge label={pro.badge} />}
            </p>
            <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleOpenSettings} className="cursor-pointer">
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
};
