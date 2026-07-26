import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { MobileNavBar } from '@/components/layout/MobileNavBar';
import { useIsMobile } from '@/hooks/use-mobile';

export function Layout() {
  const isMobile = useIsMobile();

  // On mobile the fixed MobileNavBar (which itself adds the safe-area inset)
  // overlaps content, so reserve its height PLUS the safe-area inset here.
  const mainStyle = isMobile
    ? { paddingBottom: 'calc(6rem + env(safe-area-inset-bottom))' }
    : undefined;

  return (
    <div className="h-dvh bg-gradient-to-b from-background to-secondary/30 flex flex-col overflow-hidden">
      {/* Render Header only if not mobile */}
      {!isMobile && <Header />}

      <main
        className={`container mx-auto py-4 md:py-12 flex-grow min-h-0 ${isMobile ? '' : 'pb-12'}`}
        style={mainStyle}
      >
        <div className="max-w-6xl mx-auto h-full">
          <Outlet />
        </div>
      </main>

      {/* Render MobileNavBar only if mobile, and fix it to the bottom */}
      {isMobile && <MobileNavBar />}
    </div>
  );
}