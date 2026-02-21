// src/components/MobileNavBar.tsx (with Material Design Icons)

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MdGroups, MdAccountCircle, MdDashboard, MdAdd, MdPeople } from 'react-icons/md';
import { CreateOptionsDialog } from './CreateOptionsDialog';

export function MobileNavBar() {
  const location = useLocation();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const navItems = [
    { name: 'Home', path: '/dashboard', icon: MdDashboard },
    { name: 'Trips', path: '/trips', icon: MdGroups },
    { name: 'Create', path: '#', icon: MdAdd }, // Placeholder for center button
    { name: 'Squads', path: '/squads', icon: MdPeople },
    { name: 'Profile', path: '/settings', icon: MdAccountCircle },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-10 md:hidden">
      {/* Backdrop blur and gradient background */}
      <div className="absolute inset-0 bg-gradient-to-t from-card via-card/95 to-card/80 backdrop-blur-lg border-t border-border/50" />
      
      <CreateOptionsDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />

      {/* Safe area padding for bottom (for devices with home indicators) */}
      <div className="relative px-2 pt-2 pb-6 safe-bottom">
        <div className="grid grid-cols-5 items-end justify-items-center">
          {navItems.map((item, index) => {
            // Center button (Add)
            if (index === 2) {
              return (
                <button
                  key="add-button"
                  onClick={() => setCreateDialogOpen(true)}
                  className="flex flex-col items-center justify-center -mt-6"
                >
                  <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center transform transition-transform active:scale-95">
                    <MdAdd className="text-3xl" />
                  </div>
                  <span className="text-[10px] font-semibold tracking-wide mt-1 opacity-70">
                    Create
                  </span>
                </button>
              );
            }

            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                to={item.path}
                className={`
                  flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl w-full
                  transition-all duration-300 ease-out
                  ${
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:bg-secondary/30 active:scale-95'
                  }
                `}
              >
                <Icon className={`text-2xl transition-transform ${isActive ? 'scale-110' : ''}`} />
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