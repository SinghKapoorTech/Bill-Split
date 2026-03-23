import * as React from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface Step {
  id: number;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  onStepClick?: (stepIndex: number) => void;
  canNavigateToStep?: (stepIndex: number) => boolean;
}

export function Stepper({
  steps,
  currentStep,
  orientation = 'horizontal',
  className,
  onStepClick,
  canNavigateToStep,
}: StepperProps) {
  const isHorizontal = orientation === 'horizontal';

  return (
    <div
      className={cn(
        'flex',
        isHorizontal ? 'flex-row items-center' : 'flex-col',
        className
      )}
      role="navigation"
      aria-label="Progress"
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isCurrent = index === currentStep;
        const isLast = index === steps.length - 1;
        const canNavigate = canNavigateToStep ? canNavigateToStep(index) : true;
        const isClickable = !!onStepClick && canNavigate;

        const handleClick = (e: React.MouseEvent) => {
          if (!canNavigate) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          if (onStepClick) {
            onStepClick(index);
          }
        };

        return (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                'flex items-center',
                isHorizontal ? 'flex-row' : 'flex-col'
              )}
            >
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all',
                    isCompleted &&
                    'border-primary bg-primary text-primary-foreground',
                    isCurrent &&
                    'border-primary bg-background text-primary scale-110',
                    !isCompleted &&
                    !isCurrent &&
                    'border-muted-foreground/30 bg-muted text-muted-foreground',
                    isClickable && 'cursor-pointer hover:scale-105 active:scale-95',
                    !canNavigate && 'opacity-50 cursor-not-allowed'
                  )}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-disabled={!canNavigate}
                  onClick={handleClick}
                  role={isClickable ? 'button' : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onKeyDown={isClickable ? (e: React.KeyboardEvent<HTMLDivElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick(e as unknown as React.MouseEvent);
                    }
                  } : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{step.id}</span>
                  )}
                </div>

                {/* Step Label - Mobile & Desktop */}
                {isHorizontal && (
                  <div
                    className={cn(
                      "flex flex-col items-center mt-2 min-w-[60px] md:min-w-[100px]",
                      isClickable && 'cursor-pointer',
                      !canNavigate && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={handleClick}
                  >
                    <span
                      className={cn(
                        'text-xs md:text-sm font-medium text-center',
                        isCurrent && 'text-primary',
                        !isCurrent && 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                    {step.description && (
                      <span className="hidden md:block text-xs text-muted-foreground text-center mt-1">
                        {step.description}
                      </span>
                    )}
                  </div>
                )}

                {/* Step Label - Mobile (Vertical) */}
                {!isHorizontal && (
                  <div
                    className={cn(
                      "ml-4 flex flex-col",
                      isClickable && 'cursor-pointer',
                      !canNavigate && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={handleClick}
                  >
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isCurrent && 'text-primary',
                        !isCurrent && 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                    {step.description && (
                      <span className="text-xs text-muted-foreground mt-1">
                        {step.description}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Connector Line */}
            {!isLast && (
              <div
                className={cn(
                  'transition-all',
                  isHorizontal
                    ? 'h-[2px] flex-1 mx-2 md:mx-4'
                    : 'w-[2px] h-12 ml-5 my-2',
                  index < currentStep
                    ? 'bg-primary'
                    : 'bg-muted-foreground/30'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

interface StepContentProps {
  children: React.ReactNode;
  className?: string;
  stepKey?: string | number; // Unique key for AnimatePresence
  direction?: 'forward' | 'backward'; // Direction of step navigation
}

/**
 * StepContent - Animated wrapper for wizard step content
 * Uses directional X-axis movement: forward slides left-to-right, backward reverses
 * Falls back to Y-axis if no direction provided
 */
export function StepContent({ children, className, stepKey, direction }: StepContentProps) {
  // Forward (Next): old exits left, new enters from right
  // Backward (Back): old exits right, new enters from left
  const variants = {
    enter: (dir: string) => ({
      opacity: 0,
      x: dir === 'forward' ? 50 : dir === 'backward' ? -50 : 0,
      y: dir ? 0 : 12,
    }),
    center: { opacity: 1, x: 0, y: 0 },
    exit: (dir: string) => ({
      opacity: 0,
      x: dir === 'forward' ? -50 : dir === 'backward' ? 50 : 0,
      y: dir ? 0 : -8,
    }),
  };

  return (
    <AnimatePresence mode="wait" custom={direction}>
      <motion.div
        key={stepKey}
        custom={direction}
        variants={variants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{
          duration: 0.2,
          ease: [0.4, 0, 0.2, 1],
        }}
        className={cn(className)}
        role="region"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

interface StepActionsProps {
  children: React.ReactNode;
  className?: string;
}

export function StepActions({ children, className }: StepActionsProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 mt-6 pt-6 border-t',
        className
      )}
    >
      {children}
    </div>
  );
}
