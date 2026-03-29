import { motion } from 'framer-motion';
import { ReceiptText, Zap, CalendarDays, Home } from 'lucide-react';
import { OnboardingSlide } from '../OnboardingSlide';

const billTypes = [
  {
    icon: ReceiptText,
    label: 'Scan Receipt',
    gradient: 'from-indigo-500 to-violet-500',
    bg: 'bg-indigo-500/10',
  },
  {
    icon: Zap,
    label: 'Quick Expense',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-500/10',
  },
  {
    icon: CalendarDays,
    label: 'Group Trip',
    gradient: 'from-orange-500 to-amber-500',
    bg: 'bg-orange-500/10',
  },
  {
    icon: Home,
    label: 'Airbnb Split',
    gradient: 'from-rose-500 to-pink-500',
    bg: 'bg-rose-500/10',
  },
];

export function BillTypesSlide() {
  return (
    <OnboardingSlide
      headline="Split Any Bill, Any Way"
      body="Receipts, quick expenses, group trips, or Airbnb stays — all covered."
    >
      <div className="grid grid-cols-2 gap-2.5 w-full max-w-[260px]">
        {billTypes.map((item, i) => (
          <motion.div
            key={item.label}
            className={`flex flex-col items-center gap-2 rounded-xl p-3 ${item.bg} border border-border/40`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.1, duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${item.gradient} flex items-center justify-center shadow-sm`}>
              <item.icon className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-[11px] font-medium whitespace-nowrap">{item.label}</span>
          </motion.div>
        ))}
      </div>
    </OnboardingSlide>
  );
}
