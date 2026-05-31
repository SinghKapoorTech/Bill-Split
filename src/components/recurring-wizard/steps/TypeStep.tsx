import { Receipt, Zap, Home } from 'lucide-react';
import { RecurringGeneratedType } from '@/types/recurring.types';

interface TypeStepProps {
  onSelect: (type: RecurringGeneratedType) => void;
  selected?: RecurringGeneratedType;
}

// Static class strings per option (Tailwind can't see dynamically-built names).
const OPTIONS: {
  type: RecurringGeneratedType;
  icon: typeof Receipt;
  title: string;
  description: string;
  card: string;
  iconWrap: string;
  titleHover: string;
}[] = [
  {
    type: 'quick',
    icon: Zap,
    title: 'Quick Expense',
    description: 'A simple, fixed amount split on a schedule',
    card: 'hover:bg-warning/[0.03] hover:border-warning/30 data-[selected=true]:border-warning/50 data-[selected=true]:bg-warning/[0.05]',
    iconWrap: 'bg-warning/10 text-warning',
    titleHover: 'group-hover:text-warning',
  },
  {
    type: 'detailed',
    icon: Receipt,
    title: 'Detailed Bill',
    description: 'Fixed line items with tax & tip',
    card: 'hover:bg-info/[0.03] hover:border-info/30 data-[selected=true]:border-info/50 data-[selected=true]:bg-info/[0.05]',
    iconWrap: 'bg-info/10 text-info',
    titleHover: 'group-hover:text-info',
  },
  {
    type: 'airbnb',
    icon: Home,
    title: 'Airbnb / House',
    description: 'A recurring stay split with guests',
    card: 'hover:bg-destructive/[0.03] hover:border-destructive/30 data-[selected=true]:border-destructive/50 data-[selected=true]:bg-destructive/[0.05]',
    iconWrap: 'bg-destructive/10 text-destructive',
    titleHover: 'group-hover:text-destructive',
  },
];

/**
 * First step of the recurring wizard: pick which kind of bill each cycle generates.
 */
export function TypeStep({ onSelect, selected }: TypeStepProps) {
  return (
    <div className="flex flex-col gap-4 p-4 max-w-md mx-auto mt-4">
      <div className="text-center space-y-1 mb-2">
        <h2 className="text-xl font-bold">What kind of recurring bill?</h2>
        <p className="text-sm text-muted-foreground">
          Pick a type — the next steps adapt to your choice.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {OPTIONS.map(({ type, icon: Icon, title, description, card, iconWrap, titleHover }) => (
          <button
            key={type}
            onClick={() => onSelect(type)}
            data-selected={selected === type}
            className={`group relative flex items-center gap-4 p-4 rounded-2xl border border-border/40 bg-card text-left overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md active:scale-[0.98] ${card}`}
          >
            <div
              className={`relative flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform duration-300 shadow-sm ${iconWrap}`}
            >
              <Icon className="w-6 h-6" />
            </div>
            <div className="flex flex-col relative z-10">
              <span className={`font-semibold text-foreground text-base transition-colors ${titleHover}`}>
                {title}
              </span>
              <span className="text-sm text-muted-foreground mt-0.5">{description}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
