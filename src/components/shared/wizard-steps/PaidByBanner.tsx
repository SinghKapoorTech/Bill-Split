import { Person } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export type SplitMethod = 'equal' | 'percentage' | 'exact';

const SPLIT_OPTIONS: { value: SplitMethod; label: string; description: string }[] = [
  { value: 'equal', label: 'equally', description: 'Everyone pays the same' },
  { value: 'percentage', label: 'by percentage', description: 'Set custom percentages' },
  { value: 'exact', label: 'by exact amounts', description: 'Set specific amounts' },
];

interface PaidByBannerProps {
  people: Person[];
  paidById?: string;
  onPaidByChange?: (paidById: string) => void;
  splitMethod?: SplitMethod;
  onSplitMethodChange?: (method: SplitMethod) => void;
}

/**
 * Reusable "Paid by" banner for wizard steps
 */
export function PaidByBanner({
  people,
  paidById,
  onPaidByChange,
  splitMethod = 'equal',
  onSplitMethodChange,
}: PaidByBannerProps) {
  const { user } = useAuth();
  const [paidByOpen, setPaidByOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  if (people.length === 0) return null;

  const currentSplitLabel = SPLIT_OPTIONS.find(o => o.value === splitMethod)?.label || 'equally';

  // Determine the current "paid by" display label
  const effectivePaidById = paidById || user?.uid;
  const paidByPerson = people.find(p => {
    const isMe = p.id === user?.uid || (p as Person & { userId?: string }).userId === user?.uid || p.id === `user-${user?.uid}`;
    const optionValue = isMe && user ? user.uid : p.id;
    return optionValue === effectivePaidById;
  });
  const paidByIsMe = paidByPerson && (
    paidByPerson.id === user?.uid ||
    (paidByPerson as Person & { userId?: string }).userId === user?.uid ||
    paidByPerson.id === `user-${user?.uid}`
  );
  const paidByLabel = paidByIsMe ? 'you' : (paidByPerson?.name.split(' ')[0] || 'you');

  return (
    <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground pt-4 mb-2 flex-wrap">
      <span>Paid by</span>
      <Popover open={paidByOpen} onOpenChange={setPaidByOpen}>
        <PopoverTrigger asChild>
          <button className="h-7 px-2 py-0 border rounded hover:bg-muted font-semibold text-foreground shadow-sm">
            {paidByLabel}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-48 p-1" align="center" sideOffset={6}>
          {people.map((person: Person) => {
            const isMe = person.id === user?.uid || (person as Person & { userId?: string }).userId === user?.uid || person.id === `user-${user?.uid}`;
            const optionValue = isMe && user ? user.uid : person.id;
            const label = isMe ? 'you' : person.name.split(' ')[0];
            const isSelected = optionValue === effectivePaidById;

            return (
              <button
                key={person.id}
                onClick={() => {
                  onPaidByChange?.(optionValue);
                  setPaidByOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                  isSelected
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <span className="flex-1 text-sm font-medium">{label}</span>
                {isSelected && (
                  <Check className="w-4 h-4 text-blue-600 shrink-0" />
                )}
              </button>
            );
          })}
        </PopoverContent>
      </Popover>
      <span>and split</span>
      {onSplitMethodChange ? (
        <Popover open={splitOpen} onOpenChange={setSplitOpen}>
          <PopoverTrigger asChild>
            <button className="h-7 px-2 py-0 border rounded hover:bg-muted font-semibold text-foreground shadow-sm">
              {currentSplitLabel}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-1" align="center" sideOffset={6}>
            {SPLIT_OPTIONS.map(option => (
              <button
                key={option.value}
                onClick={() => {
                  onSplitMethodChange(option.value);
                  setSplitOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors",
                  splitMethod === option.value
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-muted text-foreground"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.description}</div>
                </div>
                {splitMethod === option.value && (
                  <Check className="w-4 h-4 text-blue-600 shrink-0" />
                )}
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : (
        <button className="h-7 px-2 py-0 border rounded hover:bg-muted font-semibold text-foreground shadow-sm">
          equally
        </button>
      )}
    </div>
  );
}
