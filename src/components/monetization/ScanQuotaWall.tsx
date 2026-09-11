import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/hooks/usePlatform';
import { formatResetDate, type DisclosureLevel } from '@/utils/quotaDisclosure';

interface Props {
  /**
   * The disclosure level in force. Anything but `'wall'` renders nothing —
   * see the note on self-gating below.
   */
  level: DisclosureLevel;
  /** The limit actually in force, from Remote Config. Never hardcode 2. */
  limit: number;
  /** UTC month boundary. An unusable value drops the date rather than faking one. */
  resetsAtMs: number;
  /**
   * Where to send someone who wants to keep working without a scan. OMITTED
   * deliberately by call sites that have no manual-entry affordance to offer
   * (the dialog raised from a server cap race can sit over such a screen), and
   * the button is then not rendered at all — a button that does nothing is
   * worse than no button.
   */
  onAddManually?: () => void;
  /**
   * Opens the upgrade path. OPTIONAL for the same reason `onAddManually` is,
   * and the rule is not negotiable in one direction and waived in the other: a
   * button that silently does nothing is worse than no button. `/upgrade` does
   * not exist until Task 3.4, so no call site supplies this yet and the wall
   * renders without an upsell — which it can do, because the escape hatch is
   * its actual job and the copy carries the rest.
   */
  onSeePro?: () => void;
  className?: string;
}

/**
 * What replaces the scan CTA once the free monthly quota is gone.
 *
 * SELF-GATING ON `level`, rather than trusting call sites to render it only at
 * the wall. The failure this prevents is not a cosmetic one: `level` is
 * `'hidden'` for the entire window in which a Pro subscriber's entitlement is
 * still in flight (see `useScanDisclosure`), so a call site that rendered this
 * on its own `remaining === 0` test would put an upgrade wall in front of
 * someone who had just paid. Making the component itself refuse to draw at any
 * other level means that bug cannot be written at a call site.
 *
 * THE ESCAPE HATCH IS THE POINT. The wall's job is not to sell — it is to say
 * plainly that the AI scan is spent and that the bill can still be split by
 * hand. Manual entry is the primary action and is listed first; Pro is the
 * secondary.
 */
export function ScanQuotaWall({
  level,
  limit,
  resetsAtMs,
  onAddManually,
  onSeePro,
  className = '',
}: Props) {
  const { isNative } = usePlatform();

  if (level !== 'wall') return null;

  // Agrees with the LIMIT here, not with remaining: this sentence counts what
  // was spent ("all 1 free AI scan"), and `resolveLimit` permits a limit of 1.
  const noun = limit === 1 ? 'scan' : 'scans';
  const reset = formatResetDate(resetsAtMs);

  return (
    /*
      NO CARD CHROME OF ITS OWN. Both call sites render this inside a
      `DialogContent`, which already supplies the panel, border and padding —
      wrapping it in a second bordered box drew a box inside a box. Kept as a
      plain block so the dialog owns the frame.
    */
    /* `pr-6` on the heading, not the wrapper: DialogContent's close X is
       absolutely positioned at right-4 top-4, and at 360px this sentence wraps
       with its first line running under it. */
    <div className={`text-center space-y-3 ${className}`}>
      <div className="space-y-1">
        <p className="font-semibold responsive-text-sm pr-6">
          You have 0 free AI scans left this month.
        </p>
        <p className="text-caption-responsive text-muted-foreground">
          {`You've used all ${limit} free AI ${noun} this month. `}
          {reset ? `They reset ${reset}. ` : ''}
          Upgrade to Pro for unlimited scans, or add items by hand.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-center">
        {onAddManually && (
          <Button variant="outline" size="sm" onClick={onAddManually}>
            Add items manually
          </Button>
        )}
        {onSeePro && (
          <Button size="sm" onClick={onSeePro}>
            <Sparkles className="mr-2 h-4 w-4" />
            {/* A web build cannot sell the subscription (Guideline 3.1.1), so
                "See Pro" there would lead to a page whose only message is "not
                here". Name the place the purchase actually lives. */}
            {isNative ? 'Upgrade to Pro' : 'Get Pro in the app'}
          </Button>
        )}
      </div>
    </div>
  );
}
