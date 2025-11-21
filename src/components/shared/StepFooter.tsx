import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StepFooterProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  nextLabel?: string;
  backLabel?: string;
  completeLabel?: string;
  nextDisabled?: boolean;
  isLoading?: boolean;
  className?: string;
  // Optional custom action for specific steps
  customAction?: React.ReactNode;
}

export function StepFooter({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onComplete,
  nextLabel = 'Next',
  backLabel = 'Back',
  completeLabel = 'Complete',
  nextDisabled = false,
  isLoading = false,
  className,
  customAction,
}: StepFooterProps) {
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
        'flex items-center justify-between gap-4 mt-6 pt-6 border-t',
        'sticky bottom-0 bg-background/95 backdrop-blur-sm pb-4 -mb-4',
        'md:static md:bg-transparent md:backdrop-blur-none md:pb-0 md:mb-0',
        className
      )}
    >
      {/* Back Button */}
      <div className="flex-1">
        {!isFirstStep && onBack && (
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isLoading}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">{backLabel}</span>
          </Button>
        )}
      </div>

      {/* Custom Action (e.g., "Analyze Receipt" button) */}
      {customAction && <div className="flex-shrink-0">{customAction}</div>}

      {/* Next/Complete Button */}
      <div className="flex-1 flex justify-end">
        {(onNext || onComplete) && (
          <Button
            onClick={handleNext}
            disabled={nextDisabled || isLoading}
            className="gap-2"
          >
            <span>{isLastStep ? completeLabel : nextLabel}</span>
            {!isLastStep && <ChevronRight className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
