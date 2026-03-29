import { motion } from 'framer-motion';
import { Camera, Users, CreditCard } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const steps = [
  {
    icon: Camera,
    label: 'Scan',
    sub: 'Snap a receipt or add items',
    gradient: 'from-cyan-500 to-blue-500',
    bg: 'bg-cyan-500/10',
    delay: 0.2,
  },
  {
    icon: Users,
    label: 'Split',
    sub: 'Assign items, fair tax & tip',
    gradient: 'from-violet-500 to-indigo-500',
    bg: 'bg-violet-500/10',
    delay: 0.4,
  },
  {
    icon: CreditCard,
    label: 'Settle',
    sub: 'Request via Venmo in one tap',
    gradient: 'from-emerald-500 to-teal-500',
    bg: 'bg-emerald-500/10',
    delay: 0.6,
  },
];

export function BillTypesSlide() {
  return (
    <OnboardingSlide
      headline="Three steps. That's it."
      body="From receipt to settled — no spreadsheets, no awkward math."
    >
      <div className="flex items-start gap-3 w-full max-w-[320px]">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-start flex-1">
            <motion.div
              className="flex flex-col items-center gap-2.5 flex-1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: step.delay, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
            >
              <motion.div
                className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-md`}
                whileHover={{ scale: 1.05 }}
              >
                <step.icon className="w-5 h-5 text-white" />
              </motion.div>
              <div className="text-center">
                <p className="text-sm font-semibold mb-0.5">{step.label}</p>
                <p className="text-[10px] text-muted-foreground leading-tight max-w-[90px]">{step.sub}</p>
              </div>
            </motion.div>

            {/* Connector line */}
            {i < steps.length - 1 && (
              <motion.div
                className="flex items-center pt-5 -mx-1"
                initial={{ opacity: 0, scaleX: 0 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: step.delay + 0.15, duration: 0.3 }}
              >
                <div className="w-4 h-px bg-border" />
                <div className="w-0 h-0 border-t-[3px] border-t-transparent border-b-[3px] border-b-transparent border-l-[4px] border-l-border" />
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </OnboardingSlide>
  );
}
