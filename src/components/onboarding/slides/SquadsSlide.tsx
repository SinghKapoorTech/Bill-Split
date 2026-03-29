import { motion } from 'framer-motion';
import { Equal } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const people = [
  {
    name: 'You',
    items: '$22.00',
    tax: '$2.09',
    tip: '$3.30',
    total: '$27.39',
    color: 'bg-indigo-500',
    initial: 'Y',
  },
  {
    name: 'Jamie',
    items: '$11.00',
    tax: '$1.04',
    tip: '$1.65',
    total: '$13.69',
    color: 'bg-rose-500',
    initial: 'J',
  },
];

export function SquadsSlide() {
  return (
    <OnboardingSlide
      headline="Fair splits, every time"
      body="Tax and tip distributed proportionally based on what you ordered. No more overpaying."
    >
      <motion.div
        className="w-full max-w-[300px] space-y-3"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Two person cards side by side */}
        <div className="grid grid-cols-2 gap-2.5">
          {people.map((person, i) => (
            <motion.div
              key={person.name}
              className="bg-card/70 backdrop-blur-xl border border-border/50 rounded-xl p-3 shadow-sm"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.15, duration: 0.35 }}
            >
              <div className="flex items-center gap-1.5 mb-2.5">
                <div className={`w-5 h-5 rounded-full ${person.color} flex items-center justify-center`}>
                  <span className="text-[8px] font-bold text-white">{person.initial}</span>
                </div>
                <span className="text-xs font-semibold">{person.name}</span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Items</span>
                  <span className="text-[10px] font-medium">{person.items}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Tax</span>
                  <span className="text-[10px] font-medium">{person.tax}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[10px] text-muted-foreground">Tip</span>
                  <span className="text-[10px] font-medium">{person.tip}</span>
                </div>
                <div className="border-t border-border/40 pt-1 mt-1 flex justify-between">
                  <span className="text-[10px] font-semibold">Total</span>
                  <span className="text-[10px] font-bold text-primary">{person.total}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Proportional explanation */}
        <motion.div
          className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.3 }}
        >
          <Equal className="w-3 h-3" />
          <span>Ordered more? Pay proportionally more tax & tip.</span>
        </motion.div>

        {/* Venmo badge */}
        <motion.div
          className="flex items-center justify-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.3 }}
        >
          <div className="flex items-center gap-1.5 bg-[#008CFF]/10 border border-[#008CFF]/20 rounded-full px-3 py-1.5">
            <span className="text-[10px] font-bold text-[#008CFF]">Venmo</span>
            <span className="text-[10px] text-muted-foreground">Request in one tap</span>
          </div>
        </motion.div>
      </motion.div>
    </OnboardingSlide>
  );
}
