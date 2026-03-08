import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';

export type BalanceDirection = 'you-owe' | 'owes-you' | 'neutral';

export interface BalanceListRowProps {
  /** The label showing the person who owes */
  fromLabel: string;
  /** The label showing the person being owed */
  toLabel: string;
  /** The amount of the debt */
  amount: number;
  /**
   * Perspective direction from the current user's point of view.
   * - 'you-owe': current user is `from` (red)
   * - 'owes-you': current user is `to` (green)
   * - 'neutral': neither user is the current user
   */
  direction: BalanceDirection;
  /** If provided, renders a button on the right */
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'secondary' | 'outline' | 'soft-success';
  };
  /** Optional onClick handler for the whole row */
  onClick?: () => void;
}

export function BalanceListRow({
  fromLabel,
  toLabel,
  amount,
  direction,
  action,
  onClick,
}: BalanceListRowProps) {
  const fromInitials = fromLabel.substring(0, 2).toUpperCase();
  const toInitials = toLabel.substring(0, 2).toUpperCase();

  const isSettled = amount === 0;

  const amountFormatted = isSettled ? '' : `$${amount.toFixed(2)}`;

  // Since we only display the other person's avatar now (by removing "You"),
  // the 'from' person is the one who owes, and the 'to' person is the one who is owed.
  // If direction is 'owes-you', they are 'from' (so fromFallbackClass should be green representing THEY owe money).
  // If direction is 'you-owe', they are 'to' (so toFallbackClass should be red representing THEY are owed money).

  const fromFallbackClass = isSettled
    ? 'bg-muted text-muted-foreground'
    : direction === 'owes-you'
      ? 'bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-500' // They owe you (positive)
      : direction === 'you-owe' ? 'bg-muted text-muted-foreground' // Neutral color if we somehow render it
        : 'bg-muted text-muted-foreground';

  const toFallbackClass = isSettled
    ? 'bg-muted text-muted-foreground'
    : direction === 'you-owe'
      ? 'bg-destructive/15 text-destructive dark:bg-destructive/10' // You owe them (negative)
      : direction === 'owes-you' ? 'bg-muted text-muted-foreground' // Neutral color if we somehow render it
        : 'bg-muted text-muted-foreground';

  const amountClass = isSettled
    ? 'text-muted-foreground'
    : direction === 'you-owe'
      ? 'text-destructive font-semibold'
      : direction === 'owes-you'
        ? 'text-green-600 font-semibold'
        : 'text-muted-foreground';

  let owesText: React.ReactNode;
  if (isSettled) {
    owesText = <span className="font-medium text-muted-foreground">Settled</span>;
  } else if (direction === 'you-owe') {
    owesText = (
      <>
        <span className="font-medium text-foreground">{toLabel}</span>
        <span className="text-muted-foreground text-[14px] ml-1.5">is owed</span>
      </>
    );
  } else if (direction === 'owes-you') {
    owesText = (
      <>
        <span className="font-medium text-foreground">{fromLabel}</span>
        <span className="text-muted-foreground text-[14px] ml-1.5">owes</span>
      </>
    );
  } else {
    owesText = (
      <>
        <span className="font-medium text-foreground">{fromLabel}</span>
        <span className="text-muted-foreground text-[14px] mx-1">owes</span>
        <span className="font-medium text-foreground">{toLabel}</span>
      </>
    );
  }

  return (
    <div
      data-testid="balance-list-row"
      className={`flex items-center justify-between py-2.5 px-3.5 mx-1 my-1 rounded-lg hover:bg-muted/50 transition-all duration-200 ${onClick ? 'cursor-pointer hover:scale-[1.01] hover:shadow-sm' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-2">
          {fromLabel.toLowerCase() !== 'you' && (
            <Avatar className="w-8 h-8 border-2 border-background shadow-sm z-10">
              <AvatarFallback className={`text-[11px] font-medium ${fromFallbackClass}`}>
                {fromInitials}
              </AvatarFallback>
            </Avatar>
          )}
          {toLabel.toLowerCase() !== 'you' && (
            <Avatar className="w-8 h-8 border-2 border-background shadow-sm z-0">
              <AvatarFallback className={`text-[11px] font-medium ${toFallbackClass}`}>
                {toInitials}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
        <div className="flex flex-col ml-1.5">
          <span className="text-[14px] tracking-tight">{owesText}</span>
          <span className={`text-[13px] font-medium tracking-tight mt-0.5 ${amountClass}`}>{amountFormatted}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {action && (
          <div className="shrink-0">
            <Button
              variant={action.variant === 'soft-success' ? 'secondary' : action.variant === 'outline' ? 'outline' : (action.variant ?? 'secondary')}
              size="sm"
              className={`h-7 px-3.5 text-[11px] font-medium min-w-[65px] rounded-full transition-all ${action.variant === 'default'
                ? 'bg-primary text-primary-foreground shadow-sm hover:shadow-md'
                : action.variant === 'soft-success'
                  ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-500 dark:hover:bg-emerald-500/20 shadow-none border-0'
                  : action.variant === 'outline'
                    ? 'shadow-sm'
                    : 'bg-secondary hover:bg-secondary/80 focus:ring-primary'
                }`}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
            >
              {action.label}
            </Button>
          </div>
        )}
        {onClick && (
          <div className="shrink-0 pl-1">
            <ChevronRight className="w-4 h-4 text-muted-foreground opacity-50" />
          </div>
        )}
      </div>
    </div>
  );
}
