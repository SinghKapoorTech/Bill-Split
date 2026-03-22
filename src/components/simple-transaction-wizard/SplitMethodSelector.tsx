import { useState } from 'react';
import { Person } from '@/types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { RotateCcw } from 'lucide-react';

export type { SplitMethod } from '@/components/shared/wizard-steps/PaidByBanner';

interface SplitMethodSelectorProps {
  splitMethod: 'equal' | 'percentage' | 'exact';
  people: Person[];
  amount: number;
  percentages: Record<string, number>;
  onPercentagesChange: (percentages: Record<string, number>) => void;
  exactAmounts: Record<string, number>;
  onExactAmountsChange: (amounts: Record<string, number>) => void;
}

export function SplitMethodSelector({
  splitMethod,
  people,
  amount,
  percentages,
  onPercentagesChange,
  exactAmounts,
  onExactAmountsChange,
}: SplitMethodSelectorProps) {
  if (splitMethod === 'equal') return null;

  // Track which field is being edited so we can show raw user input
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const handlePercentageFocus = (personId: string) => {
    setEditingField(`pct-${personId}`);
    setEditingValue('');
  };

  const handlePercentageChange = (personId: string, value: string) => {
    // Allow free typing — only update display value
    setEditingValue(value);
    // Parse and propagate to parent
    const num = value === '' ? 0 : parseFloat(value);
    if (!isNaN(num) && num >= 0) {
      onPercentagesChange({ ...percentages, [personId]: num });
    }
  };

  const handlePercentageBlur = () => {
    setEditingField(null);
    setEditingValue('');
  };

  const handleExactFocus = (personId: string) => {
    setEditingField(`exact-${personId}`);
    setEditingValue('');
  };

  const handleExactChange = (personId: string, value: string) => {
    const cleaned = value.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    let sanitized = cleaned;
    if (parts.length > 2) sanitized = parts[0] + '.' + parts.slice(1).join('');
    if (parts[1] && parts[1].length > 2) sanitized = parts[0] + '.' + parts[1].slice(0, 2);

    setEditingValue(sanitized);
    const num = sanitized === '' || sanitized === '.' ? 0 : parseFloat(sanitized);
    if (!isNaN(num) && num >= 0) {
      onExactAmountsChange({ ...exactAmounts, [personId]: num });
    }
  };

  const handleExactBlur = () => {
    setEditingField(null);
    setEditingValue('');
  };

  const distributeEqually = () => {
    if (people.length === 0) return;
    if (splitMethod === 'percentage') {
      const equalPct = Math.round((100 / people.length) * 100) / 100;
      const newPcts: Record<string, number> = {};
      people.forEach((p, i) => {
        newPcts[p.id] = i === people.length - 1
          ? Math.round((100 - equalPct * (people.length - 1)) * 100) / 100
          : equalPct;
      });
      onPercentagesChange(newPcts);
    } else if (splitMethod === 'exact') {
      const equalAmt = Math.round((amount / people.length) * 100) / 100;
      const newAmts: Record<string, number> = {};
      people.forEach((p, i) => {
        newAmts[p.id] = i === people.length - 1
          ? Math.round((amount - equalAmt * (people.length - 1)) * 100) / 100
          : equalAmt;
      });
      onExactAmountsChange(newAmts);
    }
  };

  // Split the rest equally among everyone except this person
  const splitRestEqually = (personId: string) => {
    const others = people.filter(p => p.id !== personId);
    if (others.length === 0) return;

    if (splitMethod === 'percentage') {
      const thisPct = percentages[personId] ?? 0;
      const remaining = 100 - thisPct;
      const equalShare = Math.round((remaining / others.length) * 100) / 100;
      const newPcts = { ...percentages };
      others.forEach((p, i) => {
        newPcts[p.id] = i === others.length - 1
          ? Math.round((remaining - equalShare * (others.length - 1)) * 100) / 100
          : equalShare;
      });
      onPercentagesChange(newPcts);
    } else if (splitMethod === 'exact') {
      const thisAmt = exactAmounts[personId] ?? 0;
      const remaining = amount - thisAmt;
      const equalShare = Math.round((remaining / others.length) * 100) / 100;
      const newAmts = { ...exactAmounts };
      others.forEach((p, i) => {
        newAmts[p.id] = i === others.length - 1
          ? Math.round((remaining - equalShare * (others.length - 1)) * 100) / 100
          : equalShare;
      });
      onExactAmountsChange(newAmts);
    }
  };

  // Validation
  const pctSum = Object.values(percentages).reduce((a, b) => a + b, 0);
  const exactSum = Object.values(exactAmounts).reduce((a, b) => a + b, 0);
  const pctValid = Math.abs(pctSum - 100) < 0.02;
  const exactValid = Math.abs(exactSum - amount) < 0.02;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {splitMethod === 'percentage' ? 'Set percentages' : 'Set amounts'}
        </span>
        <button
          type="button"
          onClick={distributeEqually}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
        >
          <RotateCcw className="w-3 h-3" />
          Split equally
        </button>
      </div>

      {people.map(person => {
        const isEditingPct = editingField === `pct-${person.id}`;
        const isEditingExact = editingField === `exact-${person.id}`;

        return (
          <div key={person.id} className="flex items-center gap-2">
            <span className="text-sm font-medium truncate min-w-0">
              {person.name}
            </span>
            <button
              type="button"
              onClick={() => splitRestEqually(person.id)}
              className="ml-auto text-[11px] text-muted-foreground hover:text-blue-600 transition-colors whitespace-nowrap"
            >
              Split rest
            </button>

            {splitMethod === 'percentage' ? (
              <div className="relative w-24 shrink-0">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={isEditingPct ? editingValue : (percentages[person.id] ?? 0)}
                  onFocus={() => handlePercentageFocus(person.id)}
                  onChange={e => handlePercentageChange(person.id, e.target.value)}
                  onBlur={handlePercentageBlur}
                  className="h-9 text-sm pr-7 text-right"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  %
                </span>
              </div>
            ) : (
              <div className="relative w-28 shrink-0">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  $
                </span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={isEditingExact ? editingValue : (exactAmounts[person.id] ?? 0)}
                  onFocus={() => handleExactFocus(person.id)}
                  onChange={e => handleExactChange(person.id, e.target.value)}
                  onBlur={handleExactBlur}
                  className="h-9 text-sm pl-7 text-right"
                />
              </div>
            )}
          </div>
        );
      })}

      {/* Validation bar */}
      <div className={cn(
        "flex items-center justify-between pt-2 border-t border-border/40 text-xs font-medium",
        splitMethod === 'percentage'
          ? (pctValid ? "text-green-600" : "text-amber-600")
          : (exactValid ? "text-green-600" : "text-amber-600")
      )}>
        <span>Total</span>
        {splitMethod === 'percentage' ? (
          <span>{pctSum.toFixed(1)}% of 100%</span>
        ) : (
          <span>${exactSum.toFixed(2)} of ${amount.toFixed(2)}</span>
        )}
      </div>
    </div>
  );
}
