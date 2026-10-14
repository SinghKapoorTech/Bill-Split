import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { MobileNavBar } from '@/components/layout/MobileNavBar';
import { useIsMobile } from '@/hooks/use-mobile';

export function Layout() {
  const isMobile = useIsMobile();

  const mainPaddingBottom = isMobile ? 'pb-24' : 'pb-12';

  return (
    // HEIGHT EXCLUDES THE SAFE AREAS. index.css pads <body> by the top and
    // bottom insets (notch, home indicator); a plain h-dvh child ignores that
    // padding and ran ~top+bottom inset (~90pt on an iPhone 17 Pro) past the
    // screen edge, so the pb-24 meant to clear the tab bar sat off-screen and
    // the bottom of every page — on Settings, the Privacy/Contact links — hid
    // under the bar. Both insets are 0 on web, where this is plain 100dvh.
    <div className="h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] bg-gradient-to-b from-background to-secondary/30 flex flex-col overflow-hidden">
      {/* Render Header only if not mobile */}
      {!isMobile && <Header />}

      <main className={`container mx-auto py-4 md:py-12 flex-grow min-h-0 ${mainPaddingBottom}`}>
        <div className="max-w-6xl mx-auto h-full">
          <Outlet />
        </div>
      </main>

      {/* Render MobileNavBar only if mobile, and fix it to the bottom */}
      {isMobile && <MobileNavBar />}
    </div>
  );
}