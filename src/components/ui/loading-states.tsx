import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SkeletonProps {
    className?: string;
}

/**
 * Skeleton - Basic animated skeleton placeholder
 */
export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                'animate-pulse rounded-md bg-muted/50',
                className
            )}
        />
    );
}

/**
 * SkeletonCard - Card-shaped skeleton for bill items
 */
export function SkeletonCard({ className }: { className?: string }) {
    return (
        <div className={cn('p-4 rounded-lg border bg-card', className)}>
            <div className="flex justify-between items-center gap-4">
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                </div>
                <div className="flex gap-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-8 rounded-md" />
                </div>
            </div>
            <div className="flex gap-2 mt-3">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
        </div>
    );
}

/**
 * SkeletonList - Multiple skeleton cards with stagger animation
 */
export function SkeletonList({ count = 3 }: { count?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1 }}
                >
                    <SkeletonCard />
                </motion.div>
            ))}
        </div>
    );
}

interface ProgressiveLoaderProps {
    stage: number;
    stages: string[];
    className?: string;
}

/**
 * ProgressiveLoader - Multi-stage loading indicator with progress
 */
export function ProgressiveLoader({ stage, stages, className }: ProgressiveLoaderProps) {
    const progress = ((stage + 1) / stages.length) * 100;

    return (
        <div className={cn('space-y-4', className)}>
            {/* Progress bar */}
            <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-primary to-primary-glow rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                />
            </div>

            {/* Stage indicator */}
            <div className="flex items-center justify-center gap-3">
                {/* Spinner */}
                <motion.div
                    className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />

                {/* Stage text with animation */}
                <motion.span
                    key={stage}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-sm text-muted-foreground"
                >
                    {stages[stage]}
                </motion.span>
            </div>

            {/* Stage dots */}
            <div className="flex justify-center gap-2">
                {stages.map((_, i) => (
                    <motion.div
                        key={i}
                        className={cn(
                            'w-2 h-2 rounded-full transition-colors duration-300',
                            i <= stage ? 'bg-primary' : 'bg-muted-foreground/30'
                        )}
                        initial={false}
                        animate={{
                            scale: i === stage ? 1.3 : 1,
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * useProgressiveLoading - Hook for simulating progressive loading stages
 */
export function useProgressiveLoading(stages: string[], intervalMs: number = 1500) {
    const [currentStage, setCurrentStage] = useState(0);
    const [isComplete, setIsComplete] = useState(false);

    useEffect(() => {
        if (currentStage < stages.length - 1) {
            const timer = setTimeout(() => {
                setCurrentStage(prev => prev + 1);
            }, intervalMs);
            return () => clearTimeout(timer);
        } else {
            setIsComplete(true);
        }
    }, [currentStage, stages.length, intervalMs]);

    const reset = () => {
        setCurrentStage(0);
        setIsComplete(false);
    };

    return { currentStage, isComplete, reset };
}

// Import useState and useEffect for the hook
import { useState, useEffect } from 'react';

/**
 * ReceiptAnalyzingLoader - Specialized loader for receipt analysis
 */
export function ReceiptAnalyzingLoader() {
    const stages = [
        'Scanning receipt...',
        'Finding items...',
        'Calculating totals...',
        'Extracting prices...',
        'Almost done...',
    ];

    const { currentStage } = useProgressiveLoading(stages, 1200);

    return (
        <div className="flex flex-col items-center justify-center py-12 px-6 space-y-6">
            {/* Animated receipt icon */}
            <motion.div
                className="relative w-20 h-24 bg-card rounded-lg border-2 border-primary/50 overflow-hidden"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
            >
                {/* Scan line */}
                <motion.div
                    className="absolute left-0 right-0 h-0.5 bg-primary"
                    animate={{ y: [0, 80, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                />

                {/* Receipt lines */}
                <div className="p-2 space-y-1.5">
                    <Skeleton className="h-1.5 w-full" />
                    <Skeleton className="h-1.5 w-3/4" />
                    <Skeleton className="h-1.5 w-5/6" />
                    <Skeleton className="h-1.5 w-2/3" />
                    <Skeleton className="h-1.5 w-4/5" />
                    <Skeleton className="h-1.5 w-1/2" />
                </div>
            </motion.div>

            <ProgressiveLoader stage={currentStage} stages={stages} />
        </div>
    );
}
