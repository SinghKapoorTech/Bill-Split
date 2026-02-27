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
    { path: '/events', label: 'Events', icon: Users },
    { path: '/squads', label: 'Squads', icon: Users },
    { path: '/settings', label: 'Profile', icon: UserCircle },
  ];

  // Context detection for Quick Expense / New Bill
  const eventMatch = location.pathname.match(/\/events\/([^\/]+)/);
  const squadMatch = location.pathname.match(/\/squads\/([^\/]+)/);
  
  const eventContext = eventMatch ? { 
    targetEventId: eventMatch[1],
    targetEventName: '' // Name is hard to get here, but ID is enough for the logic
  } : squadMatch ? {
    targetSquadId: squadMatch[1],
    targetSquadName: ''
  } : undefined;

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
        eventContext={eventContext as any}
      />

      <Button onClick={() => setCreateDialogOpen(true)} className="hidden md:flex gap-2">
        <Plus className="w-4 h-4" />
        Create a bill
      </Button>
    </nav>
  );
}
