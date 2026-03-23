import { useEffect, useRef } from 'react';
import { useMotionValue, useTransform, animate, motion } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

/**
 * AnimatedCounter - Animates a number from 0 (or previous value) to the target value.
 * Creates a satisfying "tallying" effect for dollar amounts and totals.
 */
export function AnimatedCounter({
  value,
  duration = 0.6,
  prefix = '',
  suffix = '',
  decimals = 2,
  className,
}: AnimatedCounterProps) {
  const motionValue = useMotionValue(0);
  const hasAnimated = useRef(false);

  const display = useTransform(motionValue, (v) => {
    return `${prefix}${v.toFixed(decimals)}${suffix}`;
  });

  useEffect(() => {
    // On first render, animate from 0. On subsequent changes, animate from current.
    const from = hasAnimated.current ? motionValue.get() : 0;
    hasAnimated.current = true;

    const controls = animate(motionValue, value, {
      duration,
      ease: [0.4, 0, 0.2, 1],
    });

    return () => controls.stop();
  }, [value, duration, motionValue]);

  return <motion.span className={className}>{display}</motion.span>;
}
