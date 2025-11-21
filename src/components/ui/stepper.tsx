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
                  onKeyDown={isClickable ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick(e as any);
                    }
                  } : undefined}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{step.id}</span>
                  )}
                </div>

                {/* Step Label - Desktop */}
                {isHorizontal && (
                  <div 
                    className={cn(
                      "hidden md:flex flex-col items-center mt-2 min-w-[100px]",
                      isClickable && 'cursor-pointer',
                      !canNavigate && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={handleClick}
                  >
                    <span
                      className={cn(
                        'text-sm font-medium text-center',
                        isCurrent && 'text-primary',
                        !isCurrent && 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                    {step.description && (
                      <span className="text-xs text-muted-foreground text-center mt-1">
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
}

export function StepContent({ children, className, stepKey }: StepContentProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stepKey}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3, ease: 'easeInOut' }}
        className={cn('mt-6 md:mt-8', className)}
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
