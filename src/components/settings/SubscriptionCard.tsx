import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { usePlatform } from '@/hooks/usePlatform';
import { usePlanCardModel } from '@/hooks/usePlanCardModel';

/**
 * Settings → Plan: which plan is in force and what it allows (TP Task 3.3).
 *
 * Every decision about WHAT to say is in `planCardModel` (pure, unit-tested),
 * gathered by `usePlanCardModel`. The card renders nothing while anything
 * loads or while the `paywall_enabled` kill switch is dark.
 *
 * The upgrade call-to-action is NOT here: the owner placed it at the very top
 * of Settings → Profile (`UpgradeCta`).
 *
 * PURCHASES ARE NOT WIRED YET (Phase 4):
 *   - "Restore purchases" is native-only and rendered DISABLED with a caption,
 *     not hidden — the control's presence is part of what review looks for,
 *     but a live button that does nothing would be a lie.
 *   - "Manage subscription" is omitted entirely until there is something to
 *     manage (`Purchases.showManageSubscriptions()` arrives with the SDK).
 */
export function SubscriptionCard() {
  const { isNative } = usePlatform();
  const model = usePlanCardModel();

  if (!model) return null;

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-foreground">Plan</h3>
            <span className="text-[11px] font-medium rounded-full px-2 py-0.5 bg-primary/10 text-primary">
              {model.planLabel}
            </span>
            {model.planDetail && (
              <span className="text-xs text-muted-foreground">{model.planDetail}</span>
            )}
          </div>
          <ul className="text-sm text-muted-foreground mt-2 space-y-1">
            <li>{model.scansLine}</li>
            <li>{model.groupsLine}</li>
          </ul>
        </div>
      </div>

      {isNative && (
        // A caption, NOT a tooltip: this block only renders on native, and
        // Radix Tooltip ignores touch, so a tooltip here would never be seen.
        <div className="flex flex-col items-center mt-3">
          <Button variant="ghost" size="sm" disabled aria-describedby="restore-note">
            Restore purchases
          </Button>
          <p id="restore-note" className="text-xs text-muted-foreground">
            Available once in-app purchases go live
          </p>
        </div>
      )}
    </Card>
  );
}
