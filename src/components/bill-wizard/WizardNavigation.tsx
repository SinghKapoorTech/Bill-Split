import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Share2, Check, Home } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface WizardNavigationProps {
  currentStep: number;
  totalSteps: number;
  onBack?: () => void;
  onNext?: () => void;
  onComplete?: () => void;
  onExit?: () => void; // Navigate back to dashboard
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
 * Bottom-positioned floating navigation bar for Bill Wizard
 * Redesigned for thumb-friendly mobile UX with larger touch targets
 * Only visible on mobile (<768px)
 */
export function WizardNavigation({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onComplete,
  onExit,
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

  // Button animation variants
  const buttonVariants = {
    tap: { scale: 0.95 },
    hover: { scale: 1.02 },
  };

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
      className={cn(
        // Fixed to bottom with safe area padding
        'fixed bottom-0 left-0 right-0 z-50',
        'pb-[max(12px,env(safe-area-inset-bottom))] pt-3 px-4',
        // Floating island effect
        'bg-background/95 backdrop-blur-xl',
        'border-t border-border/50',
        // Subtle shadow for depth
        'shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]'
      )}
    >
      <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
        {/* Left: Back Button or Dashboard Exit */}
        <div className="flex-1 flex gap-2">
          {/* Dashboard exit button - always visible on first step */}
          {isFirstStep && onExit && (
            <motion.div
              variants={buttonVariants}
              whileTap="tap"
              whileHover="hover"
            >
              <Button
                variant="outline"
                onClick={onExit}
                disabled={isLoading}
                className={cn(
                  'h-12 px-4 gap-2 rounded-xl',
                  'border-2 border-muted-foreground/20',
                  'hover:border-muted-foreground/40',
                  'transition-all duration-200'
                )}
              >
                <Home className="w-5 h-5" />
                <span className="font-medium">Dashboard</span>
              </Button>
            </motion.div>
          )}

          {/* Back button - visible on steps 2+ */}
          {!isFirstStep && onBack && (
            <motion.div
              variants={buttonVariants}
              whileTap="tap"
              whileHover="hover"
            >
              <Button
                variant="outline"
                onClick={onBack}
                disabled={isLoading}
                className={cn(
                  'h-12 px-4 gap-2 rounded-xl',
                  'border-2 border-muted-foreground/20',
                  'hover:border-muted-foreground/40',
                  'transition-all duration-200'
                )}
              >
                <ChevronLeft className="w-5 h-5" />
                <span className="font-medium">{backLabel}</span>
              </Button>
            </motion.div>
          )}
        </div>

        {/* Center: Share Button (optional) */}
        {hasBillData && onShare && (
          <motion.div
            variants={buttonVariants}
            whileTap="tap"
            whileHover="hover"
          >
            <Button
              variant="outline"
              onClick={onShare}
              disabled={isLoading}
              className={cn(
                'h-12 w-12 p-0 rounded-xl',
                'border-2 border-info/30',
                'bg-info/10 hover:bg-info/20',
                'text-info hover:text-info',
                'transition-all duration-200'
              )}
            >
              <Share2 className="w-5 h-5" />
            </Button>
          </motion.div>
        )}

        {/* Right: Next/Complete Button */}
        <div className="flex-1 flex justify-end">
          {(onNext || onComplete) && (
            <motion.div
              variants={buttonVariants}
              whileTap="tap"
              whileHover="hover"
            >
              <Button
                onClick={handleNext}
                disabled={nextDisabled || isLoading}
                className={cn(
                  'h-12 px-6 gap-2 rounded-xl',
                  'font-semibold',
                  // Gradient background for primary action
                  'bg-gradient-to-r from-primary to-primary-glow',
                  'hover:opacity-90',
                  'shadow-lg shadow-primary/25',
                  'transition-all duration-200',
                  // Disabled state
                  'disabled:opacity-50 disabled:shadow-none'
                )}
              >
                <span>{isLastStep ? completeLabel : nextLabel}</span>
                {isLastStep ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Progress indicator dots */}
      <div className="flex justify-center gap-2 mt-3">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <motion.div
            key={index}
            initial={false}
            animate={{
              scale: index === currentStep ? 1.2 : 1,
              backgroundColor: index <= currentStep
                ? 'hsl(var(--primary))'
                : 'hsl(var(--muted-foreground) / 0.3)',
            }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className={cn(
              'w-2 h-2 rounded-full',
              'transition-colors duration-300'
            )}
          />
        ))}
      </div>
    </motion.div>
  );
}
