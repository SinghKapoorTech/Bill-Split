import { useState } from 'react';
import { LayoutDashboard, Users, UserCircle, Plus } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CreateOptionsDialog } from './CreateOptionsDialog';

export function NavigationBar() {
  const location = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const tabs = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/events', label: 'Events', icon: Users }, // MdGroups in mobile
    { path: '/squads', label: 'Squads', icon: Users }, // MdPeople in mobile
    { path: '/settings', label: 'Profile', icon: UserCircle }, // MdAccountCircle in mobile
  ];

  return (
    <nav className="flex items-center gap-4">
      <div className="flex gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = location.pathname === tab.path;

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`flex items-center gap-2 px-4 py-2 rounded-md transition-colors ${
                isActive
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </Link>
          );
        })}
      </div>

      <CreateOptionsDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />

      <Button onClick={() => setCreateDialogOpen(true)} className="hidden md:flex gap-2">
        <Plus className="w-4 h-4" />
        Create a bill
      </Button>
    </nav>
  );
}
