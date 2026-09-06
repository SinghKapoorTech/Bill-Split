import { useEffect } from 'react';
import { ParallaxGradientBackground } from '@/components/landing/ParallaxGradientBackground';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { LandingFooter } from '@/components/landing/LandingFooter';

/**
 * Scrolls to `location.hash` once the landing sections are actually mounted.
 *
 * The browser performs its own fragment lookup the moment the document loads,
 * but `RootRoute` renders `<LoadingScreen />` until Firebase auth resolves, so
 * at that instant `#features` / `#how-it-works` do not exist yet and the jump
 * silently does nothing. Anyone opening a shared `…/#features` link — or simply
 * reloading after clicking a footer link — would land at the top of the page.
 */
function useScrollToHashOnMount() {
  useEffect(() => {
    const { hash } = window.location;
    if (!hash || hash === '#') return;

    let target: Element | null = null;
    try {
      target = document.querySelector(hash);
    } catch {
      // A malformed fragment (e.g. `#123`) is not a valid selector — ignore it
      // rather than letting querySelector throw during mount.
      return;
    }
    if (!target) return;

    // Wait a frame so layout has settled before measuring the scroll position.
    const frame = requestAnimationFrame(() => {
      // 'instant', not 'auto': 'auto' defers to the computed scroll-behavior,
      // which index.css sets to `smooth` — so a deep link would animate from the
      // top of the page instead of restoring position immediately.
      target?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
}

export default function LandingPage() {
  useScrollToHashOnMount();

  return (
    <div className="landing-scroll-root relative h-full min-h-screen overflow-y-auto">
      <ParallaxGradientBackground />
      <LandingHeader />
      <main>
        <HeroSection />
        <FeaturesSection />
        <UseCasesSection />
        <HowItWorks />
      </main>
      <LandingFooter />
    </div>
  );
}
