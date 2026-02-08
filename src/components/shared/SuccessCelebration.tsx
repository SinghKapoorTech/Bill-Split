import { motion, AnimatePresence } from 'framer-motion';
import { Check, PartyPopper } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import haptics from '@/utils/haptics';

interface SuccessCelebrationProps {
    show: boolean;
    onComplete?: () => void;
    message?: string;
    subMessage?: string;
    duration?: number;
    variant?: 'full' | 'inline' | 'toast';
}

/**
 * SuccessCelebration Component
 * Displays a celebratory animation when user completes a step or action
 * Includes confetti particles and a success checkmark
 */
export function SuccessCelebration({
    show,
    onComplete,
    message = 'Great job!',
    subMessage,
    duration = 2000,
    variant = 'full',
}: SuccessCelebrationProps) {
    const [particles, setParticles] = useState<Array<{ id: number; x: number; delay: number; color: string }>>([]);

    useEffect(() => {
        if (show) {
            // Trigger haptic feedback
            haptics.success();

            // Generate confetti particles
            const newParticles = Array.from({ length: 20 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                delay: Math.random() * 0.3,
                color: [
                    'hsl(var(--primary))',
                    'hsl(var(--success))',
                    'hsl(var(--warning))',
                    '#FFD700',
                    '#FF69B4',
                ][Math.floor(Math.random() * 5)],
            }));
            setParticles(newParticles);

            // Auto-dismiss after duration
            const timer = setTimeout(() => {
                onComplete?.();
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [show, duration, onComplete]);

    if (variant === 'toast') {
        return (
            <AnimatePresence>
                {show && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        className={cn(
                            'fixed bottom-24 left-1/2 -translate-x-1/2 z-50',
                            'flex items-center gap-3 px-6 py-4 rounded-2xl',
                            'bg-success text-success-foreground shadow-xl',
                        )}
                    >
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.1 }}
                        >
                            <Check className="w-6 h-6" />
                        </motion.div>
                        <span className="font-semibold">{message}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    if (variant === 'inline') {
        return (
            <AnimatePresence>
                {show && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="flex flex-col items-center justify-center py-8 gap-4"
                    >
                        <motion.div
                            className="relative"
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        >
                            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center">
                                <Check className="w-8 h-8 text-success" />
                            </div>
                            {/* Ripple effect */}
                            <motion.div
                                className="absolute inset-0 rounded-full border-2 border-success"
                                initial={{ scale: 1, opacity: 1 }}
                                animate={{ scale: 2, opacity: 0 }}
                                transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                        </motion.div>
                        <motion.p
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="text-lg font-semibold text-foreground"
                        >
                            {message}
                        </motion.p>
                        {subMessage && (
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-sm text-muted-foreground"
                            >
                                {subMessage}
                            </motion.p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        );
    }

    // Full screen variant
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={cn(
                        'fixed inset-0 z-50 flex flex-col items-center justify-center',
                        'bg-background/90 backdrop-blur-sm'
                    )}
                >
                    {/* Confetti particles */}
                    {particles.map((particle) => (
                        <motion.div
                            key={particle.id}
                            className="absolute w-3 h-3 rounded-full"
                            style={{
                                left: `${particle.x}%`,
                                backgroundColor: particle.color,
                            }}
                            initial={{ y: '40vh', opacity: 1, scale: 0 }}
                            animate={{
                                y: ['40vh', '-20vh'],
                                opacity: [1, 1, 0],
                                scale: [0, 1, 0.5],
                                rotate: [0, 360],
                            }}
                            transition={{
                                duration: 1.5,
                                delay: particle.delay,
                                ease: 'easeOut',
                            }}
                        />
                    ))}

                    {/* Center content */}
                    <motion.div
                        className="flex flex-col items-center gap-6 z-10"
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
                    >
                        {/* Success icon with pulse */}
                        <motion.div className="relative">
                            <motion.div
                                className="w-24 h-24 rounded-full bg-success flex items-center justify-center"
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                            >
                                <Check className="w-12 h-12 text-success-foreground" />
                            </motion.div>

                            {/* Pulsing ring */}
                            <motion.div
                                className="absolute inset-0 rounded-full border-4 border-success"
                                initial={{ scale: 1, opacity: 0.8 }}
                                animate={{ scale: 1.5, opacity: 0 }}
                                transition={{ duration: 1, repeat: 2, ease: 'easeOut' }}
                            />
                        </motion.div>

                        {/* Message */}
                        <div className="text-center space-y-2">
                            <motion.h2
                                className="text-2xl font-bold text-foreground"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                            >
                                {message}
                            </motion.h2>
                            {subMessage && (
                                <motion.p
                                    className="text-muted-foreground"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.4 }}
                                >
                                    {subMessage}
                                </motion.p>
                            )}
                        </div>

                        {/* Party popper icon */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.5, type: 'spring' }}
                        >
                            <PartyPopper className="w-8 h-8 text-warning" />
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

/**
 * StepCompleteBadge
 * Small inline badge that appears when a step is completed
 */
export function StepCompleteBadge({ show }: { show: boolean }) {
    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-success/20 text-success text-xs font-medium"
                >
                    <Check className="w-3 h-3" />
                    <span>Complete</span>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
