import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/hooks/usePlatform';
import { usePlanCardModel } from '@/hooks/usePlanCardModel';
import { IOS_STORE_URL, PLAY_STORE_URL } from '@/utils/storeLinks';

/**
 * The upgrade call-to-action at the very top of Settings → Profile (owner's
 * placement, 2026-10-13). The plan details stay in `SubscriptionCard` lower
 * down.
 *
 * Free users only, and only once everything has settled with the paywall on —
 * `showUpgrade` is false for Pro and Trip Pass, and the model is `null` while
 * loading or while the kill switch is dark.
 *
 * On web the subscription cannot be sold (Guideline 3.1.1), so the same slot
 * points at the store apps instead of a purchase button.
 */
export function UpgradeCta() {
  const navigate = useNavigate();
  const { isNative } = usePlatform();
  const model = usePlanCardModel();

  if (!model?.showUpgrade) return null;

  if (isNative) {
    return (
      <Button className="w-full" onClick={() => navigate('/upgrade')}>
        <Sparkles className="w-4 h-4 mr-2" />
        Upgrade to Pro
      </Button>
    );
  }

  return (
    <p className="text-sm text-muted-foreground text-center">
      Pro is available in the{' '}
      <a href={IOS_STORE_URL} target="_blank" rel="noopener noreferrer" className="underline">
        iOS app
      </a>{' '}
      and the{' '}
      <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="underline">
        Android app
      </a>
      .
    </p>
  );
}
