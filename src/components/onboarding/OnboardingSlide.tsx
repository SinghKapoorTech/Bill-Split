import { ReactNode } from 'react';

interface OnboardingSlideProps {
  headline: string;
  body: string;
  children: ReactNode;
}

export function OnboardingSlide({ headline, body, children }: OnboardingSlideProps) {
  return (
    <div className="flex flex-col items-center text-center w-full">
      <div className="flex-1 flex items-center justify-center mb-6">
        {children}
      </div>
      <h2 className="text-xl font-bold tracking-tight mb-2">{headline}</h2>
      <p className="text-sm text-muted-foreground max-w-[280px] mx-auto leading-relaxed">
        {body}
      </p>
    </div>
  );
}
