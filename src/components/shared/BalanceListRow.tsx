import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { motion, useMotionValue, useTransform, PanInfo } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';

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
  /** Photo URL for the friend avatar */
  friendPhotoURL?: string;
  /** Optional onClick handler for the whole row */
  onClick?: () => void;
}

export function BalanceListRow({
  fromLabel,
  toLabel,
  amount,
  direction,
  friendPhotoURL,
  action,
  onClick,
}: BalanceListRowProps) {
  const isMobile = useIsMobile();
  const x = useMotionValue(0);
  const actionOpacity = useTransform(x, [-100, -40, 0], [1, 0.5, 0]);
  const actionScale = useTransform(x, [-100, -40, 0], [1, 0.8, 0.5]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -80 && action) {
      action.onClick();
    }
  };

  const isYouFrom = fromLabel.toLowerCase() === 'you';
  const friendLabel = isYouFrom ? toLabel : fromLabel;

  const isSettled = amount === 0;

  const amountFormatted = isSettled ? '' : `$${amount.toFixed(2)}`;

  const friendFallbackClass = isSettled
    ? 'bg-muted text-muted-foreground'
    : direction === 'you-owe'
      ? 'bg-destructive/10 text-destructive'
      : direction === 'owes-you'
        ? 'bg-green-500/10 text-green-600'
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
    const displayFrom = fromLabel.toLowerCase() === 'you' ? 'You' : fromLabel;
    const displayTo = toLabel.toLowerCase() === 'you' ? 'You' : toLabel;

    owesText = (
      <>
        <span className="font-medium text-foreground">{displayFrom}</span>
        <span className="text-muted-foreground text-[13px] mx-1">and</span>
        <span className="font-medium text-foreground">{displayTo}</span>
        <span className="font-medium text-muted-foreground text-[13px] ml-1">are Settled Up</span>
      </>
    );
  } else if (direction === 'you-owe') {
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

  const rowContent = (
    <div
      data-testid="balance-list-row"
      className={`flex items-center justify-between h-[72px] px-3 glass-card rounded-xl hover:bg-muted/30 transition-colors ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2.5">
        <UserAvatar
          name={friendLabel}
          photoURL={friendPhotoURL}
          size="sm"
          className="border-2 border-background shadow-sm"
          fallbackClassName={friendFallbackClass}
        />
        <div className="flex flex-col">
          <span className="text-sm">{owesText}</span>
          <span className={`text-xs ${amountClass}`}>{amountFormatted}</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {action && (
          <div className="shrink-0">
            <Button
              variant={action.variant ?? 'secondary'}
              size="sm"
              className={`h-7 px-3 text-xs w-[68px] rounded-full ${action.variant === 'default' ? 'bg-primary text-primary-foreground' : ''
                }`}
              onClick={(e) => {
                e.stopPropagation();
                (e.currentTarget as HTMLElement).blur();
                action.onClick();
              }}
            >
              {action.label}
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  // On mobile with an action, enable swipe-to-reveal
  if (isMobile && action) {
    return (
      <div className="relative overflow-hidden rounded-xl">
        {/* Action revealed behind the row */}
        <motion.div
          className={`absolute right-0 top-0 bottom-0 flex items-center justify-center px-6 rounded-r-xl ${
            direction === 'you-owe' ? 'bg-primary text-primary-foreground' : 'bg-green-600 text-white'
          }`}
          style={{ opacity: actionOpacity, scale: actionScale }}
        >
          <span className="text-sm font-semibold">{action.label}</span>
        </motion.div>

        {/* Draggable row */}
        <motion.div
          style={{ x }}
          drag="x"
          dragConstraints={{ left: -100, right: 0 }}
          dragElastic={0.1}
          onDragEnd={handleDragEnd}
        >
          {rowContent}
        </motion.div>
      </div>
    );
  }

  return rowContent;
}
