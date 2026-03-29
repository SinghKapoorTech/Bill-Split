import { motion } from 'framer-motion';
import { Users, Check } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const squadMembers = ['Alex', 'Jamie', 'Sam'];
const avatarColors = ['bg-indigo-500', 'bg-violet-500', 'bg-emerald-500'];

export function EventsSlide() {
  return (
    <OnboardingSlide
      headline="Built for groups"
      body="Save your crews for quick splits. Bundle trip bills in one event — settle with fewer payments."
    >
      <motion.div
        className="w-full max-w-[280px] bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg overflow-hidden"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Squads section */}
        <div className="px-5 pt-4 pb-3">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Squad</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold mr-1">Roommates</span>
            {squadMembers.map((name, i) => (
              <motion.div
                key={name}
                className="bg-primary/10 text-primary text-[10px] font-medium px-2 py-0.5 rounded-full"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{
                  delay: 0.3 + i * 0.12,
                  duration: 0.3,
                  type: 'spring',
                  stiffness: 400,
                  damping: 17,
                }}
              >
                {name}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-border/40" />

        {/* Events section */}
        <div className="px-5 pt-3 pb-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.35 }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Ski Trip 2026</p>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex -space-x-1.5">
                  {avatarColors.map((color, i) => (
                    <motion.div
                      key={i}
                      className={`w-5 h-5 rounded-full ${color} border-2 border-background`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.08, duration: 0.25 }}
                    />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">4 bills &middot; $420</span>
              </div>

              <motion.div
                className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full px-2 py-0.5"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8, duration: 0.3 }}
              >
                <Check className="w-2.5 h-2.5" />
                <span className="text-[9px] font-medium">Smart settle-up</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </OnboardingSlide>
  );
}
