import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/hooks/usePlatform';

interface Props {
  /**
   * From `useGroupCap`. Anything else renders nothing — see the note on
   * self-gating below.
   */
  atCap: boolean;
  /** Groups the user actually owns and has not archived. */
  activeCount: number;
  /** The cap in force, from Remote Config. Never hardcode 2. */
  limit: number;
  /**
   * Sends the user somewhere they can archive a group. OPTIONAL: a call site
   * with no archive affordance on screen omits it and the button is dropped
   * rather than rendered as a no-op.
   */
  onArchive?: () => void;
  /** Opens the upgrade path. Optional for the same reason. */
  onSeePro?: () => void;
  className?: string;
}

/**
 * The active-group cap modal — the group-side twin of `ScanQuotaWall`, and
 * deliberately identical in shape.
 *
 * SELF-GATING ON `atCap`, rather than trusting call sites. `useGroupCap` sets
 * `atCap` false while ANYTHING is still loading, false for a Pro subscriber,
 * and false while the `paywall_enabled` kill switch is dark — so a call site
 * that tested `activeCount >= limit` itself would block users the server would
 * happily serve. That is not hypothetical: the hook itself used to open-code
 * that comparison and lost the kill-switch term, which gave free users a dead
 * Create button with no copy during the exact dark-launch state prod is in.
 *
 * The headline states what the user HAS, not "N of M": a cap tightened
 * underneath them then reads "You have 3 active groups." — true, and free of
 * the "3 of 2" self-contradiction. `limit` is stated separately in the line
 * below, which is what keeps the message self-explanatory at any count.
 */
export function GroupCapWall({
  atCap,
  activeCount,
  limit,
  onArchive,
  onSeePro,
  className = '',
}: Props) {
  const { isNative } = usePlatform();

  if (!atCap) return null;

  const noun = activeCount === 1 ? 'group' : 'groups';

  return (
    <div className={`text-center space-y-3 ${className}`}>
      <div className="space-y-1">
        {/* `pr-6`: DialogContent's close X is absolutely positioned at
            right-4 top-4, and this line runs under it on a narrow phone. */}
        <p className="font-semibold responsive-text-sm pr-6">
          You have {activeCount} active {noun}.
        </p>
        <p className="text-caption-responsive text-muted-foreground">
          {/* The limit is what makes the sentence explain itself. Without it a
              user sitting at 3 under a cap that was tightened to 2 reads "You
              have 3 active groups." and is told to archive one, with nothing
              saying how many they are allowed — the server's own message
              ("...and the free plan includes 2") does carry it. */}
          Your free plan includes {limit}. Archive one you&apos;re finished with, or go unlimited
          with Pro.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {onArchive && (
          <Button variant="outline" size="sm" onClick={onArchive}>
            Archive a group
          </Button>
        )}
        {onSeePro && (
          <Button size="sm" onClick={onSeePro}>
            <Sparkles className="mr-2 h-4 w-4" />
            {/* A web build cannot sell the subscription (Guideline 3.1.1). */}
            {isNative ? 'Upgrade to Pro' : 'Get Pro in the app'}
          </Button>
        )}
      </div>
    </div>
  );
}
