// src/components/MobileNavBar.tsx (with Material Design Icons)

import { Link, useLocation } from 'react-router-dom';
import { MdGroups, MdAccountCircle, MdDashboard } from 'react-icons/md';
import { FiAperture} from 'react-icons/fi';

export function MobileNavBar() {
  const location = useLocation();

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: MdDashboard }, // Dashboard icon
    { name: 'Groups', path: '/groups', icon: MdGroups },       // Bolder group icon
    { name: 'Profile', path: '/settings', icon: MdAccountCircle }, // User circle icon
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 md:hidden">
      {/* Backdrop blur and gradient background */}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/95 to-card/80 backdrop-blur-lg border-t border-border/50" />

      {/* Safe area padding for bottom (for devices with home indicators) */}
      <div className="relative px-6 pt-2 pb-6 safe-bottom">
        <div className="flex justify-around items-start gap-2">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`
                  flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl min-w-[72px]
                  transition-all duration-300 ease-out
                  ${
                    isActive
                      ? 'bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-medium scale-105'
                      : 'text-muted-foreground hover:bg-secondary/50 active:scale-95'
                  }
                `}
              >
                <item.icon className={`text-2xl transition-transform ${isActive ? 'scale-110' : ''}`} />
                <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'opacity-100' : 'opacity-70'}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}