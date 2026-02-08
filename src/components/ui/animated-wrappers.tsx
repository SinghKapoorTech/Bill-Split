import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '@/lib/utils';
import { forwardRef } from 'react';

interface AnimatedButtonWrapperProps extends HTMLMotionProps<'div'> {
    children: React.ReactNode;
    className?: string;
    disabled?: boolean;
    /** Animation intensity: 'subtle' (0.98), 'moderate' (0.95), 'playful' (0.9) */
    intensity?: 'subtle' | 'moderate' | 'playful';
}

const scaleValues = {
    subtle: { tap: 0.98, hover: 1.01 },
    moderate: { tap: 0.95, hover: 1.02 },
    playful: { tap: 0.9, hover: 1.05 },
};

/**
 * AnimatedButtonWrapper
 * Wraps any button or clickable element to add micro-interaction animations
 * Uses Framer Motion for smooth spring-based scale animations
 */
export const AnimatedButtonWrapper = forwardRef<HTMLDivElement, AnimatedButtonWrapperProps>(
    ({ children, className, disabled = false, intensity = 'moderate', ...props }, ref) => {
        const scales = scaleValues[intensity];

        if (disabled) {
            // No animation when disabled
            return (
                <div ref={ref} className={className} {...props as any}>
                    {children}
                </div>
            );
        }

        return (
            <motion.div
                ref={ref}
                whileTap={{ scale: scales.tap }}
                whileHover={{ scale: scales.hover }}
                transition={{
                    type: 'spring',
                    stiffness: 400,
                    damping: 17,
                }}
                className={cn('cursor-pointer', className)}
                {...props}
            >
                {children}
            </motion.div>
        );
    }
);

AnimatedButtonWrapper.displayName = 'AnimatedButtonWrapper';

/**
 * Pulse animation for success states
 */
export const PulseAnimation = ({ children, active }: { children: React.ReactNode; active: boolean }) => {
    return (
        <motion.div
            animate={active ? {
                scale: [1, 1.05, 1],
                opacity: [1, 0.8, 1],
            } : {}}
            transition={{
                duration: 0.3,
                ease: 'easeInOut',
            }}
        >
            {children}
        </motion.div>
    );
};

/**
 * Badge bounce animation for assignment actions
 */
export const BounceAnimation = ({ children, trigger }: { children: React.ReactNode; trigger: boolean }) => {
    return (
        <motion.div
            key={trigger ? 'bounced' : 'normal'}
            initial={trigger ? { scale: 0.8 } : false}
            animate={{ scale: 1 }}
            transition={{
                type: 'spring',
                stiffness: 500,
                damping: 15,
            }}
        >
            {children}
        </motion.div>
    );
};

/**
 * Slide-in animation for list items
 */
export const SlideInAnimation = ({
    children,
    index = 0,
    direction = 'up'
}: {
    children: React.ReactNode;
    index?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
}) => {
    const offsets = {
        up: { y: 20, x: 0 },
        down: { y: -20, x: 0 },
        left: { x: 20, y: 0 },
        right: { x: -20, y: 0 },
    };

    const offset = offsets[direction];

    return (
        <motion.div
            initial={{ opacity: 0, ...offset }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, ...offset }}
            transition={{
                duration: 0.25,
                delay: index * 0.05,
                ease: [0.4, 0, 0.2, 1],
            }}
        >
            {children}
        </motion.div>
    );
};

/**
 * Glow animation for highlighting elements
 */
export const GlowAnimation = ({
    children,
    active,
    color = 'primary'
}: {
    children: React.ReactNode;
    active: boolean;
    color?: 'primary' | 'success' | 'warning';
}) => {
    const glowColors = {
        primary: 'rgba(var(--primary), 0.4)',
        success: 'rgba(var(--success), 0.4)',
        warning: 'rgba(var(--warning), 0.4)',
    };

    return (
        <motion.div
            animate={active ? {
                boxShadow: [
                    `0 0 0 0 ${glowColors[color]}`,
                    `0 0 20px 4px ${glowColors[color]}`,
                    `0 0 0 0 ${glowColors[color]}`,
                ],
            } : {}}
            transition={{
                duration: 0.6,
                ease: 'easeInOut',
            }}
            style={{ borderRadius: 'inherit' }}
        >
            {children}
        </motion.div>
    );
};
