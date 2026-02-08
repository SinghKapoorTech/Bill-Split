import { useRef, useState } from 'react';
import { motion, PanInfo, useAnimation } from 'framer-motion';
import { cn } from '@/lib/utils';

interface SwipeableStepContainerProps {
    children: React.ReactNode;
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
    canSwipeLeft?: boolean;
    canSwipeRight?: boolean;
    className?: string;
}

const SWIPE_THRESHOLD = 50; // Minimum distance to trigger navigation
const SWIPE_VELOCITY_THRESHOLD = 300; // Velocity threshold for quick swipes

/**
 * SwipeableStepContainer
 * Wraps wizard step content with swipe gesture support
 * Swipe right = go back, Swipe left = go forward
 */
export function SwipeableStepContainer({
    children,
    onSwipeLeft,
    onSwipeRight,
    canSwipeLeft = true,
    canSwipeRight = true,
    className,
}: SwipeableStepContainerProps) {
    const controls = useAnimation();
    const [isDragging, setIsDragging] = useState(false);
    const constraintsRef = useRef(null);

    const handleDragStart = () => {
        setIsDragging(true);
    };

    const handleDragEnd = (
        _event: MouseEvent | TouchEvent | PointerEvent,
        info: PanInfo
    ) => {
        setIsDragging(false);
        const { offset, velocity } = info;

        // Quick swipe detection (velocity-based)
        const isQuickSwipe = Math.abs(velocity.x) > SWIPE_VELOCITY_THRESHOLD;

        // Distance-based swipe detection
        const isDistanceSwipe = Math.abs(offset.x) > SWIPE_THRESHOLD;

        if (isQuickSwipe || isDistanceSwipe) {
            if (offset.x > 0 && canSwipeRight && onSwipeRight) {
                // Swiped right - go back
                controls.start({ x: 50, opacity: 0, transition: { duration: 0.15 } }).then(() => {
                    onSwipeRight();
                    controls.set({ x: -30 });
                    controls.start({ x: 0, opacity: 1, transition: { duration: 0.15 } });
                });
                return;
            } else if (offset.x < 0 && canSwipeLeft && onSwipeLeft) {
                // Swiped left - go forward
                controls.start({ x: -50, opacity: 0, transition: { duration: 0.15 } }).then(() => {
                    onSwipeLeft();
                    controls.set({ x: 30 });
                    controls.start({ x: 0, opacity: 1, transition: { duration: 0.15 } });
                });
                return;
            }
        }

        // Snap back if swipe wasn't completed
        controls.start({ x: 0, opacity: 1, transition: { duration: 0.1 } });
    };

    return (
        <div ref={constraintsRef} className={cn('overflow-hidden touch-pan-y', className)}>
            <motion.div
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.1}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                animate={controls}
                transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
                className={cn(
                    'cursor-grab',
                    isDragging && 'cursor-grabbing'
                )}
                style={{ touchAction: 'pan-y' }}
            >
                {children}
            </motion.div>

            {/* Edge indicators - show when dragging */}
            {isDragging && (
                <>
                    {canSwipeRight && (
                        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-primary/20 to-transparent pointer-events-none" />
                    )}
                    {canSwipeLeft && (
                        <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-primary/20 to-transparent pointer-events-none" />
                    )}
                </>
            )}
        </div>
    );
}

/**
 * useSwipeNavigation hook
 * Simplified hook for handling swipe navigation state
 */
export function useSwipeNavigation(
    currentStep: number,
    totalSteps: number,
    canProceed: boolean
) {
    const canSwipeRight = currentStep > 0;
    const canSwipeLeft = currentStep < totalSteps - 1 && canProceed;

    return {
        canSwipeRight,
        canSwipeLeft,
    };
}
