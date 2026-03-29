import { motion } from 'framer-motion';
import { Camera, Sparkles, Check } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const steps = [
  { icon: Camera, label: 'Snap', color: 'from-cyan-500 to-blue-500' },
  { icon: Sparkles, label: 'Split', color: 'from-indigo-500 to-violet-500' },
  { icon: Check, label: 'Settle', color: 'from-emerald-500 to-teal-500' },
];

const mockItems = [
  { name: 'Margherita Pizza', price: '$14.00' },
  { name: 'Caesar Salad', price: '$9.50' },
  { name: 'Iced Tea (x2)', price: '$6.00' },
];

export function HeroSlide() {
  return (
    <OnboardingSlide
      headline="Snap. Split. Settle."
      body="AI reads your receipt in seconds. No more manual math."
    >
      <div className="flex flex-col items-center gap-4 w-full max-w-[280px]">
        {/* Step icons */}
        <div className="flex items-center gap-2">
          {steps.map((step, i) => (
            <motion.div
              key={step.label}
              className="flex items-center gap-2"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + i * 0.15, duration: 0.4, type: 'spring', stiffness: 300, damping: 20 }}
            >
              <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center shadow-sm`}>
                <step.icon className="w-4.5 h-4.5 text-white" />
              </div>
              {i < steps.length - 1 && (
                <motion.div
                  className="w-5 h-0.5 bg-border rounded-full"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.3 + i * 0.15, duration: 0.3 }}
                />
              )}
            </motion.div>
          ))}
        </div>

        {/* Mock extracted items card */}
        <motion.div
          className="w-full bg-card/70 backdrop-blur-xl border border-border/50 rounded-2xl p-4 shadow-lg"
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <div className="flex items-center gap-1.5 mb-2.5">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-medium text-primary">AI Extracted</span>
          </div>
          <div className="space-y-1.5">
            {mockItems.map((item, i) => (
              <motion.div
                key={item.name}
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.65 + i * 0.1, duration: 0.3 }}
              >
                <span className="text-xs text-foreground">{item.name}</span>
                <span className="text-xs font-medium text-foreground">{item.price}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </OnboardingSlide>
  );
}
