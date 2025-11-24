import { ScanLine, Edit, Users } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export function NavigationBar() {
  const location = useLocation();

  const tabs = [
    { path: '/scan', label: 'AI Scan', icon: ScanLine },
    { path: '/groups', label: 'Groups', icon: Users },
  ];

  return (
    <nav className="flex gap-1">
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
    </nav>
  );
}
