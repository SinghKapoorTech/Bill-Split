import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';
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
  /** Whether the current user has a pending outgoing settlement request */
  pendingOutgoing?: boolean;
  /** Whether the current user has a pending incoming settlement request */
  pendingIncoming?: boolean;
}

export function BalanceListRow({
  fromLabel,
  toLabel,
  amount,
  direction,
  friendPhotoURL,
  action,
  onClick,
  pendingOutgoing,
  pendingIncoming,
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
      ? 'bg-red-500/10 text-red-500 dark:bg-red-500/15 dark:text-red-400'
      : direction === 'owes-you'
        ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
        : 'bg-muted text-muted-foreground';

  // Direction indicator icon & colors
  const directionIcon = direction === 'you-owe'
    ? <ArrowUpRight className="w-3 h-3" />
    : direction === 'owes-you'
      ? <ArrowDownLeft className="w-3 h-3" />
      : null;

  const accentColor = isSettled
    ? 'border-l-muted-foreground/20'
    : direction === 'you-owe'
      ? 'border-l-red-500 dark:border-l-red-400'
      : direction === 'owes-you'
        ? 'border-l-emerald-500 dark:border-l-emerald-400'
        : 'border-l-muted-foreground/20';

  const amountColor = isSettled
    ? 'text-muted-foreground'
    : direction === 'you-owe'
      ? 'text-red-600 dark:text-red-400'
      : direction === 'owes-you'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground';

  const directionBadgeClass = isSettled
    ? 'bg-muted/60 text-muted-foreground'
    : direction === 'you-owe'
      ? 'bg-red-500/8 text-red-600 dark:bg-red-500/15 dark:text-red-400'
      : direction === 'owes-you'
        ? 'bg-emerald-500/8 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
        : 'bg-muted/60 text-muted-foreground';

  let statusText: string;
  if (isSettled) {
    statusText = 'settled up';
  } else if (direction === 'you-owe') {
    statusText = 'You owe';
  } else if (direction === 'owes-you') {
    statusText = 'owes you';
  } else {
    statusText = `owes ${toLabel}`;
  }

  let pendingIndicator: React.ReactNode = null;
  if (pendingOutgoing) {
    pendingIndicator = (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 dark:bg-amber-500/15 rounded-full px-2 py-0.5">
        <Clock className="w-2.5 h-2.5" />
        Requested
      </span>
    );
  } else if (pendingIncoming) {
    pendingIndicator = (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-500/15 rounded-full px-2 py-0.5">
        Requested
      </span>
    );
  }

  const rowContent = (
    <div
      data-testid="balance-list-row"
      className={`
        group relative flex items-center gap-3 h-[72px] px-3
        rounded-xl border-l-[3px] ${accentColor}
        glass-card shadow-md hover:shadow-lg hover:bg-muted/30 transition-all
        ${onClick ? 'cursor-pointer' : ''}
      `}
      onClick={onClick}
    >
      {/* Avatar */}
      <UserAvatar
        name={friendLabel}
        photoURL={friendPhotoURL}
        size="sm"
        className="border-2 border-background shadow-sm shrink-0"
        fallbackClassName={friendFallbackClass}
      />

      {/* Name + status */}
      <div className="flex flex-col min-w-0 flex-1">
        {direction === 'you-owe' && !isSettled ? (
          <>
            <div className="flex items-center gap-1.5">
              {directionIcon && (
                <span className={`${directionBadgeClass} rounded-full p-0.5`}>
                  {directionIcon}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                {statusText}
              </span>
              {pendingIndicator}
            </div>
            <span className="text-[15px] font-semibold text-foreground truncate leading-tight mt-0.5">
              {friendLabel}
            </span>
          </>
        ) : (
          <>
            <span className="text-[15px] font-semibold text-foreground truncate leading-tight">
              {friendLabel}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {directionIcon && (
                <span className={`${directionBadgeClass} rounded-full p-0.5`}>
                  {directionIcon}
                </span>
              )}
              <span className="text-xs text-muted-foreground capitalize">
                {statusText}
              </span>
              {pendingIndicator}
            </div>
          </>
        )}
      </div>

      {/* Amount + action */}
      <div className="flex items-center gap-2.5 shrink-0">
        {!isSettled && (
          <span className={`text-lg font-bold tabular-nums tracking-tight ${amountColor}`}>
            {amountFormatted}
          </span>
        )}
        {action && (
          <Button
            variant={action.variant ?? 'secondary'}
            size="sm"
            className={`
              h-8 px-3.5 text-xs font-semibold rounded-full
              ${direction === 'you-owe'
                ? 'bg-red-500 hover:bg-red-600 text-white border-none shadow-sm shadow-red-500/20'
                : 'bg-emerald-500 hover:bg-emerald-600 text-white border-none shadow-sm shadow-emerald-500/20'
              }
            `}
            onClick={(e) => {
              e.stopPropagation();
              (e.currentTarget as HTMLElement).blur();
              action.onClick();
            }}
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );

  // On mobile with an action, enable swipe-to-reveal
  if (isMobile && action) {
    return (
      <div className="relative overflow-x-clip rounded-xl">
        {/* Action revealed behind the row */}
        <motion.div
          className={`absolute right-0 top-0 bottom-0 flex items-center justify-center px-6 rounded-r-xl ${
            direction === 'you-owe' ? 'bg-red-500 text-white' : 'bg-emerald-600 text-white'
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
