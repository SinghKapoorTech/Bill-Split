import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

interface ScanSuccessAnimationProps {
    show: boolean;
    onComplete: () => void;
    message?: string;
}

/**
 * Success animation overlay displayed after successful receipt scan
 * Features: animated checkmark, confetti particles, and success message
 */
export function ScanSuccessAnimation({
    show,
    onComplete,
    message = 'Receipt Analyzed!'
}: ScanSuccessAnimationProps) {

    // Generate confetti particles
    const particles = Array.from({ length: 16 }, (_, i) => ({
        id: i,
        x: Math.random() * 160 - 80, // Random spread -80 to 80
        y: Math.random() * 160 - 80,
        rotation: Math.random() * 360,
        scale: 0.4 + Math.random() * 0.4,
        delay: Math.random() * 0.15,
        color: [
            '#3b82f6', // blue
            '#ec4899', // pink
            '#10b981', // emerald
            '#f59e0b', // amber
            '#8b5cf6', // violet
        ][Math.floor(Math.random() * 5)]
    }));

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    onAnimationComplete={(definition) => {
                        // Call onComplete when exit animation finishes
                        if (definition === 'exit') {
                            onComplete();
                        }
                    }}
                >
                    {/* Backdrop */}
                    <motion.div
                        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                    />

                    {/* Content container */}
                    <motion.div
                        className="relative flex flex-col items-center gap-4"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0, y: -20 }}
                        transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 25,
                            delay: 0.05
                        }}
                        onAnimationComplete={() => {
                            // Auto-dismiss quickly after animation completes
                            setTimeout(onComplete, 800);
                        }}
                    >
                        {/* Confetti particles */}
                        {particles.map((particle) => (
                            <motion.div
                                key={particle.id}
                                className="absolute w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: particle.color }}
                                initial={{
                                    x: 0,
                                    y: 0,
                                    scale: 0,
                                    opacity: 1,
                                    rotate: 0
                                }}
                                animate={{
                                    x: particle.x,
                                    y: particle.y,
                                    scale: particle.scale,
                                    opacity: 0,
                                    rotate: particle.rotation
                                }}
                                transition={{
                                    duration: 0.5,
                                    delay: 0.1 + particle.delay,
                                    ease: 'easeOut'
                                }}
                            />
                        ))}

                        {/* Success circle with checkmark */}
                        <motion.div
                            className="relative w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-2xl"
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{
                                type: 'spring',
                                stiffness: 300,
                                damping: 15,
                                delay: 0.05
                            }}
                        >
                            {/* Glow effect */}
                            <motion.div
                                className="absolute inset-0 rounded-full bg-emerald-400"
                                initial={{ scale: 1, opacity: 0.5 }}
                                animate={{ scale: 1.4, opacity: 0 }}
                                transition={{
                                    duration: 0.4,
                                    delay: 0.15,
                                    ease: 'easeOut'
                                }}
                            />

                            {/* Checkmark icon */}
                            <motion.div
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{
                                    type: 'spring',
                                    stiffness: 500,
                                    damping: 20,
                                    delay: 0.15
                                }}
                            >
                                <Check className="w-10 h-10 text-white stroke-[3]" />
                            </motion.div>
                        </motion.div>

                        {/* Success message */}
                        <motion.div
                            className="text-center"
                            initial={{ y: 15, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.2, duration: 0.2 }}
                        >
                            <h2 className="text-xl font-bold text-foreground">
                                {message}
                            </h2>
                        </motion.div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}

