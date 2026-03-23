import { motion } from 'framer-motion';

/**
 * ScanningOverlay - Animated scanning line effect shown while AI processes a receipt.
 * Renders a glowing horizontal line that scans up and down over the receipt image.
 */
export function ScanningOverlay() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-10">
      {/* Scanning line */}
      <motion.div
        className="absolute left-0 right-0 h-0.5"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary)) 20%, hsl(var(--primary)) 80%, transparent 100%)',
          boxShadow: '0 0 15px 3px hsl(var(--primary) / 0.4), 0 0 30px 6px hsl(var(--primary) / 0.2)',
        }}
        animate={{ top: ['0%', '100%', '0%'] }}
        transition={{
          duration: 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
      {/* Subtle overlay tint */}
      <div className="absolute inset-0 bg-primary/5" />
    </div>
  );
}
