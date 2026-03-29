import { motion } from 'framer-motion';
import { Users } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const members = ['Alex', 'Jamie', 'Sam'];

export function SquadsSlide() {
  return (
    <OnboardingSlide
      headline="Save Your Crews"
      body="Create reusable groups. One tap adds the whole crew to any bill."
    >
      <motion.div
        className="w-full max-w-[240px] bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-5 shadow-lg"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Squad header */}
        <div className="flex items-center gap-2 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <span className="font-semibold text-sm">Roommates</span>
        </div>

        {/* Member chips */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {members.map((name, i) => (
            <motion.div
              key={name}
              className="bg-primary/10 text-primary text-xs font-medium px-2.5 py-1 rounded-full"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: 0.2 + i * 0.15,
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

        {/* Add squad button mockup */}
        <motion.div
          className="w-full bg-primary text-primary-foreground text-xs font-medium py-1.5 rounded-lg text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55, duration: 0.3 }}
        >
          Add Squad &rarr;
        </motion.div>
      </motion.div>
    </OnboardingSlide>
  );
}
