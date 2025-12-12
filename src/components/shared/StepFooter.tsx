import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface StepFooterProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  completeLabel?: string;
  nextDisabled?: boolean;
}

export function StepFooter({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onComplete,
  completeLabel = 'Complete',
  nextDisabled = false,
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
    <div className="flex items-center justify-between gap-4 mt-6 pt-6 border-t">
      {/* Back Button */}
      <div className="flex-1">
        {!isFirstStep && onBack && (
          <Button
            variant="outline"
            onClick={onBack}
            disabled={nextDisabled}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        )}
      </div>

      {/* Next/Complete Button */}
      <div className="flex-1 flex justify-end">
        {(onNext || onComplete) && (
          <Button
            onClick={handleNext}
            disabled={nextDisabled}
            className="gap-2"
          >
            <span>{isLastStep ? completeLabel : 'Next'}</span>
            {!isLastStep && <ChevronRight className="w-4 h-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
