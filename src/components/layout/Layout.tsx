import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { MobileNavBar } from '@/components/layout/MobileNavBar';
import { useIsMobile } from '@/hooks/use-mobile';

export function Layout() {
  const isMobile = useIsMobile();

  const mainPaddingBottom = isMobile ? 'pb-24' : 'pb-12';

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-secondary/30 flex flex-col">
      {/* Render Header only if not mobile */}
      {!isMobile && <Header />}

      <main className={`container mx-auto px-4 py-4 md:py-12 flex-grow ${mainPaddingBottom}`}>
        <div className="max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Render MobileNavBar only if mobile, and fix it to the bottom */}
      {isMobile && <MobileNavBar />}
    </div>
  );
}