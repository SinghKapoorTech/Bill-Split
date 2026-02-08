import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

interface Step {
    id: number;
    label: string;
    description?: string;
}

interface PillProgressProps {
    steps: Step[];
    currentStep: number;
    onStepClick?: (step: number) => void;
    canNavigateToStep?: (step: number) => boolean;
    className?: string;
}

/**
 * PillProgress
 * Modern pill-style progress indicator for mobile wizards
 * Shows step icons/numbers in a horizontal pill bar
 */
export function PillProgress({
    steps,
    currentStep,
    onStepClick,
    canNavigateToStep,
    className,
}: PillProgressProps) {
    return (
        <div className={cn('w-full', className)}>
            {/* Progress bar background */}
            <div className="relative h-12 bg-muted/50 rounded-2xl overflow-hidden backdrop-blur-sm border border-border/50">
                {/* Animated progress fill */}
                <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary/20 to-primary/10 rounded-2xl"
                    initial={false}
                    animate={{
                        width: `${((currentStep + 1) / steps.length) * 100}%`,
                    }}
                    transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
                />

                {/* Step pills */}
                <div className="relative flex items-center justify-between h-full px-2">
                    {steps.map((step, index) => {
                        const isCompleted = index < currentStep;
                        const isCurrent = index === currentStep;
                        const isClickable = canNavigateToStep ? canNavigateToStep(index) : false;

                        return (
                            <motion.button
                                key={step.id}
                                onClick={() => isClickable && onStepClick?.(index)}
                                disabled={!isClickable}
                                className={cn(
                                    'relative flex items-center gap-2 px-3 py-1.5 rounded-xl',
                                    'transition-all duration-200',
                                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                    isCurrent && 'bg-primary text-primary-foreground shadow-md',
                                    isCompleted && !isCurrent && 'text-primary',
                                    !isCompleted && !isCurrent && 'text-muted-foreground',
                                    isClickable && !isCurrent && 'hover:bg-muted cursor-pointer',
                                    !isClickable && 'cursor-default'
                                )}
                                whileTap={isClickable ? { scale: 0.95 } : undefined}
                            >
                                {/* Step indicator */}
                                <motion.div
                                    className={cn(
                                        'flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold',
                                        isCurrent && 'bg-primary-foreground/20',
                                        isCompleted && !isCurrent && 'bg-primary/20',
                                        !isCompleted && !isCurrent && 'bg-muted-foreground/20'
                                    )}
                                    initial={false}
                                    animate={{
                                        scale: isCurrent ? 1.1 : 1,
                                    }}
                                    transition={{ type: 'tween', duration: 0.1, ease: 'easeOut' }}
                                >
                                    {isCompleted ? (
                                        <Check className="w-3.5 h-3.5" />
                                    ) : (
                                        <span>{index + 1}</span>
                                    )}
                                </motion.div>

                                {/* Step label - only show on current step on mobile */}
                                <span
                                    className={cn(
                                        'text-xs font-medium transition-all duration-200',
                                        isCurrent ? 'opacity-100 max-w-20' : 'opacity-0 max-w-0 overflow-hidden',
                                        'md:opacity-100 md:max-w-none'
                                    )}
                                >
                                    {step.label}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>
            </div>

            {/* Current step description */}
            <motion.p
                key={currentStep}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center text-xs text-muted-foreground mt-2"
            >
                {steps[currentStep]?.description}
            </motion.p>
        </div>
    );
}

/**
 * MiniProgress
 * Compact dot-style progress for space-constrained areas
 */
export function MiniProgress({
    total,
    current,
    className,
}: {
    total: number;
    current: number;
    className?: string;
}) {
    return (
        <div className={cn('flex items-center gap-1.5', className)}>
            {Array.from({ length: total }).map((_, index) => (
                <motion.div
                    key={index}
                    className={cn(
                        'rounded-full transition-colors duration-200',
                        index === current
                            ? 'w-6 h-2 bg-primary'
                            : index < current
                                ? 'w-2 h-2 bg-primary/60'
                                : 'w-2 h-2 bg-muted-foreground/30'
                    )}
                    initial={false}
                    animate={{
                        scale: index === current ? 1 : 0.9,
                    }}
                    transition={{ type: 'tween', duration: 0.1, ease: 'easeOut' }}
                />
            ))}
        </div>
    );
}
