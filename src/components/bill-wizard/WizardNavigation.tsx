import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  nextDisabled?: boolean;
  hasBillData: boolean;
  onShare?: () => void;
  nextLabel?: string;
  backLabel?: string;
  completeLabel?: string;
  isLoading?: boolean;
  isMobile: boolean;
}

/**
 * WizardNavigation Component
 * Mobile-optimized navigation bar for Bill Wizard
 * Layout: [Back] [Share] [Next/Complete]
 * Only visible on mobile (<768px)
 */
export function WizardNavigation({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onComplete,
  nextDisabled = false,
  hasBillData,
  onShare,
  nextLabel = 'Next',
  backLabel = 'Back',
  completeLabel = 'Done',
  isLoading = false,
  isMobile,
}: WizardNavigationProps) {
  // Desktop: Use StepFooter instead
  if (!isMobile) {
    return null;
  }

  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  const handleNext = () => {
    if (isLastStep && onComplete) {
      onComplete();
    } else if (onNext) {
      onNext();
    }
  };

  return (
    <div
      className={cn(
        'sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b',
        'pb-3 pt-2 -mt-2 mb-4'
      )}
    >
      <div className="grid grid-cols-3 gap-2 items-center px-1">
        {/* Left: Back Button */}
        <div className="flex justify-start">
          {!isFirstStep && onBack && (
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              disabled={isLoading}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="sr-only sm:not-sr-only">{backLabel}</span>
            </Button>
          )}
        </div>

        {/* Center: Share Button */}
        <div className="flex justify-center">
          {hasBillData && onShare && (
            <Button
              variant="info"
              size="sm"
              onClick={onShare}
              disabled={isLoading}
              className="gap-1"
            >
              <Share2 className="w-4 h-4" />
              <span className="text-xs">Share</span>
            </Button>
          )}
        </div>

        {/* Right: Next/Complete Button */}
        <div className="flex justify-end">
          {(onNext || onComplete) && (
            <Button
              size="sm"
              onClick={handleNext}
              disabled={nextDisabled || isLoading}
              className="gap-1"
            >
              <span>{isLastStep ? completeLabel : nextLabel}</span>
              {!isLastStep && <ChevronRight className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
