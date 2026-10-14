import { useNavigate } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import { usePlatform } from '@/hooks/usePlatform';
import { usePlanCardModel } from '@/hooks/usePlanCardModel';
import { IOS_STORE_URL, PLAY_STORE_URL } from '@/utils/storeLinks';

/**
 * The upgrade banner at the very top of Settings → Profile (owner's
 * placement, 2026-10-13). It is the only plan UI in Settings: the owner removed
 * the separate Plan card. Restore purchases lives on /upgrade (UpgradeView).
 *
 * Free users only, and only once everything has settled with the paywall on —
 * `showUpgrade` is false for Pro and Trip Pass, and the model is `null` while
 * loading or while the kill switch is dark.
 *
 * COPY: Pro is sold as "no limits", not as extra features (AI-sim learnings,
 * master plan §2b). No trial claim here: the 14-day trial only exists once the
 * store products do, and promising it before then would be false.
 *
 * On web the subscription cannot be sold (Guideline 3.1.1), so the banner is
 * informational and points at the store apps instead of /upgrade.
 */
export function UpgradeCta() {
  const navigate = useNavigate();
  const { isNative } = usePlatform();
  const model = usePlanCardModel();

  if (!model?.showUpgrade) return null;

  const shell =
    'w-full flex items-center gap-3 rounded-xl border border-primary/30 p-3 text-left ' +
    'bg-gradient-to-r from-primary/20 via-primary/10 to-transparent';

  const badge = (
    <span className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0">
      <Sparkles className="w-5 h-5" />
    </span>
  );

  if (isNative) {
    return (
      <button
        type="button"
        onClick={() => navigate('/upgrade')}
        className={`${shell} hover:border-primary/60 transition-colors`}
        aria-label="Upgrade to Pro"
      >
        {badge}
        <span className="flex-1 min-w-0">
          <span className="block font-semibold text-foreground">Go unlimited with Pro</span>
          <span className="block text-xs text-muted-foreground">Unlimited AI scans and groups</span>
        </span>
        <ChevronRight className="w-5 h-5 text-primary shrink-0" />
      </button>
    );
  }

  return (
    <div className={shell}>
      {badge}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">Go unlimited with Pro</p>
        <p className="text-xs text-muted-foreground">
          Get it in the{' '}
          <a href={IOS_STORE_URL} target="_blank" rel="noopener noreferrer" className="underline">
            iOS app
          </a>{' '}
          or the{' '}
          <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer" className="underline">
            Android app
          </a>
          .
        </p>
      </div>
    </div>
  );
}
