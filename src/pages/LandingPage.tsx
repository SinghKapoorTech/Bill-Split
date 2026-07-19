import { ParallaxGradientBackground } from '@/components/landing/ParallaxGradientBackground';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { LandingFooter } from '@/components/landing/LandingFooter';

export default function LandingPage() {
  return (
    <div className="relative h-full min-h-screen overflow-y-auto">
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
