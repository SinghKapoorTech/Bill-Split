import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft, Clock } from 'lucide-react';
import { UserAvatar } from '@/components/shared/UserAvatar';
import { motion, useMotionValue, useTransform, useAnimate, PanInfo } from 'framer-motion';
import { useIsMobile } from '@/hooks/use-mobile';
import { balanceDir, balanceRow } from '@/lib/styles';

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
  const [scope, animate] = useAnimate();

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!scope.current) return;
    if (info.offset.x < -80 && action) {
      animate(scope.current, { x: 0 }, { type: 'spring', stiffness: 400, damping: 30 });
      action.onClick();
    } else {
      animate(scope.current, { x: 0 }, { type: 'spring', stiffness: 400, damping: 30 });
    }
  };

  const friendLabel = direction === 'you-owe' ? toLabel : fromLabel;

  const isSettled = amount === 0;
  const amountFormatted = isSettled ? '' : `$${amount.toFixed(2)}`;

  // When settled, treat as neutral so direction tokens degrade gracefully
  const effectiveDir = isSettled ? 'neutral' : direction;

  const friendFallbackClass = balanceDir.fallback[effectiveDir];
  const accentBorderColor   = balanceDir.accentBorder[effectiveDir];
  const directionBadgeClass = balanceDir.badge[effectiveDir];

  // Direction indicator icon
  const directionIcon = direction === 'you-owe'
    ? <ArrowUpRight className="w-3 h-3" />
    : direction === 'owes-you'
      ? <ArrowDownLeft className="w-3 h-3" />
      : null;

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
        rounded-xl border-l-[3px]
        glass-card shadow-md hover:shadow-lg hover:bg-muted/30 transition-all
        ${onClick ? 'cursor-pointer' : ''}
      `}
      style={{ borderLeftColor: accentBorderColor }}
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
              <span className={balanceRow.status}>
                {statusText}
              </span>
              {pendingIndicator}
            </div>
            <span className={`${balanceRow.name} mt-0.5`}>
              {friendLabel}
            </span>
          </>
        ) : (
          <>
            <span className={balanceRow.name}>
              {friendLabel}
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              {directionIcon && (
                <span className={`${directionBadgeClass} rounded-full p-0.5`}>
                  {directionIcon}
                </span>
              )}
              <span className={`${balanceRow.status} capitalize`}>
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
          <span className="text-lg font-bold tabular-nums tracking-tight text-primary">
            {amountFormatted}
          </span>
        )}
        {action && (
          <Button
            variant={action.variant ?? 'secondary'}
            size="sm"
            className={`h-8 px-3.5 text-xs font-semibold rounded-full ${balanceDir.action[effectiveDir]}`}
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
          className={`absolute right-0 top-0 bottom-0 flex items-center justify-center px-6 rounded-r-xl ${balanceDir.swipePanel[effectiveDir]}`}
          style={{ opacity: actionOpacity, scale: actionScale }}
        >
          <span className="text-sm font-semibold">{action.label}</span>
        </motion.div>

        {/* Draggable row */}
        <motion.div
          ref={scope}
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
