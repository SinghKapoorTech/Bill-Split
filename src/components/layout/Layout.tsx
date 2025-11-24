import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { MobileNavBar } from '@/components/layout/MobileNavBar';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBillContext } from '@/contexts/BillSessionContext';
import { Loader2 } from 'lucide-react';

export function Layout() {
  const isMobile = useIsMobile();
  const { isResuming } = useBillContext();

  const mainPaddingBottom = isMobile ? 'pb-24' : 'pb-12';

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30 flex flex-col">
      {isResuming && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-primary" />
            <p className="text-lg text-muted-foreground">Resuming Session...</p>
          </div>
        </div>
      )}

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