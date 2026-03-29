import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const avatarColors = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-emerald-500',
];

export function EventsSlide() {
  return (
    <OnboardingSlide
      headline="Track Group Trips"
      body="Bundle multiple bills in one event. Invite friends and settle with fewer transactions."
    >
      <motion.div
        className="w-full max-w-[260px] bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-lg"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{
          opacity: 1,
          scale: 1,
          y: [0, -4, 0],
        }}
        transition={{
          opacity: { duration: 0.4 },
          scale: { duration: 0.4 },
          y: { duration: 3, repeat: Infinity, ease: 'easeInOut', delay: 0.5 },
        }}
      >
        <p className="font-semibold text-sm mb-3">Ski Trip 2026</p>

        {/* Avatar row */}
        <div className="flex items-center mb-3">
          <div className="flex -space-x-2">
            {avatarColors.map((color, i) => (
              <motion.div
                key={i}
                className={`w-7 h-7 rounded-full ${color} border-2 border-background`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.3 }}
              />
            ))}
          </div>
          <span className="text-xs text-muted-foreground ml-2">3 friends</span>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">4 bills &middot; $420</span>
          <motion.div
            className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full px-2 py-0.5"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.3 }}
          >
            <Check className="w-3 h-3" />
            <span className="text-[10px] font-medium">Smart settle-up</span>
          </motion.div>
        </div>
      </motion.div>
    </OnboardingSlide>
  );
}
