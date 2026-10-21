import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProBadgeProps {
  /** Defaults to "Pro" (rendered uppercase). */
  label?: string;
  className?: string;
}

/**
 * The small gold "PRO" pill. Same gold gradient as the purchase celebration's
 * badge, so the two read as one identity.
 */
export function ProBadge({ label = 'Pro', className }: ProBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#F2C94C] to-[#C9822B]',
        'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#2A2116] shadow-sm',
        className,
      )}
    >
      <Sparkles className="h-3 w-3" strokeWidth={2.4} aria-hidden />
      {label}
    </span>
  );
}
