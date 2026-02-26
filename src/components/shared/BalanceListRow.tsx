import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

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
    variant?: 'default' | 'secondary';
  };
}

export function BalanceListRow({
  fromLabel,
  toLabel,
  amount,
  direction,
  action,
}: BalanceListRowProps) {
  const fromInitials = fromLabel.substring(0, 2).toUpperCase();
  const toInitials = toLabel.substring(0, 2).toUpperCase();

  const amountFormatted = `$${amount.toFixed(2)}`;

  const fromFallbackClass =
    direction === 'you-owe'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-muted text-muted-foreground';

  const toFallbackClass =
    direction === 'owes-you'
      ? 'bg-green-500/10 text-green-600'
      : 'bg-muted text-muted-foreground';

  const amountClass =
    direction === 'you-owe'
      ? 'text-destructive font-semibold'
      : direction === 'owes-you'
      ? 'text-green-600 font-semibold'
      : 'text-muted-foreground';

  let owesText: React.ReactNode;
  if (direction === 'you-owe') {
    owesText = (
      <>
        <span className="font-medium text-foreground">You</span>
        <span className="text-muted-foreground text-[13px] mx-1">owe</span>
        <span className="font-medium text-foreground">{toLabel}</span>
      </>
    );
  } else if (direction === 'owes-you') {
    owesText = (
      <>
        <span className="font-medium text-foreground">{fromLabel}</span>
        <span className="text-muted-foreground text-[13px] mx-1">owes</span>
        <span className="font-medium text-foreground">you</span>
      </>
    );
  } else {
    owesText = (
      <>
        <span className="font-medium text-foreground">{fromLabel}</span>
        <span className="text-muted-foreground text-[13px] mx-1">owes</span>
        <span className="font-medium text-foreground">{toLabel}</span>
      </>
    );
  }

  return (
    <div className="flex items-center justify-between py-2.5 px-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-center gap-2.5">
        <div className="flex -space-x-2">
          <Avatar className="w-8 h-8 border-2 border-background shadow-sm z-10">
            <AvatarFallback className={`text-xs ${fromFallbackClass}`}>
              {fromInitials}
            </AvatarFallback>
          </Avatar>
          <Avatar className="w-8 h-8 border-2 border-background shadow-sm z-0">
            <AvatarFallback className={`text-xs ${toFallbackClass}`}>
              {toInitials}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="flex flex-col">
          <span className="text-sm">{owesText}</span>
          <span className={`text-xs ${amountClass}`}>{amountFormatted}</span>
        </div>
      </div>

      {action && (
        <div className="shrink-0 pl-2">
          <Button
            variant={action.variant ?? 'secondary'}
            size="sm"
            className={`h-7 px-3 text-xs w-[68px] rounded-full ${
              action.variant === 'default' ? 'bg-primary text-primary-foreground' : ''
            }`}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </div>
      )}
    </div>
  );
}
