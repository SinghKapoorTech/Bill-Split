import { motion } from 'framer-motion';
import { Camera, Sparkles, Check, ArrowRight } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const mockItems = [
  { name: 'Margherita Pizza', price: '$14.00', people: ['A', 'J'], delay: 0.7 },
  { name: 'Caesar Salad', price: '$9.50', people: ['S'], delay: 0.85 },
  { name: 'Sparkling Water ×2', price: '$6.00', people: ['A', 'J', 'S'], delay: 1.0 },
];

const avatarColors: Record<string, string> = {
  A: 'bg-indigo-500',
  J: 'bg-rose-500',
  S: 'bg-emerald-500',
};

export function HeroSlide() {
  return (
    <OnboardingSlide
      headline="Split any bill in seconds"
      body="Snap a receipt, AI does the math, everyone pays their share."
    >
      <div className="flex flex-col items-center gap-5 w-full max-w-[300px]">

        {/* Snap → AI → Done flow */}
        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center shadow-sm">
            <Camera className="w-4.5 h-4.5 text-white" />
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />

          <motion.div
            className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-xl px-3.5 py-2.5"
            animate={{ scale: [1, 1.04, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ delay: 0.8, duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-bold text-primary">AI</span>
          </motion.div>

          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/40" />

          <motion.div
            className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 1.2, duration: 0.4, type: 'spring', stiffness: 300, damping: 20 }}
          >
            <Check className="w-4.5 h-4.5 text-emerald-500" />
          </motion.div>
        </motion.div>

        {/* Extracted items card */}
        <motion.div
          className="w-full bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl shadow-lg"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          <div className="flex items-center gap-1.5 px-4 pt-3.5 pb-2.5 border-b border-border/40">
            <Sparkles className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary">3 items extracted</span>
            <motion.div
              className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          </div>

          <div className="px-4 py-3 space-y-2.5">
            {mockItems.map((item) => (
              <motion.div
                key={item.name}
                className="flex items-center gap-2"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: item.delay, duration: 0.3 }}
              >
                <span className="text-xs text-foreground flex-1 truncate">{item.name}</span>
                <span className="text-xs font-semibold text-foreground shrink-0">{item.price}</span>
                <div className="flex -space-x-1 shrink-0">
                  {item.people.map((p) => (
                    <div
                      key={p}
                      className={`w-4.5 h-4.5 rounded-full ${avatarColors[p]} border border-background flex items-center justify-center`}
                    >
                      <span className="text-[7px] font-bold text-white">{p}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div
            className="px-4 py-2.5 border-t border-border/40 flex justify-between items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.15, duration: 0.3 }}
          >
            <span className="text-[10px] text-muted-foreground">incl. tax & tip</span>
            <span className="text-xs font-bold text-foreground">$29.50 total</span>
          </motion.div>
        </motion.div>

      </div>
    </OnboardingSlide>
  );
}
